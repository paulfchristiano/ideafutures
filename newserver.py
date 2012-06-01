#!/usr/bin/python
import cherrypy
from datetime import datetime
from math import log

class IdeaFuturesServer:
  @cherrypy.expose 
  def query(self, topic=None, user=None, search=None, submitclaim=None, 
      probability=None, maxstake=None, description=None, definition=None,
      domain=None, closes=None, bounty=None, lastbettime=None, resolvebet=None,
      outcome=None, makebet=None, password=None, login=None, signup=None,
      deletebet=None, editclaim=None, promoteclaim=None, alldomains=None,
      userdomains=None, newdomains=None, time=None):
    result = ""
    result += "<body>"

    try:
#      if submitclaim!=None:
#        submitTopic(user, probability, bounty, maxstake, description, definition, domain, closes)
#      if (editclaim!=None):
#        editClaim(topic=topic, user=user, bounty=bounty, maxstake=maxstake, description=description, definition=definition, domain=domain, closes=closes)
#      if (promoteclaim !=None):
#        promoteClaim(topic=topic, promoted=promoteclaim)
#      if (makebet != None):
#        result += makeBet(user, probability, topic, lastbettime)
#      if (resolvebet != None):
#        resolveBet(topic, outcome == 'true')
#      if (topic != None):
#        result += getTopic(topic)
#        result += getHistory(topic)
#      if (deletebet != None):
#        deleteBet(topic)
#      if (search != None):
#        result += executeSearch(search, user)
#      if (login != None):
#        result += executeLogin(user, password)
#      if (signup != None):
#        result += executeSignup(user, password)
#      if (user != None):
#        result += getUser(user)
#      if (newdomains != None):
#        result += changeUserDomains(user, newdomains,time)
#      if (alldomains != None):
#        result += getAllDomains()
#      if (userdomains != None):
#        result += getUserDomains(user)
    except Exception, e:
      result += "<error>%s</error>" % (e,)

    result += "<currenttime>" + str(datetime.now())+ "</currenttime>"
    result += "</body>"
    return result

cherrypy.quickstart(IdeaFuturesServer(), "/", "newserver.conf")
