#!/usr/bin/python
import cherrypy
from data import Data
from datetime import datetime
from math import log
from random import randint
import sys

class User(Data):
  collection = 'users'
  fields = ('name', 'password', 'reputation', 'committed', 'domains')
  num_key_fields = 1

  def wrap(self):
    return wrap((('reputation', self.reputation),
        ('committed', sum(self.committed.values()))))

class Claim(Data):
  collection = 'claims'
  fields = ('uid', 'age', 'bounty', 'closes', 'description', 'domain', \
      'maxstake', 'owner', 'promoted', 'resolved', 'definition', 'history')
  num_key_fields = 1

  def wrap(self):
    results = self.to_dict()
    results['history'] = wrap(('bet', wrap(bet)) for bet in results['history'])
    results['version'] = self.version_
    return wrap(results.items())

#------------------------------------------------------------------------------#
# Betting logic begins here!                                                   #
#------------------------------------------------------------------------------#

def get_stakes(name, claim, bet):
  new_history = list(claim.history)
  new_history.append({'user':name, 'probability':bet, 'time':now()})
  return {'old':{0:get_stake(name, claim.bounty, claim.history, False),
                 1:get_stake(name, claim.bounty, claim.history, True)},
          'cur':{0:get_stake(name, claim.bounty, new_history, False),
                 1:get_stake(name, claim.bounty, new_history, True)}}

def get_stake(name, bounty, history, outcome, final=False):
  if final and len(history) == 1:
    return 0
  # To compute final stakes, play the last better against the first.
  if final and name == history[0]['user']:
    history = history[1:] + [history[0]]
  result = 0
  p = 1
  for bet in history:
    next_p = bet['probability']
    if not outcome:
      next_p = 1 - next_p
    if name == bet['user']:
      result += bounty * (log(next_p) - log(p))
    p = next_p
  return result;

#------------------------------------------------------------------------------#
# Server code begins here!                                                     #
#------------------------------------------------------------------------------#

def now():
  return datetime.now().replace(microsecond=0)

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
authentication_failed_error = ('error', \
    'Authentication failed. Username or password incorrect.')

# Returns a User object if name and password are correct, or None otherwise.
def authenticate(name, password):
  if name is None or password is None:
    return None
  user = User.get(name)
  if user is None or user.password != password:
    return None
  return user

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
    return [('login', 'success')]

def search_query(user, search):
  if search == 'user_default':
    if user is None:
      vals = execute_searches(['promoted'])
    elif len(user.domains) == 0:
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

def alldomains_query():
  return [('alldomains', \
      wrap(('domain', domain) for domain in Claim.distinct('domain')))]

def userdomains_query(user):
  if user is None:
    return [authentication_failed_error]
  return [('userdomains', wrap(('domain', domain) for domain in user.domains))]

def signup_post(name, password):
  if name is None or password is None:
    return [invalid_query_error]
  elif len(name) < 3:
    return [('signup', 'shortusername')]
  elif len(password) < 3:
    return [('signup', 'shortpassword')]
  # Create a new user with a reputation of 10.0.
  user = User({'name':name, 'password':password, 'reputation':10.0, \
      'committed':{}, 'domains':['promoted']})
  if user.save():
    return [('signup', 'success'), ('user', wrap(user))]
  else:
    return [('signup', 'usernametaken')]

# Other than signup_post, the POST methods all assume that the user's name
# and password have been authenticated, so the user exists in the database.
def makebet_post(user, uid, bet, version):
  try:
    uid = int(uid)
    bet = float(bet)
    version = int(version)
  except Exception, e:
    return [invalid_query_error]
  if bet <= 0 or bet >= 1:
    return [('makebet', 'toocommitted')]

  # Check that the claim is valid, unresolved, and up-to-date, and check
  # that the bet is different from the old value.
  claim = Claim.get(uid)
  if claim is None or claim.resolved or claim.version_ != version:
    return [('makebet', 'conflict')]
  if claim.history[-1]['probability'] == bet:
    return [('makebet', 'samebet')]

  # Check that the user is not too committed to bet. This check is NOT
  # thread-safe, so we allow the user to commit more than the max stake in
  # some pathological cases.
  committed = sum(user.committed.values())
  stakes = get_stakes(user.name, claim, bet)
  old_stake = -min(stakes['old'][0], stakes['old'][1])
  cur_stake = -min(stakes['cur'][0], stakes['cur'][1])
  if cur_stake > claim.maxstake * (user.reputation - committed + old_stake):
    return [('makebet', 'toocommitted')]

  # This bet is legal. Update the claim. On success, atomically update the user.
  if claim.history[-1]['user'] == user.name:
    claim.history[-1] = {'user':user.name, 'probability':bet, 'time':now()}
  else:
    claim.history.append({'user':user.name, 'probability':bet, 'time':now()})
  if claim.save():
    User.atomic_update(user.name, \
        {'$set':{'committed.%s' % uid:cur_stake}})
    return [('makebet', 'success'), ('claim', wrap(claim))]
  return [('makebet', 'conflict')]

def resolvebet_post(user, uid, outcome):
  # Encode outcomes in the database with 1 for True and 2 for False.
  try:
    uid = int(uid)
    outcome = {'true':1, 'false':2}[outcome]
  except Exception, e:
    return [invalid_query_error]

  # Check that the claim is valid and unresolved and that the user owns it.
  claim = Claim.get(uid)
  if claim is None or claim.resolved:
    return [('resolvebet', 'conflict')]
  if claim.owner != user.name:
    return [authentication_failed_error]

  # Atomically resolve this claim and update user's reputations.
  Claim.atomic_update(uid, {'$set':{'resolved':outcome, 'closes':now()}})
  claim = Claim.get(uid)
  affected_names = set(bet['user'] for bet in claim.history)
  for name in affected_names:
    stake = get_stake(name, claim.bounty, claim.history, outcome == 1, True)
    User.atomic_update(name, \
        {'$unset':{'committed.%s' % uid:1}, '$inc':{'reputation':stake}})
  return [('resolvebet', 'success'), ('claim', wrap(claim))]

def submitclaim_post(user, description, definition, bet, bounty, \
    maxstake, closes, domain):
  if len(description) < 5:
    return [('submitclaim', 'baddata')]
  if definition is None:
    definition = ''
  try:
    bet = float(bet)
    bounty = float(bounty)
    maxstake = float(maxstake)
    print closes
    if closes is None or closes == '':
      closes = ''
    else:
      closes = datetime.strptime(closes, '%Y-%m-%d %H:%M:%S')
  except Exception, e:
    return [('submitclaim', 'baddata')]
  if bet <= 0 or bet >= 1 or bounty <= 0 or maxstake <= 0 or maxstake >= 0.5:
    return [('submitclaim', 'baddata')]

  # Check if the user can stake enough to make this claim. This check is NOT
  # thread-safe, so we may allow the user to risk more than the max stake in
  # pathological cases.
  stake = -min(log(bet), log(1 - bet))
  if stake > maxstake * (user.reputation - sum(user.committed.values())):
    return [('submitclaim', 'baddata')]

  age = now()
  if (closes != '' and closes < age) or domain is None:
    return [('submitclaim', 'baddata')]

  MAX_UID = (1 << 31) - 1
  claim = Claim({'uid':randint(0, MAX_UID), 'age':age, 'bounty':bounty, \
      'closes':closes, 'description':description, 'domain':domain, \
      'maxstake':maxstake, 'owner':user.name, 'promoted':1, 'resolved':0, \
      'definition':definition, \
      'history':[{'user':user.name, 'probability':bet, 'time':age}]})
  # Try to insert this claim. After 10 conflicts, fail.
  for i in range(10):
    if claim.save():
      User.atomic_update(user.name, \
          {'$inc':{'committed.%s' % claim.uid:stake}})
      return [('submitclaim', 'success')] + search_query(user, 'user_default')
    claim.uid = randint(0, MAX_UID)
  return [('submitclaim', 'conflict')]

class IdeaFuturesServer:
  # These calls only request data from the server; they never change its state.
  # Multiple queries may be requested in a single message.
  @cherrypy.expose
  def query(self, login=None, search=None, claim=None, \
      alldomains=None,  userdomains=None, name=None, password=None):
    results = []
    try:
      user = authenticate(name, password)
      if user is not None:
        results.append(('user', wrap(user)))
      if login is not None:
        results.extend(login_query(name, password))
      if search is not None:
        results.extend(search_query(user, search))
      if claim is not None:
        results.extend(claim_query(claim))
      if alldomains is not None:
        results.extend(alldomains_query())
      elif userdomains is not None:
        results.extend(userdomains_query(user))
    except Exception, e:
      results.append(('error', str(e)))
    results.append(('currenttime', now()))
    return '<body>%s</body>' % (wrap(results),)

  # These calls may change state at the server.
  # Only one update is allowed per message.
  @cherrypy.expose
  def update(self, signup=None, makebet=None, resolvebet=None, \
      submitclaim=None, name=None, password=None, id=None, bet=None, \
      version=None, outcome=None, description=None, definition=None, \
      bounty=None, maxstake=None, closes=None, domain=None):
    results = []
    try:
      user = authenticate(name, password)
      if signup is not None:
        results.extend(signup_post(name, password))
      elif user is not None:
        if makebet is not None:
          results.extend(makebet_post(user, id, bet, version))
        elif resolvebet is not None:
          results.extend(resolvebet_post(user, id, outcome))
        elif submitclaim is not None:
          results.extend(submitclaim_post(user, description, definition, \
              bet, bounty, maxstake, closes, domain))
        # Need to re-authenticate the user to refresh any changes.
        user = authenticate(name, password)
        results.append(('user', wrap(user)))
      else:
        results.append(authentication_failed_error)
    except Exception, e:
      results.append(('error', str(e)))
    results.append(('currenttime', now()))
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
