#!/usr/bin/python
import MySQLdb
from math import log
from datetime import datetime
import cherrypy
import sys



def connect(thread_index):
    cherrypy.thread_data.db = MySQLdb.connect("sql.mit.edu", "paulfc", "guk38qaq", "paulfc+bets")

cherrypy.engine.subscribe('start_thread', connect)

def wrapXML(name, val):
    return "<" + name + ">" + val + "</" + name + ">"

def dictionaryToXML(name, toDescribe):
    result = ""
    for key,value in toDescribe.items():
        result += "<" + key +">"+ str(value) + "</" + key + ">"
    return wrapXML(name, result)


def getTopic(topicID):
    cursor = cherrypy.thread_data.db.cursor()
    cursor.execute("SELECT owner, description, age, resolved, bounty, maxstake, currentbet, lastmodified, lastmodifiedby, definition, closes FROM topics " + 
                    "WHERE id = %s", (topicID,))
    row = cursor.fetchone()
    return dictionaryToXML('topic', {'id':topicID, 'owner':row[0],'description':row[1],
        'age':row[2], 'resolved':row[3], 'bounty':row[4], 'maxstake':row[5], 'currentbet':row[6], 
        'lastbettime':row[7], 'lastbetter':row[8], 'definition':row[9], 'closes':row[10]})

def getUser(username):
    cursor = cherrypy.thread_data.db.cursor()
    cursor.execute("SELECT reputation FROM users " +
                   "WHERE name = %s", (username,))
    row = cursor.fetchone()
    cursor.close()
    return dictionaryToXML('user', {'name':username, 'reputation':row[0]});

def rowToTopic(row):
    result = {}
    topicProperties = ['owner', 'description', 'age', 'id', 'resolved', 'bounty', 'maxstake', 
        'currentbet', 'lastbettime', 'lastbetter', 'definition', 'domain', 'closes']
    for i, prop in enumerate(topicProperties):
        result[prop] = row[i]
    return result

def topicXML(row):
    return dictionaryToXML('topic', rowToTopic(row))

def executeSearch(search):
    cursor = cherrypy.thread_data.db.cursor()
    cursor.execute(" SELECT * FROM topics"
                   " WHERE domain=%s and resolved=0 "
                   " ORDER BY age DESC", (search,))
    result = "<query>%s</query>" % (search,)
    while True:
        row = cursor.fetchone()
        if row == None:
            break
        result += topicXML(row)
    cursor.close()
    return wrapXML("search", result)

def submitTopic(user, probability, bounty, maxstake, description, definition, domain, closes):
    cursor = cherrypy.thread_data.db.cursor()
    cursor.execute("INSERT INTO topics (owner,bounty,maxstake,description, definition, domain, closes) "+
                   "VALUES (%s, %s, %s, %s, %s, %s, %s)", (user, bounty, maxstake, description, definition, domain, closes))
    topicID = cherrypy.thread_data.db.insert_id()
    insertBet(user, probability, topicID)

def insertBet(user, probability, topicID):
    cursor.execute(" INSERT INTO all_bets (user, probability, topicID)"
                 + " VALUES (%s, %s, %s)", (user, probability, topicID));
    cursor.execute(" UPDATE topics "+
                   " SET currentbet=%s, lastmodified=CURRENT_TIMESTAMP,lastmodifiedby=%s "+
                   " WHERE id=%s", (probability, user, topicID))
    cursor.close()

def parseDate(s):
    return datetime.strptime(s, "%Y-%m-%d %H:%M:%S")

def makeBet(user, probability, topicID,lastbettime):
    cursor = cherrypy.thread_data.db.cursor()
    cursor.execute("SELECT reputation FROM users WHERE name = %s", (user,))
    row = cursor.fetchone()
    reputation = row[0]
    cursor.execute("SELECT bounty, maxstake, lastmodified FROM topics WHERE id = %s", (topicID,))
    row = cursor.fetchone()
    if row[2] != parseDate(lastbettime):
        return "<makebet><response>interveningbet</response> <usertime>%s</usertime> <servertime>%s</servertime> </makebet>" % (lastbettime, row[2]);
    bounty = row[0]
    maxstake = row[1] * reputation
    stakes = getStake(topicID, bounty, user)
    stake = stakes[0]
    if (stakes[1] > stake):
        stake = stakes[1]
    if (stake > maxstake):
        return "<makebet><response>toorisky</response><stake>%f</stake><maxstake>%f</maxstake></makebet>" % (stake, maxstake)
    insertBet(user, probability, topicID)
    cursor.close()
    return "<makebet><response>success</response></makebet>"

def resolveBet(topicID, outcome):
    cursor = cherrypy.thread_data.db.cursor()
    cursor.execute("SELECT resolved, bounty FROM topics WHERE id=%s", (topicID,))
    row = cursor.fetchone()
    if (row == None) or (row[0] == 1):
        return
    bounty = row[1]
    cursor.execute("UPDATE topics SET resolved=1 WHERE id=%s", (topicID,))
    cursor.execute("SELECT user, probability FROM all_bets WHERE topicID=%s", (topicID,))
    rows = cursor.fetchall()
    rows = list(rows)
    rows.append(rows[0])
    probability = rows[0][1]
    if not outcome:
        proability = 1 - probability;
    reputationChanges = {}
    for row in rows:
        if not (row[0] in reputationChanges):
            reputationChanges[row[0]] = 0
        newProbability = row[1]
        if not outcome:
            newProbability = 1 - newProbability
        reputationChanges[row[0]] = reputationChanges[row[0]] + bounty * (log(newProbability) - log(probability))
        probability = newProbability
    for user in reputationChanges:
        cursor.execute("SELECT reputation FROM users WHERE name=%s", (user,))
        row = cursor.fetchone()
        reputation = row[0]
        cursor.execute("UPDATE users SET reputation=%s WHERE name=%s", (reputation + reputationChanges[user], user))
    cursor.close()
        

def getStake(topicID, bounty, user):
    cursor = cherrypy.thread_data.db.cursor()
    cursor.execute("SELECT user, probability FROM all_bets WHERE topicID=%s", (topicID,))
    rows = cursor.fetchall()
    rows = list(rows)
    rows.append(rows[0])
    probability = rows[0][1]
    result = [0, 0]
    for row in rows:
        newProbability = row[1]
        if row[0]==user:
            result[0] = result[0] + bounty * (log(newProbability) - log(probability))
            result[1] = result[0] + bounty * (log(1 - newProbability) - log(1 - probability))
        probability = newProbability
    cursor.close()
    return result

def getHistory(topicID):
    cursor =  cherrypy.thread_data.db.cursor()
    cursor.execute(" SELECT user, probability, time FROM all_bets "+
                   " WHERE topicID = %s " +
                   " ORDER BY time ASC", (topicID))
    result = "<id>" + topicID + "</id>"
    while True:
        row = cursor.fetchone()
        if row == None:
            break
        result += "<bet> <user>%s</user> <probability>%f</probability> <time>%s</time> </bet>" % (row[0], row[1], row[2])
    cursor.close()
    return wrapXML("history", result);

def executeLogin(username, password):
    cursor = cherrypy.thread_data.db.cursor()
    cursor.execute("SELECT password, reputation FROM users " + 
                   "WHERE name = %s", (username,))
    row = cursor.fetchone()
    cursor.close()
    if row == None:
        return "<login>nosuchuser</login>"
    elif row[0] != password:
        return "<login>wrongpassword</login>"
    else:
        return "<login>success</login>";

def executeSignup(username, password):
    cursor = cherrypy.thread_data.db.cursor()
    cursor.execute("SELECT name FROM users " + 
                   "WHERE name = %s", (username,))
    row = cursor.fetchone()
    if row != None:
        cursor.close()
        return "<signup>usernametaken</signup>"
    elif len(username) < 3:
        cursor.close()
        return "<signup>shortusername</signup>"
    elif len(password) < 3:
        cursor.close()
        return "<signup>shortpassword</signup>"
    else:
        cursor.execute("INSERT INTO users (name, password) " + 
                       "VALUES (%s, %s)", (username, password))
        cursor.close()
        return "<signup> success </signup>"

class HelloWorld:
    def index(self):
        return """ 
<!DOCTYPE HTML PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd">
<html>
	<head>
		<meta http-equiv="Content-Type" content="text/html; charset=iso-8859-1" />
		<title>Reputation-Based Prediction Market</title>
		<link type="text/css" href="jquery-ui-1.8.11.custom.css" rel="stylesheet" />	
		<link type="text/css" href="style.css" rel="stylesheet" />	
		<script type="text/javascript" src="jquery-1.5.1.min.js"></script>
		<script type="text/javascript" src="jquery.ui.timepicker.js"></script>
		<script type="text/javascript" src="jquery-ui-1.8.11.custom.min.js"></script>
		<script type="text/javascript" src="jquery.ba-bbq.js"></script>
		<script type="text/javascript" src="script.js"> </script>
		<script type="text/javascript" src="cookie.js"> </script>
<script type="text/javascript">

</script>
	</head>
	<body>
    <div id='wrapper'>
    <div>
        <ul id="navbar">
            <li><a href="#" id="recentclaimsnavbar" >Recent Claims</a></li> 
            <!-- <li> <a onClick="loadRecentBets()" href="#" id="recentbets">Recent Bets</a> </li>
            <li> <a onClick="loadAccount()" href="#" id="account">Account</a> </li> 
            <li> <a onClick="searchFor('asdf')" href="#" id="search">Search</a> </li>-->
            <li> <a href="#submitclaim" id="submitclaimnavbar">Submit Claim</a> </li>
        </ul>
    </div>
    <div id="sidebar">
    </div>
    <div id="mainbox"> 
    <div id="alertbox">
    </div>
    <div id='mainframe'>
    </div>
    </div>
    </div>
  </body>
</html>
    """
    def query(self, topic=None, user=None, search=None, submitclaim=None, makeBet=None, 
            probability=None, maxstake=None, description=None, definition=None, domain=None,
            closes=None, bounty=None, lastbettime=None, resolvebet=None, outcome=None,
            makebet=None,password=None, login=None, signup=None):
        #result = "Content-type:xml\n"
        result = ""
        result += "<body>"
        try:
            if submitclaim!=None:
                result += submitTopic(user, probability, bounty, maxstake, description, definition, domain, closes)
            if (makebet != None):
                result += makeBet(username, probability, topic, lastbettime)
            if (resolvebet != None):
                result += resolveBet(topic, outcome == 'true')
            if (topic != None):
                result += getTopic(topic)
                result += getHistory(topic)
            if (user != None):
                result += getUser(user)
            if (search != None):
                result += executeSearch(search)
            if (login != None):
                result += executeLogin(user, password)
            if (signup != None):
                result += executeSignup(username, password)
        except MySQLdb.Error, e:
            result += "<error>" + str(e) + "</error>"
            cherrypy.thread_data.db.close()
            cherrypy.thread_data.db = MySQLdb.connect("sql.mit.edu", "paulfc", "guk38qaq", "paulfc+bets")
        result += "<currenttime>" + str(datetime.now())+ "</currenttime>"
        result += "</body>"
        return result
    query.exposed = True
    index.exposed = True

cherrypy.quickstart(HelloWorld(), "/", "server.conf")
