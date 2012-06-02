#!/usr/bin/python
import cherrypy
from data import Data
from datetime import datetime
from math import log

class User(Data):
  collection = 'users'
  fields = ('name', 'passwordhash')
  num_key_fields = 1

# Wraps a dictionary in HTML-style tags to return it to the user.
def wrap(result):
  return '<body>%s</body>' % (''.join('<%s>%s</%s>' % (key, value, key) \
      for key, value in result.items()),)

def get_user(name):
  return {'name':name}

class IdeaFuturesServer:
  @cherrypy.expose 
  def query(self, user=None):
    result = {}
    try:
      if user is not None:
        result = get_user(user)
    except Exception, e:
      result = {'error': str(e)}
    result['currenttime'] = str(datetime.now())
    return wrap(result)

cherrypy.quickstart(IdeaFuturesServer(), "/", "newserver.conf")

#      if (deletebet != None):
#        deleteBet(topic)
#      if (search != None):
#        result += executeSearch(search, user)
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
#      if (login != None):
#        result += executeLogin(user, password)
#      if (signup != None):
#        result += executeSignup(user, password)
#      if (newdomains != None):
#        result += changeUserDomains(user, newdomains,time)

