#!/usr/bin/python
import cherrypy
from data import Data
from datetime import datetime
from math import log
import md5
from random import randint
import re
import sys

# TODO: We need to store a secret salt on the server itself to protect
# people with weaker passwords. This salt shouldn't be committed the repo.
def hash_password(password):
  return md5.new(password).hexdigest()

# Errors returned by the server if queried incorrectly.
invalid_query_error = ('error', \
    'One or more fields of the query were missing or incorrectly formatted.')
authentication_failed_error = ('error', \
    'Authentication failed. Username or password incorrect.')

# The default domains are the domains which logged out users see.
# The restricted domains are not allowed to be the domain of any claim.
# The special domains are always included in the set of all domains, even
# though they are not the domain of any claim.
DEFAULT_DOMAINS = ['general', 'promoted']
SPECIAL_DOMAINS = ['all', 'active', 'promoted']
RESTRICTED_DOMAINS = SPECIAL_DOMAINS + ['my_bets', 'user_default']
DEFAULT_REPUTATION = 100.0

def is_admin(user):
  return user is not None and user.name in ('paulfc', 'skishore')

# Decorator that tests that the first argument to f is an admin user.
def admin_only(f):
  def admin_only_f(*args):
    if not args or not is_admin(args[0]):
      return [authentication_failed_error]
    return f(*args)
  return admin_only_f

class User(Data):
  collection = 'users'
  fields = ('name', 'email', 'pwd_hash', 'reputation', 'committed', 'domains')
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

# Returns a User object if name and password are correct, or None otherwise.
def authenticate(name, password):
  if name is None or password is None:
    return None
  user = User.get(name)
  pwd_hash = hash_password(password)
  if user is None or user.pwd_hash != pwd_hash:
    return None
  return user

# Methods for answering server queries.
# Each of these methods should return a list of (key, value) result pairs.
# The elements of these pairs should be strings.
def login_query(name, password):
  if name is None or password is None:
    return [invalid_query_error]
  user = User.get(name)
  pwd_hash = hash_password(password)
  if user is None:
    return [('login', 'nosuchuser')]
  elif user.pwd_hash != pwd_hash:
    return [('login', 'wrongpassword')]
  else:
    return [('login', 'success')]

def search_query(user, search):
  if search == 'user_default':
    if user is None or len(user.domains) == 0:
      vals = execute_searches(DEFAULT_DOMAINS)
    else:
      vals = execute_searches(user.domains)
  else:
    vals = execute_searches([search], user)
  result = [('claim', wrap(claim)) for claim in vals]
  return result + [('search', \
      wrap([('uid', claim.uid) for claim in vals] + [('query', search)]))]

# Executes searches for the domains in the list 'searches'. Returns a list of
# claims in those domains, ordered from newest to oldest.
def execute_searches(searches, user=None):
  if 'all' in searches:
    vals = Claim.find(uses_key_fields=False)
  elif 'active' in searches:
    vals = Claim.find({'resolved':0})
  elif 'my_bets' in searches:
    vals = []
    if user is not None:
      vals = Claim.find({'uid':{'$in':map(int, user.committed.keys())}})
  elif 'promoted' in searches:
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
  domains = set(Claim.distinct('domain') + DEFAULT_DOMAINS \
      ).difference(SPECIAL_DOMAINS)
  return [('alldomains', wrap(('domain', domain) \
      for domain in SPECIAL_DOMAINS + sorted(domains)))]

def userdomains_query(user):
  if user is None:
    return [authentication_failed_error]
  return [('userdomains', wrap(('domain', domain) \
      for domain in sorted(user.domains)))]

def signup_post(name, email, password):
  if name is None or email is None or password is None:
    return [invalid_query_error]
  elif len(name) < 4 or len(name) > 16:
    return [('signup', 'usernamesize')]
  elif len(password) < 8 or len(password) > 32:
    return [('signup', 'passwordsize')]
  elif not name.isalnum() or not password.isalnum():
    return [('signup', 'notalnum')]
  elif not re.sub('[_@.]', '', email).isalnum():
    return [('signup', 'invalidemail')]
  # Create a new user with a reputation of 10.0.
  pwd_hash = hash_password(password)
  user = User({
      'name':name,
      'email':email,
      'pwd_hash':pwd_hash,
      'reputation':DEFAULT_REPUTATION,
      'committed':{},
      'domains':DEFAULT_DOMAINS
  })
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

def resolveclaim_post(user, uid, outcome):
  # Encode outcomes in the database with 1 for True and 2 for False.
  try:
    uid = int(uid)
    outcome = {'true':1, 'false':2}[outcome]
  except Exception, e:
    return [invalid_query_error]

  # Try to resolve this claim. On success, update users' reputations.
  for i in range(10):
    claim = Claim.get(uid)
    if claim is None or claim.resolved:
      return [('resolveclaim', 'conflict')]
    if claim.owner != user.name and not is_admin(user):
      return [authentication_failed_error]
    claim.resolved = outcome
    claim.closes = now()

    if claim.save():
      affected_names = set(bet['user'] for bet in claim.history)
      for name in affected_names:
        stake = get_stake(name, claim.bounty, claim.history, outcome == 1, True)
        User.atomic_update(name, \
            {'$unset':{'committed.%s' % uid:1}, '$inc':{'reputation':stake}})
      return [('resolveclaim', 'success'), ('claim', wrap(claim))]
  return [('resolveclaim', 'conflict')]

@admin_only
def reopenclaim_post(user, uid):
  try:
    uid = int(uid)
  except Exception, e:
    return [invalid_query_error]

  # Try to reopen this claim. On success, update users' reputations.
  for i in range(10):
    claim = Claim.get(uid)
    if claim is None or not claim.resolved:
      return [('reopenclaim', 'conflict')]
    outcome = claim.resolved
    claim.resolved = 0
    claim.closes = ''

    if claim.save():
      affected_names = set(bet['user'] for bet in claim.history)
      for name in affected_names:
        stake = get_stake(name, claim.bounty, claim.history, outcome == 1, True)
        maxstake = -min(get_stake(name, claim.bounty, claim.history, False),
            get_stake(name, claim.bounty, claim.history, True))
        User.atomic_update(name, {'$set': \
            {'committed.%s' % uid:maxstake}, '$inc':{'reputation':-stake}})
      return [('reopenclaim', 'success'), ('claim', wrap(claim))]
  return [('reopenclaim', 'conflict')]

@admin_only
def promoteclaim_post(user, uid, outcome):
  try:
    uid = int(uid)
    outcome = {'true':1, 'false':0}[outcome]
  except Exception, e:
    return [invalid_query_error]
  Claim.atomic_update(uid, {'$set':{'promoted':outcome}})
  claim = Claim.get(uid)
  if claim is not None:
    return [('promoteclaim', 'success'), ('claim', wrap(claim))]
  return [('promoteclaim', 'conflict')]

@admin_only
def deleteclaim_post(user, uid):
  try:
    uid = int(uid)
  except Exception, e:
    return [invalid_query_error]
  claim = Claim.get(uid)
  if claim is None:
    return [('deleteclaim', 'conflict')]

  # Resolve this claim, without changing users' reputations, then delete it.
  Claim.atomic_update(uid, {'$set':{'resolved':1, 'closes':now()}})
  claim = Claim.get(uid)
  if claim is not None:
    affected_names = set(bet['user'] for bet in claim.history)
    for name in affected_names:
      User.atomic_update(name, {'$unset':{'committed.%s' % uid:1}})
    Claim.remove(uid)
    return [('deleteclaim', 'success'), ('claim', wrap(claim))]
  return [('deleteclaim', 'conflict')]

def submitclaim_post(user, description, definition, bet, bounty, \
    maxstake, closes, domain):
  if definition is None:
    definition = ''
  if not is_valid_desc_def_domain(description, definition, domain):
    return [('submitclaim', 'baddata')]

  try:
    bet = float(bet)
    bounty = float(bounty)
    maxstake = float(maxstake)
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
  stake = -bounty * min(log(bet), log(1 - bet))
  if stake > maxstake * (user.reputation - sum(user.committed.values())):
    return [('submitclaim', 'baddata')]

  age = now()
  if closes != '' and closes < age:
    return [('submitclaim', 'baddata')]

  MAX_UID = (1 << 31) - 1
  claim = Claim({'uid':randint(0, MAX_UID), 'age':age, 'bounty':bounty, \
      'closes':closes, 'description':description, 'domain':domain, \
      'maxstake':maxstake, 'owner':user.name, 'promoted':0, 'resolved':0, \
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

@admin_only
def editclaim_post(user, uid, description, definition, closes, domain):
  try:
    uid = int(uid)
  except Exception, e:
    return [invalid_query_error]
  if definition is None:
    definition = ''
  if not is_valid_desc_def_domain(description, definition, domain):
    return [('editclaim', 'baddata')]

  try:
    if closes is None or closes == '':
      closes = ''
    else:
      closes = datetime.strptime(closes, '%Y-%m-%d %H:%M:%S')
  except Exception, e:
    return [('editclaim', 'baddata')]

  for i in range(10):
    claim = Claim.get(int(uid))
    if not claim or claim.resolved:
      return [('editclaim', 'conflict')]
    elif closes != '' and closes < claim.age:
      return [('editclaim', 'baddata')]
    claim.description = description
    claim.definition = definition
    claim.closes = closes
    claim.domain = domain

    if claim.save():
      return [('editclaim', 'success')]
  return [('editclaim', 'conflict')]

def is_valid_desc_def_domain(description, definition, domain):
  if description is None or len(description) < 4 or len(description) > 128:
    return False
  if definition is None or len(definition) > 512:
    return False
  if (domain is None or domain in RESTRICTED_DOMAINS or len(domain) < 4 or
      len(domain) > 16 or not domain.replace('_', '').isalpha() or
      domain != domain.lower() or domain[-1] == '_'):
    return False
  return True

def newdomains_post(user, newdomains):
  if newdomains is None:
    return [invalid_query_error]
  newdomains = newdomains.split(' ') if len(newdomains) else []
  domains = set(Claim.distinct('domain') + DEFAULT_DOMAINS + SPECIAL_DOMAINS)
  newdomains = [domain for domain in newdomains if domain in domains]
  User.atomic_update(user.name, {'$set':{'domains':newdomains}})
  return [('userdomains', wrap(('domain', domain) \
      for domain in sorted(newdomains)))]
  return [invalid_query_error]

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
      if userdomains is not None:
        results.extend(userdomains_query(user))
    except Exception, e:
      results.append(('error', str(e)))
    results.append(('currenttime', now()))
    return '<body>%s</body>' % (wrap(results),)

  # These calls may change state at the server.
  # Only one update is allowed per message.
  @cherrypy.expose
  def update(self, signup=None, makebet=None, resolveclaim=None, \
      reopenclaim=None, promoteclaim=None, deleteclaim=None, \
      submitclaim = None, editclaim=None, \
      name=None, email=None, password=None, id=None, bet=None, version=None, \
      outcome=None, description=None, definition=None, bounty=None, \
      maxstake=None, closes=None, domain=None, newdomains=None):
    results = []
    try:
      user = authenticate(name, password)
      if signup is not None:
        results.extend(signup_post(name, email, password))
      elif user is not None:
        if makebet is not None:
          results.extend(makebet_post(user, id, bet, version))
        elif resolveclaim is not None:
          results.extend(resolveclaim_post(user, id, outcome))
        elif reopenclaim is not None:
          results.extend(reopenclaim_post(user, id))
        elif promoteclaim is not None:
          results.extend(promoteclaim_post(user, id, outcome))
        elif deleteclaim is not None:
          results.extend(deleteclaim_post(user, id))
        elif submitclaim is not None:
          results.extend(submitclaim_post(user, description, definition, \
              bet, bounty, maxstake, closes, domain))
        elif editclaim is not None:
          results.extend(editclaim_post(user, id, description, \
              definition, closes, domain))
        elif newdomains is not None:
          results.extend(newdomains_post(user, newdomains))
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
else:
  from data import db
