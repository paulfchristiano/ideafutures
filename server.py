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

def getAllDomains():
    cursor = cherrypy.thread_data.db.cursor()
    cursor.execute("SELECT DISTINCT domain FROM topics");
    result = ""
    while True:
        row = cursor.fetchone()
        if row == None:
            break
        result += wrapXML("domain", row[0])
    cursor.close()
    return wrapXML("alldomains", result)

def getUserDomains(user):
    if user == None: 
        return "";
    cursor = cherrypy.thread_data.db.cursor()
    cursor.execute("SELECT domains FROM users WHERE name=%s", (user,))
    row = cursor.fetchone()
    cursor.close()
    result = ""
    for domain in row[0].split(" "):
        result += wrapXML("domain", domain)
    cursor.close()
    return wrapXML("userdomains", result)

def getTopic(topicID):
    cursor = cherrypy.thread_data.db.cursor()
    cursor.execute("SELECT owner, description, age, resolved, bounty, maxstake, currentbet, lastbettime, lastbetter, definition, closes, promoted FROM topics " + 
                    "WHERE id = %s", (topicID,))
    row = cursor.fetchone()
    return dictionaryToXML('topic', {'id':topicID, 'owner':row[0],'description':row[1],
        'age':row[2], 'resolved':row[3], 'bounty':row[4], 'maxstake':row[5], 'currentbet':row[6], 
        'lastbettime':row[7], 'lastbetter':row[8], 'definition':row[9], 'closes':row[10], 
        'promoted':row[11]})

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

def executeSearch(search, user=None):
    result = "<query>%s</query>" % (search,)
    if search=='user_default':
        if user == None:
            result += executeSearches(["promoted"]);
        else:
            cursor = cherrypy.thread_data.db.cursor()
            cursor.execute("SELECT domains FROM users WHERE name=%s", (user,))
            row = cursor.fetchone()
            cursor.close()
            result += executeSearches(row[0].split(" "))
    else:
        result += executeSearches([search])
    return wrapXML("search", result)

def executeSearches(searches):
    cursor = cherrypy.thread_data.db.cursor()
    sql = "SELECT owner, description, age, id, resolved, bounty,  maxstake, currentbet,"
    sql += "lastbettime, lastbetter, definition, domain, closes FROM topics WHERE "
    domains = []
    first = True
    for search in searches:
        if not first:
            sql += "or " 
        else:
            first = False
        if search == 'promoted':
            sql += "promoted=1 "
        else:
            sql += "domain=%s "
            domains.append(search)
    domains = tuple(domains)
    sql += "ORDER BY age DESC"
    cursor.execute(sql, domains)
    result = ""
    while True:
        row = cursor.fetchone()
        if row == None:
            break
        result += topicXML(row)
    cursor.close()
    return result

def promoteClaim(topic, promoted):
    cursor = cherrypy.thread_data.db.cursor()
    cursor.execute("UPDATE topics "
                "SET promoted=%s,promotedat=CURRENT_TIMESTAMP "
                "WHERE id=%s", (promoted,topic))
    cursor.close()

def editClaim(topic, user, bounty, maxstake, description, definition, domain, closes):
    cursor = cherrypy.thread_data.db.cursor()
    cursor.execute("UPDATE topics SET bounty=%s,"+
                   "maxstake=%s, description=%s, definition=%s,"+
                   "domain=%s, closes=%s WHERE id=%s",
                   (bounty, maxstake, description, definition, domain, closes, topic))
    cursor.close()

def submitTopic(user, probability, bounty, maxstake, description, definition, domain, closes):
    cursor = cherrypy.thread_data.db.cursor()
    cursor.execute("INSERT INTO topics (owner,bounty,maxstake,description, definition, domain, closes) "+
                   "VALUES (%s, %s, %s, %s, %s, %s, %s)", (user, bounty, maxstake, description, definition, domain, closes))
    topicID = cherrypy.thread_data.db.insert_id()
    insertBet(user, probability, topicID)
    cursor.close()

def insertBet(user, probability, topicID):
    cursor = cherrypy.thread_data.db.cursor()
    cursor.execute(" INSERT INTO all_bets (user, probability, topicID)"
                 + " VALUES (%s, %s, %s)", (user, probability, topicID));
    cursor.execute(" UPDATE topics "+
                   " SET currentbet=%s, lastbettime=CURRENT_TIMESTAMP,lastbetter=%s "+
                   " WHERE id=%s", (probability, user, topicID))
    cursor.close()

def parseDate(s):
    return datetime.strptime(s, "%Y-%m-%d %H:%M:%S")

def makeBet(user, probability, topicID,lastbettime):
    cursor = cherrypy.thread_data.db.cursor()
    cursor.execute("SELECT reputation FROM users WHERE name = %s", (user,))
    row = cursor.fetchone()
    reputation = row[0]
    cursor.execute("SELECT bounty, maxstake, lastbettime FROM topics WHERE id = %s", (topicID,))
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

def deleteBet(topicID):
    cursor = cherrypy.thread_data.db.cursor()
    cursor.execute("DELETE FROM topics WHERE id=%s", (topicID,))
    cursor.close()

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
    if len(rows) == 0: 
        return
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
    cursor = cherrypy.thread_data.db.cursor()
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

def changeUserDomains(username, newdomains, time):
    cursor = cherrypy.thread_data.db.cursor()
    cursor.execute("SELECT lastmodified FROM users WHERE name=%s", (username,))
    t1 = parseDate(time)
    row = cursor.fetchone()
    t2 = row[0]
    if (t2 != None) and (t1 < t2):
            return "<result>Outdated query</result>"
    cursor.execute("UPDATE users SET domains=%s, lastmodified=%s WHERE name=%s", 
                    (newdomains, time, username))
    cursor.close()
    return "<result>Success</result>"

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
            <li> <a href="#submitclaim" id="submitclaimnavbar">Submit Claim</a> </li>
            <li> <a href="#filters" id="filtersnavbar">Change Domains</a> </li>
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
    def query(self, topic=None, user=None, search=None, submitclaim=None, 
            probability=None, maxstake=None, description=None, definition=None, domain=None,
            closes=None, bounty=None, lastbettime=None, resolvebet=None, outcome=None,
            makebet=None,password=None, login=None, signup=None, deletebet=None,
            editclaim=None, promoteclaim=None, alldomains=None, userdomains=None,
            newdomains=None, time=None):
        #result = "Content-type:xml\n"
        result = ""
        result += "<body>"
        #TODO everything should catch its own errors and report status
        finished=False
        iterations=0
        while not finished:
            try:
                if submitclaim!=None:
                    submitTopic(user, probability, bounty, maxstake, description, definition, domain, closes)
                if (editclaim!=None):
                    editClaim(topic=topic, user=user, bounty=bounty, maxstake=maxstake, description=description, definition=definition, domain=domain, closes=closes)
                if (promoteclaim !=None):
                    promoteClaim(topic=topic, promoted=promoteclaim)
                if (makebet != None):
                    result += makeBet(user, probability, topic, lastbettime)
                if (resolvebet != None):
                    resolveBet(topic, outcome == 'true')
                if (topic != None):
                    result += getTopic(topic)
                    result += getHistory(topic)
                if (deletebet != None):
                    deleteBet(topic)
                if (user != None):
                    result += getUser(user)
                if (search != None):
                    result += executeSearch(search, user)
                if (login != None):
                    result += executeLogin(user, password)
                if (signup != None):
                    result += executeSignup(username, password)
                if (newdomains != None):
                    result += changeUserDomains(user, newdomains,time)
                if (alldomains != None):
                    result += getAllDomains()
                if (userdomains != None):
                    result += getUserDomains(user)
                finished = True
            except MySQLdb.Error, e:
                cherrypy.thread_data.db.close()
                cherrypy.thread_data.db = MySQLdb.connect("sql.mit.edu", "paulfc", "guk38qaq", "paulfc+bets")
                if (iterations > 5):
                    result += "<error>" + str(e) + "</error>"
                    finished=True
                else:
                    iterations+=1
                    finished=False
        result += "<currenttime>" + str(datetime.now())+ "</currenttime>"
        result += "</body>"
        return result
    query.exposed = True
    index.exposed = True

cherrypy.quickstart(HelloWorld(), "/", "server.conf")
