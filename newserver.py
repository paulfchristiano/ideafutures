#!/usr/bin/python
import cherrypy
from data import Data
from datetime import datetime
from math import log

class User(Data):
  collection = 'users'
  fields = ('name', 'password', 'reputation')
  num_key_fields = 1

# Wraps a dictionary in HTML-style tags to return it to the user.
def wrap(results):
  return '<body>%s</body>' % (''.join('<%s>%s</%s>' % (key, value, key) \
      for key, value in results),)

# An invalid query error returned by the server if queried incorrectly.
invalid_query_error = ('error', \
    'One or more fields of the query were missing or incorrectly formatted.')

# Methods for answering server queries.
# Each of these methods should return a list of (key, value) result pairs.
# The elements of these pairs should be strings.
def login_query(name, password):
  if name is None or password is None:
    return [invalid_query_error]
  user = User.get(name)
  if user is None:
    return [('login', 'nosuchuser')]
  elif user.password != password:
    return [('login', 'wrongpassword')]
  else:
    return [('login', 'success'), ('reputation', user.reputation)]

def signup_post(name, password):
  if name is None or password is None:
    return [invalid_query_error]
  elif len(name) < 3:
    return [('signup', 'shortusername')]
  elif len(password) < 3:
    return [('signup', 'shortpassword')]
  user = User.get(name)
  if user is not None:
    return [('signup', 'usernametaken')]
  else:
    # Create a new user with a reputation of 1.0.
    user = User((name, password, 1.0))
    user.save()
    return [('signup', 'success'), ('reputation', 1.0)]

class IdeaFuturesServer:
  # These calls only request data from the server; they never change its state.
  # Multiple queries may be requested in a single message.
  @cherrypy.expose
  def query(self, login=None, name=None, password=None):
    results = []
    try:
      if login is not None:
        results.extend(login_query(name, password))
    except Exception, e:
      results.append(('error', str(e)))
    results.append(('currenttime', str(datetime.now())))
    return wrap(results)

  # These calls may change state at the server.
  # Only one update is allowed per message.
  @cherrypy.expose
  def update(self, signup=None, name=None, password=None):
    results = []
    try:
      if signup is not None:
        results.extend(signup_post(name, password))
    except Exception, e:
      results.append(('error', str(e)))
    results.append(('currenttime', str(datetime.now())))
    return wrap(results)

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
