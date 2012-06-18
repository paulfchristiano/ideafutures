#!/usr/bin/python
import cherrypy
from data import Data
from datetime import datetime
import sys

class User(Data):
  collection = 'users'
  fields = ('name', 'password', 'reputation', 'domains')
  num_key_fields = 1

class Claim(Data):
  collection = 'claims'
  fields = ('uid', 'age', 'bounty', 'closes', 'currentbet', 'description', \
            'domain', 'lastbetter', 'lastbettime', 'maxstake', 'owner', \
            'promoted', 'resolved', 'definition', 'history')
  num_key_fields = 1

  def wrap(self):
    results = self.to_dict()
    results['history'] = wrap(('bet', wrap(bet)) for bet in results['history'])
    results['version'] = self.version_
    return wrap(results.items())

# Wraps a list, dictionary, or Data object in XML tags to return it to the user.
def wrap(results):
  if type(results) == dict:
    return wrap(results.items())
  elif hasattr(results, 'wrap'):
    return results.wrap()
  elif hasattr(results, '__iter__'):
    return ''.join('<%s>%s</%s>' % (key, value, key) for key, value in results)
  return wrap(results.to_dict())

# Errors returned by the server if queried incorrectly.
invalid_query_error = ('error', \
    'One or more fields of the query were missing or incorrectly formatted.')
permission_denied_error = ('error', \
    'Permission denied. Username or password incorrect.')

# Methods for answering server queries.
# Each of these methods should return a list of (key, value) result pairs.
# The elements of these pairs should be strings.
def login_query(name, password):
  if name is None or password is None:
    return [invalid_query_error]
  user = User.get(name)
  if user is None:
    return [('login', 'nosuchuser')]
  elif password != user.password:
    return [('login', 'wrongpassword')]
  else:
    return [('login', 'success'), ('reputation', user.reputation)]

def search_query(search, name, password):
  if search == 'user_default':
    if name is None:
      vals = execute_searches(['promoted'])
    else:
      user = User.get(name)
      if user is None or password is None or password != user.password:
        return [permission_denied_error]
      if len(user.domains) == 0:
        vals = execute_searches(['promoted'])
      else:
        vals = execute_searches(user.domains)
  else:
    vals = execute_searches([search])
  result = [('claim', wrap(claim)) for claim in vals]
  return result + [('search', \
      wrap([('uid', claim.uid) for claim in vals] + [('query', search)]))]

# Executes searches for the domains in the list 'searches'. Returns a list of
# claims in those domains, ordered from newest to oldest.
def execute_searches(searches):
  if 'promoted' in searches:
    if len(searches) > 1:
      searches = tuple(search for search in searches if search != 'promoted')
      vals = Claim.find({'$or':[{'promoted':1}, {'domain':{'$in':searches}}]}, \
            uses_key_fields=False)
    else:
      vals = Claim.find({'promoted':1}, uses_key_fields=False)
  else:
    vals = Claim.find({'domain':{'$in':searches}}, uses_key_fields=False)
  return sorted(vals, key=lambda claim: claim.age, reverse=True)

def claim_query(uid):
  if uid is None or not uid.isdecimal():
    return [invalid_query_error]
  claim = Claim.get(int(uid))
  if claim is None:
    return []
  return [('claim', wrap(claim))]

def signup_post(name, password):
  if name is None or password is None:
    return [invalid_query_error]
  elif len(name) < 3:
    return [('signup', 'shortusername')]
  elif len(password) < 3:
    return [('signup', 'shortpassword')]
  # Create a new user with a reputation of 1.0.
  user = User((name, password, 1.0, ['promoted']))
  if user.save():
    return [('signup', 'success'), ('reputation', 1.0)]
  else:
    return [('signup', 'usernametaken')]

class IdeaFuturesServer:
  # These calls only request data from the server; they never change its state.
  # Multiple queries may be requested in a single message.
  @cherrypy.expose
  def query(self, login=None, search=None, claim=None, \
      name=None, password=None):
    results = []
    try:
      if login is not None:
        results.extend(login_query(name, password))
      if search is not None:
        results.extend(search_query(search, name, password))
      if claim is not None:
        results.extend(claim_query(claim))
    except Exception, e:
      results.append(('error', str(e)))
    results.append(('currenttime', str(datetime.now())))
    return '<body>%s</body>' % (wrap(results),)

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
    return '<body>%s</body>' % (wrap(results),)

if not sys.flags.interactive:
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
