#!/usr/bin/python
from cgi import escape
import cherrypy
from data import (
  Data,
  db,
  )
from datetime import datetime
from itertools import chain
import json
from math import log
import md5
from random import randint
import re
import sys
import urllib

from mail import send_mail_async
from secrets import salt

# TODO: We need to store a secret salt on the server itself to protect
# people with weaker passwords. This salt shouldn't be committed the repo.
def hash_password(password):
  return md5.new(password + salt).hexdigest()

def hash_group_invite(group, invite):
  return md5.new('group_name: %s; invite: %s; salt: %s;' % (
    group.name,
    invite,
    group.salt,
  )).hexdigest()

def encodeURIComponent(uri):
  return urllib.quote(uri, safe='~()*!.\'')

# Errors returned by the server if queried incorrectly.
invalid_query_error = ('error', \
    'One or more fields of the query were missing or incorrectly formatted.')
authentication_failed_error = ('error', \
    'Authentication failed. Username or password incorrect.')

# The DEFAULT_TAGS are the tags that always exist, even when no claims have them.
DEFAULT_TAGS = ['general']
DEFAULT_REPUTATION = 100.0

MAX_UID = (1 << 31) - 1
MAX_NUM_SEARCH_RESULTS = 100

def is_admin(user):
  return user is not None and user.name in ('paulfchristiano', 'skishore')

# Decorator that tests that the first argument to f is an admin user.
def admin_only(f):
  def admin_only_f(*args):
    if not args or not is_admin(args[0]):
      return [authentication_failed_error]
    return f(*args)
  return admin_only_f

class User(Data):
  collection = 'users'
  fields = (
    'name',
    'email',
    'pwd_hash',
    'reputation',
    'committed',
    'tags',
    'groups',
    'history',
  )
  num_key_fields = 1

  def wrap(self, get_notifications=False):
    notifications = len(unanswered_invites(self)) if get_notifications else ''
    return wrap((
      ('reputation', self.reputation),
      ('committed', sum(self.committed.values())),
      ('notifications', notifications),
    ))

class Claim(Data):
  collection = 'claims'
  fields = (
    'uid',
    'age',
    'bounty',
    'closes',
    'description',
    'tags',
    'groups',
    'maxstake',
    'owner',
    'promoted',
    'resolved',
    'definition',
    'index',
    'history',
  )
  num_key_fields = 1

  def wrap(self):
    results = self.to_dict()
    results['tags'] = wrap(('tag', tag) for tag in results['tags'])
    results['groups'] = wrap(('group', group) for group in results['groups'])
    results['history'] = wrap(('bet', wrap(bet)) for bet in results['history'])
    results['version'] = self.version_
    results.pop('index')
    return wrap(results.items())

class Group(Data):
  collection = 'groups'
  fields = ('name', 'label', 'owner', 'invites', 'salt')
  num_key_fields = 1

  def wrap(self):
    results = self.to_dict()
    results['group_name'] = results.pop('name')
    results['members'] = wrap(('member', wrap({
      'email': key,
      'name': value,
    })) for (key, value) in results.pop('invites').iteritems())
    results['version'] = self.version_
    results.pop('salt')
    return wrap(results.items())

class PasswordReset(Data):
  collection = 'password_resets'
  fields = ('token', 'name', 'state', 'time')
  num_key_fields = 1

def deduplicate(l):
  return [x for (i, x) in enumerate(l) if x not in l[:i]]

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
  return datetime.utcnow().replace(microsecond=0)

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

def search_query(user, search, extra):
  full_search = '%s! %s' % (extra.replace('_', ''), search) if extra else search
  query = [('search', search), ('extra', extra)] if extra else [('search', search)]
  vals = execute_search(user, full_search)
  result = [('search_result', wrap(query + [('uid', claim.uid) for claim in vals]))]
  result.extend(('claim', wrap(claim)) for claim in vals)
  return result

def group_filter(user):
  if user:
    return {
      '$or': [
        {'groups': {'$in': ['all'] + user.groups.keys()}},
        {'uid_': {'$in': map(int, user.committed.keys())}},
      ]
    }
  return {'groups': {'$in': ['all']}}

def unanswered_invites(user):
  '''
  Returns a list of (group, link) pairs, where each group is one that this user has
  been invited to and the link is a link to their invite page.

  If the invite is an email invite and this user's email has not been verified, then
  the link will be an empty string. If the user wants to accept this invite, they will
  be sent another invite email.
  '''
  # TODO(skishore): Deduplicate logic this function shares with send_invites_post.
  username = "(%s's email)" % (user.name,)
  email = user.email.replace('.', '(dot)')
  clause = {'$or': [
    {"invites.%s" % (invite,): {'$exists': True}} for invite in (username, email)
  ]}
  groups = Group.find(clause)
  result = []
  verified = any(group.invites.get(email) for group in groups)
  for group in groups:
    if group.name not in user.groups:
      if username in group.invites:
        result.append((group, get_invite_link(group, username)))
      else:
        link = get_invite_link(group, email) if verified else ''
        result.append((group, link))
  return result

def get_invite_link(group, invite):
  # TODO(skishore): Deduplicate logic this function shares with send_invite function.
  group_hash = hash_group_invite(group, invite)
  return '/#invite+%s+%s+%s' % (
    encodeURIComponent(group.name),
    encodeURIComponent(invite),
    encodeURIComponent(group_hash),
  )

# Executes searches for the tags in the list 'searches'. Returns a list of
# claims in those tags, ordered from newest to oldest.
def execute_search(user, search):
  # Truncate the search to avoid it getting out of hand.
  search = search[:64]
  (searches, tag_searches, extras) = parse_search(search)

  clauses = group_filter(user)
  if 'default' in extras:
    tags = user.tags if user else []
    if tags:
      clauses['tags'] = {'$all': tags}
    vals = Claim.find(clauses, limit=MAX_NUM_SEARCH_RESULTS, uses_key_fields=False)
    return sorted(vals, key=claim_sort_key, reverse=True)

  if 'active' in extras:
    clauses['resolved'] = 0
  if 'mybets' in extras and user:
    clauses['uid_'] = {'$in': map(int, user.committed.keys())}
  if 'promoted' in extras:
    clauses['promoted'] = 1

  if searches:
    clauses['index'] = {'$all': [re.compile(search) for search in searches]}
  if tag_searches:
    clauses['tags'] = {'$all': tag_searches}
  vals = Claim.find(clauses, limit=MAX_NUM_SEARCH_RESULTS, uses_key_fields=False)
  return sorted(vals, key=claim_sort_key, reverse=True)

def claim_sort_key(claim):
  return claim.history[-1]['time']

# Parses a search string into a list of normalized search tokens.
# Returns a triple: a list of full-text searches, a list of tag searches,
# and a list of extra filters.
def parse_search(search):
  if not search:
    return ([], [], [])
  elif search == 'incremental! ':
    return ([], [], ['default'])
  tokens = re.sub('[ ,]', '_', search.lower()).split('"')
  tokens = chain(*(normalize(token, i % 2) for (i, token) in enumerate(tokens)))
  tokens = [token for token in tokens if token not in ('', '!', ':')]

  searches = []
  tag_searches = []
  extras = []
  i = 0
  while i < len(tokens):
    token = tokens[i]
    if token[-1] == '!':
      extras.append(token[:-1])
    elif token[-1] == ':':
      if token == 'tag:' and i + 1 < len(tokens):
        tag_searches.append(tokens[i + 1])
        i += 1
    else:
      searches.append(token)
    i += 1
  return (list(set(searches)), list(set(tag_searches)), list(set(extras)))

def normalize(token, quoted=True):
  if quoted:
    return [''.join(c for c in token if c.isalnum() or c == '_').strip('_')]
  token = re.sub('_*!_*', '!_', re.sub('_*:_*', ':_', token))
  token = ''.join(c for c in token if c.isalnum() or c in  ('_', '!', ':'))
  return token.strip('_').split('_')

# Returns an index for full-text search combining description and tags.
def compute_index(description, tags, groups):
  description = description.lower().replace(' ', '_')
  description = ''.join(c for c in description if c.isalnum() or c == '_')
  description = re.sub('_+', '_', description).strip('_')
  return ' '.join([description] + tags + groups)

def claim_query(user, uid):
  if uid is None or not uid.isdecimal():
    return [invalid_query_error]
  claim = Claim.get(int(uid))
  if claim is None:
    return []
  groups = set(['all'] + (user.groups.keys() if user else []))
  if not any(group in groups for group in claim.groups):
    return []
  return [('claim', wrap(claim))]

def alltags_query(user):
  tags = set(Claim.distinct('tags', group_filter(user)) + DEFAULT_TAGS)
  return [('alltags', wrap(('tag', tag) for tag in sorted(tags)))]

def settings_query(user):
  if user is None:
    return [authentication_failed_error]
  # TODO: The wrap function should handle serialization. In fact, we should use JSON.
  result = {}
  result['email'] = user.email
  result['tags'] = wrap(('tag', tag) for tag in sorted(user.tags))
  groups = Group.find({'name': {'$in': user.groups.keys()}})
  result['groups'] = wrap(('group', wrap(group)) for group in groups)
  # Get records about as-yet unanswered invites and pass them back.
  invites = []
  for (group, link) in unanswered_invites(user):
    invites.append({
      'name': group.name,
      'label': group.label,
      'owner': group.owner,
      'link': link,
    })
  result['invites'] = wrap(('invite', wrap(invite)) for invite in invites)
  return [('settings', wrap(result))]

def scores_query(user, group):
  if group == 'all':
    data = list({
      'name': user['name_'],
      'reputation': user['reputation'],
    } for user in db.users.find({}, {'name_': 1, 'reputation': 1}))
    data.sort(key = lambda score: -score['reputation'])
  else:
    if not user or group not in user.groups.keys():
      return [authentication_failed_error]
    claims = [claim for claim in Claim.find({'groups': group}) if claim.resolved]
    filtered_uids = set(claim.uid for claim in claims)
    users = db.users.find({'groups.%s' % (group,): 1}, {'name_': 1, 'history': 1})
    data = []
    for user in users:
      uids = [uid for uid in user['history'] if int(uid) in filtered_uids]
      delta = sum(user['history'][uid]['stake'] for uid in uids)
      data.append({'name': user['name_'], 'reputation': DEFAULT_REPUTATION + delta})
    data.sort(key = lambda score: -score['reputation'])
  return [('scores', wrap(
    [('group', group)] +
    [('score', wrap(score)) for score in data]
  ))]

def group_query(user, group_name, invite, group_hash):
  group = Group.get(group_name)
  if not group or invite not in group.invites:
    return [authentication_failed_error]
  if hash_group_invite(group, invite) != group_hash:
    return [authentication_failed_error]
  return [
      ('group_query', wrap(group)),
      ('invite_state', group.invites[invite])
      ]

def resolve_invite_post(user, group_name, invite, group_hash, choice):
  if choice not in ('accept', 'decline'):
    return [invalid_query_error]
  if user and invite and invite[0] == '(' and invite[1:len(user.name) + 1] != user.name:
    return [('resolve_invite', 'This invite was meant for another user.')]

  for i in range(10):
    group = Group.get(group_name)
    if not user or not group or invite not in group.invites:
      return [authentication_failed_error]
    if hash_group_invite(group, invite) != group_hash:
      return [authentication_failed_error]

    if group.invites[invite]:
      return [('resolve_invite', 'This invite has already been resolved.')]
    if any(name == user.name for name in group.invites.values()):
      choice = 'decline'
    if choice == 'decline':
      del group.invites[invite]
    else:
      group.invites[invite] = user.name
    if group.save():
      User.atomic_update(user.name, {'$set': {'groups.%s' % (group_name,): 1}})
      return [('resolve_invite', 'success')]
  return [('resolve_invite', 'There was a conflicting update that prevented yours.')]

def signup_post(name, email, password):
  if name is None or email is None or password is None:
    return [invalid_query_error]
  elif len(name) < 4 or len(name) > 16:
    return [('signup', 'usernamesize')]
  elif len(password) < 4 or len(password) > 256:
    return [('signup', 'passwordsize')]
  elif not name.isalnum() or name != name.lower():
    return [('signup', 'notalnum')]
  elif not re.sub('[_@.+]', '', email).isalnum():
    return [('signup', 'invalidemail')]
  # Create a new user with a reputation of 10.0.
  pwd_hash = hash_password(password)
  user = User({
      'name':name,
      'email':email,
      'pwd_hash':pwd_hash,
      'reputation':DEFAULT_REPUTATION,
      'committed':{},
      'tags':[],
      'groups':{},
      'history':{},
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
  except Exception:
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
    outcome = {
      'true': 1,
      'false': 2,
      'called_off': 3,
    }[outcome]
  except Exception:
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
        stake = 0
        if outcome in (1, 2):
          stake = get_stake(name, claim.bounty, claim.history, outcome == 1, True)
        User.atomic_update(name, {
            '$unset': {
              'committed.%s' % (uid,): 1,
            },
            '$set': {
              'history.%s' % (uid,): {
                'stake': stake,
                'time': claim.closes,
              }
            },
            '$inc': {
              'reputation':stake,
            }
          })
      return [('resolveclaim', 'success'), ('claim', wrap(claim))]
  return [('resolveclaim', 'conflict')]

@admin_only
def reopenclaim_post(user, uid):
  try:
    uid = int(uid)
  except Exception:
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
        stake = 0
        if outcome in (1, 2):
          stake = get_stake(name, claim.bounty, claim.history, outcome == 1, True)
        maxstake = -min(get_stake(name, claim.bounty, claim.history, False),
            get_stake(name, claim.bounty, claim.history, True))
        User.atomic_update(name, {
            '$set': {
              'committed.%s' % (uid,): maxstake,
            },
            '$unset': {
              'history.%s' % (uid,): 1,
            },
            '$inc':{
              'reputation': -stake,
            },
          })
      return [('reopenclaim', 'success'), ('claim', wrap(claim))]
  return [('reopenclaim', 'conflict')]

@admin_only
def promoteclaim_post(user, uid, outcome):
  try:
    uid = int(uid)
    outcome = {'true':1, 'false':0}[outcome]
  except Exception:
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
  except Exception:
    return [invalid_query_error]
  claim = Claim.get(uid)
  if claim is None or claim.resolved:
    return [('deleteclaim', 'conflict')]
  # Resolve this claim, without changing users' reputations, then delete it.
  claim.resolved = 1
  claim.closes = now()
  if not claim.save():
    return [('deleteclaim', 'conflict')]

  claim = Claim.get(uid)
  if claim is not None:
    affected_names = set(bet['user'] for bet in claim.history)
    for name in affected_names:
      User.atomic_update(name, {'$unset':{'committed.%s' % uid:1}})
    Claim.remove(uid)
    return [('deleteclaim', 'success'), ('claim', wrap(claim))]
  return [('deleteclaim', 'conflict')]

def submitclaim_post(user, description, definition, bet, bounty, \
    maxstake, closes, tags, groups):
  description = '' if not description else escape(description)
  definition = '' if not definition else escape(definition)
  try:
    tags = deduplicate(json.loads(tags))
  except Exception:
    return [('submitclaim', 'Your tags field was misformatted.')]
  if not is_valid_desc_def_tags(description, definition, tags):
    return [('submitclaim', 'Your description, definition or tags were misformatted.')]
  try:
    groups = deduplicate(json.loads(groups))
    groups = [group_name_from_label(group) for group in groups]
    assert(groups and (groups == ['all'] or (group in user.groups for group in groups)))
  except Exception:
    return [('submitclaim', 'You can only make this claim visible to groups you are a member of.')]

  try:
    bet = float(bet)
    bounty = float(bounty)
    maxstake = float(maxstake)
    if closes is None or closes == '':
      closes = ''
    else:
      closes = datetime.strptime(closes, '%Y-%m-%dT%H:%M:%S')
  except Exception:
    return [('submitclaim', 'Your closes field was misformatted.')]
  if bet <= 0 or bet >= 1 or bounty <= 0 or maxstake <= 0 or maxstake >= 0.5:
    return [('submitclaim', 'Your initial bet is out of range.')]

  # Check if the user can stake enough to make this claim. This check is NOT
  # thread-safe, so we may allow the user to risk more than the max stake in
  # pathological cases.
  stake = -bounty * min(log(bet), log(1 - bet))
  if stake > maxstake * (user.reputation - sum(user.committed.values())):
    return [('submitclaim', 'You cannot risk that much with this bet.')]

  age = now()
  if closes != '' and closes < age:
    return [('submitclaim', 'Your claim must close at some point in the future.')]

  claim = Claim({'uid':randint(0, MAX_UID), 'age':age, 'bounty':bounty, \
      'closes':closes, 'description':description, 'tags':tags, 'groups': groups, \
      'maxstake':maxstake, 'owner':user.name, 'promoted':0, 'resolved':0, \
      'definition':definition, 'index':compute_index(description, tags, groups), \
      'history':[{'user':user.name, 'probability':bet, 'time':age}]})
  # Try to insert this claim. After 10 conflicts, fail.
  for i in range(10):
    if claim.save():
      User.atomic_update(user.name, \
          {'$inc':{'committed.%s' % claim.uid:stake}})
      return [('submitclaim', 'success')] + search_query(user, '', 'default')
    claim.uid = randint(0, MAX_UID)
  return [('submitclaim', 'conflict')]

def editclaim_post(user, uid, description, definition, closes, tags, groups):
  try:
    uid = int(uid)
  except Exception:
    return [invalid_query_error]
  description = '' if not description else escape(description)
  definition = '' if not definition else escape(definition)
  try:
    tags = deduplicate(json.loads(tags))
  except Exception:
    return [('editclaim', 'Your tags field was misformatted.')]
  if not is_valid_desc_def_tags(description, definition, tags):
    return [('editclaim', 'Your description, definition or tags were misformatted.')]
  try:
    # TODO: We should do some more validation on the groups here. However, it's not
    # urgent - this is an admin-only route.
    groups = deduplicate(json.loads(groups))
    groups = [group_name_from_label(group) for group in groups]
    assert(groups and (groups == ['all'] or 'all' not in groups))
  except Exception:
    return [('editclaim', 'Your groups field was misformatted.')]

  try:
    if closes is None or closes == '':
      closes = ''
    else:
      closes = datetime.strptime(closes, '%Y-%m-%dT%H:%M:%S')
  except Exception:
    return [('editclaim', 'Your closes field was misformatted.')]

  for i in range(10):
    claim = Claim.get(int(uid))
    if not claim or claim.resolved:
      return [('editclaim', 'conflict')]
    elif closes != '' and closes < claim.age:
      return [('editclaim', 'Your claim must close at some point in the future.')]
    if not is_admin(user):
      if user.name != claim.owner:
        return [authentication_failed_error]
      elif len(claim.history) > 1:
        return [('editclaim', 'Someone else has bet on this claim. You can no longer edit it.')]
    claim.description = description
    claim.definition = definition
    claim.closes = closes
    claim.tags = tags
    claim.groups = groups
    claim.index = compute_index(description, tags, groups)

    if claim.save():
      return [('editclaim', 'success')]
  return [('editclaim', 'conflict')]

def is_valid_desc_def_tags(description, definition, tags):
  if description is None or len(description) < 4 or len(description) > 128:
    return False
  if definition is None or len(definition) > 512:
    return False
  if (tags is None or not type(tags) == list
      or len(tags) > 16 or tags != deduplicate(tags)):
    return False
  if any(type(tag) != unicode
         or len(tag) < 2 or len(tag) > 32
         or not tag.replace('_', '').isalpha()
         or tag != tag.lower() or tag[-1] == '_'
         for tag in tags):
    return False
  return True

def group_name_from_label(label):
  group_name = label.lower().replace(' ', '_')
  group_name = ''.join(c for c in group_name if c.isalnum() or c == '_')
  return re.sub('_+', '_', group_name).strip('_')

def create_group_post(user, label, invites):
  if not label:
    return [invalid_query_error]
  group_name = group_name_from_label(label)
  if group_name == 'all':
    return [('create_group', 'You cannot name a group "all".')]
  if len(group_name) < 4 or len(group_name) > 32:
    return [('create_group', "Your group's name must be between 4 and 32 characters.")]
  label = escape(label)
  group = Group({
    'name': group_name,
    'label': label,
    'owner': user.name,
    'invites': {
      '(owner)': user.name,
    },
    'salt': randint(0, MAX_UID),
  })
  if group.save():
    User.atomic_update(user.name, {'$set': {'groups.%s' % (group_name,): 1}})
    send_invites_post(user, group_name, invites)
    return [('create_group', 'success')]
  return [('create_group', 'A group with that name already exists.')]

def send_invites_post(user, group_name, invites):
  group = Group.get(group_name)
  if not group or group.owner != user.name:
    return [invalid_query_error]
  try:
    invites = json.loads(invites)
  except ValueError:
    return [invalid_query_error]
  if (type(invites) != list or
      any(not isinstance(invite, basestring) for invite in invites)):
    return [invalid_query_error]
  emails = set(invite for invite in invites
               if '@' in invite and re.sub('[_@.]', '', invite).isalnum())
  usernames = list(set(invite for invite in invites
                       if invite not in emails and invite != user.name))
  for email in emails:
    send_invite(group, email, email)
  for user in User.find({'name': {'$in': usernames}}):
    send_invite(group, user.email, "(%s's email)" % (user.name,))

def send_invite(group, email, invite, resend=False):
  invite = invite.replace('.', '(dot)')
  if invite not in group.invites or resend:
    field = 'invites.%s' % (invite,)
    Group.atomic_update(group.name, {'$set': {field: ''}}, clause={field: None})
    group.invites[invite] = ''

    group_hash = hash_group_invite(group, invite)
    link = 'predictionbazaar.com/#invite+%s+%s+%s' % (
      encodeURIComponent(group.name),
      encodeURIComponent(invite),
      encodeURIComponent(group_hash),
    )
    text = (
      '%s has invited you to join "%s" at the '
      'reputation-based prediction market, predictionbazaar.com.'
      '\n\n'
      'View or accept the invite here:\n%s' % (
        group.owner, group.name, link
      )
    )
    html = (
      '%s has invited you to join "%s" at the '
      'reputation-based prediction market, predictionbazaar.com.'
      '<br><br>'
      'Click to <a href="%s">view or accept the invite</a>.' % (
        group.owner, group.name, link
      )
    )
    # This is a hack to send plaintext emails. Gmail might be filtering out HTML emails.
    html = None
    send_mail_async(email, 'predictionbazaar.com - group invitation', text, html)

def boot_members_post(user, group_name, boots):
  try:
    boots = json.loads(boots)
  except ValueError:
    return [invalid_query_error]
  if (type(boots) != list or
      any(not isinstance(boot, basestring) for boot in boots)):
    return [invalid_query_error]
  boots = set(boots)

  for i in range(10):
    group = Group.get(group_name)
    if not group or group.owner != user.name:
      return [invalid_query_error]
    users_booted = [group.invites.get(boot) for boot in boots]
    users_booted = [name for name in users_booted if name]
    if user.name in users_booted:
      return [invalid_query_error]

    group.invites = dict(item for item in group.invites.iteritems() if item[0] not in boots)
    if group.save():
      for name in users_booted:
        User.atomic_update(name, {'$unset': {'groups.%s' % (group.name,): 1}})
      return [('boot_members', 'success')]
  return [('boot_members', 'A conflict prevented the update. Try again.')]

def leave_group_post(user, group_name):
  for i in range(10):
    group = Group.get(group_name)
    if not user or not group:
      return [invalid_query_error]

    group.invites = dict(item for item in group.invites.iteritems() if item[1] != user.name)
    if group.save():
      User.atomic_update(user.name, {'$unset': {'groups.%s' % (group.name,): 1}})
      return [('leave_group', 'success')]
  return [('leave_group', 'A conflict prevented the update. Try again.')]

class IdeaFuturesServer:
  # These calls only request data from the server; they never change its state.
  # Multiple queries may be requested in a single message.
  @cherrypy.expose
  def query(self, login=None, search=None, extra=None, claim=None,
      alltags=None,  settings=None, name=None, password=None,
      group_name=None, invite=None, group_hash=None, scores=None,
      get_notifications=False):
    results = []
    try:
      user = authenticate(name, password)
      if user is not None:
        results.append(('user', user.wrap(get_notifications=get_notifications)))
      if login is not None:
        results.extend(login_query(name, password))
      if search is not None:
        results.extend(search_query(user, search, extra))
      if claim is not None:
        results.extend(claim_query(user, claim))
      if alltags is not None:
        results.extend(alltags_query(user))
      if settings is not None:
        results.extend(settings_query(user))
      if scores is not None:
        results.extend(scores_query(user, scores))
      if group_name is not None:
        results.extend(group_query(user, group_name, invite, group_hash))
    except Exception:
      raise
    results.append(('currenttime', now()))
    return '<body>%s</body>' % (wrap(results),)

  #TODO: Rewrite other endpoints in this style.
  @cherrypy.expose
  def history_query(self, name=None, password=None, group=None, other_name=None):
    user = authenticate(name, password)
    other = User.get(other_name)
    if group is None or other is None:
      return str(invalid_query_error)

    filtered_uids = set(Claim.distinct('uid_', group_filter(user)))
    if group != 'all':
      group_uids = set(Claim.distinct('uid_', {'groups': group}))
    descriptions = {
      claim.uid: claim.description
      for claim in Claim.find({'uid': {'$in': list(filtered_uids)}})
    }

    history = []
    for (uid, row) in other.history.iteritems():
      if group != 'all' and int(uid) not in group_uids:
        continue
      row['description'] = descriptions.get(int(uid), '')
      if int(uid) in filtered_uids:
        row['uid'] = uid
      if row['stake']:
        history.append(row)
    history.sort(key=lambda row: row['time'])
    [row.pop('time') for row in history]
    return json.dumps(history)

  @cherrypy.expose
  def change_email(self, name=None, password=None, email=None):
    user = authenticate(name, password)
    if not user:
      return 'The password you entered was not correct.'
    elif email is None or not re.sub('[_@.+]', '', email).isalnum():
      return 'Your email could not be recognized.'
    User.atomic_update(user.name, {'$set': {'email': email}})
    return 'success'

  @cherrypy.expose
  def change_password(self, name=None, password=None, new_password=None):
    user = authenticate(name, password)
    if not user:
      return 'The password you entered was not correct.'
    if len(new_password) < 4 or len(new_password) > 256:
      return 'Your new password must be between 4 and 256 characters.'
    User.atomic_update(user.name, {'$set': {'pwd_hash': hash_password(new_password)}})
    return 'success'

  @cherrypy.expose
  def forgot_password(self, retrieval=None):
    users = User.find({'$or': [{'name_': retrieval}, {'email': retrieval}]})
    if not users:
      return 'No users with that username or email were found.'
    for user in users:
      password_reset = PasswordReset({
        'token': str(randint(0, MAX_UID)) + str(randint(0, MAX_UID)),
        'name': user.name,
        'state': 'created',
        'time': now(),
      })
      if not password_reset.save():
        return 'There was an error sending the email. Try again.'
      link = 'predictionbazaar.com/#password_reset+%s+%s' % (
        encodeURIComponent(password_reset.name),
        encodeURIComponent(password_reset.token),
      )
      text = (
        'Someone filled out a password reset form for you at predictionbazaar.com.\n\n'
        'Use this link to reset it:\n%s' % (link,)
      )
      html = (
        'Someone filled out a password reset form for you at predictionbazaar.com.<br><br>'
        'Click to <a href="%s">reset your password.</a>' % (link,)
      )
      send_mail_async(user.email, 'predictionbazaar.com - password reset', text, html)
    return 'success'

  @cherrypy.expose
  def reset_password(self, token=None, new_password=None):
    password_reset = PasswordReset.get(token)
    if not password_reset:
      return 'Authentication failed. The password reset link you used is invalid.'
    if password_reset.state != 'created':
      return 'This password reset link has already been used.'
    if len(new_password) < 4 or len(new_password) > 256:
      return 'Your new password must be between 4 and 256 characters.'
    name = password_reset.name
    PasswordReset.atomic_update(token, {'$set': {'state': 'used'}})
    User.atomic_update(name, {'$set': {'pwd_hash': hash_password(new_password)}})
    return 'success'

  @cherrypy.expose
  def resend_invite(self, name, password, group):
    user = authenticate(name, password)
    if not user:
      return 'The password you entered was not correct.'
    group = Group.get(group)
    if not group:
      return 'The group that you requested could not be found.'
    invite = user.email.replace('.', '(dot)')
    if invite not in group.invites or group.invites[invite]:
      return 'This invitation has already been accepted.'
    send_invite(group, user.email, invite, resend=True)
    return (
      'Since your email has not yet been verified, this invitation has been resent. '
      'Check your email for it soon. Accepting the invite will also verify your email.'
    )

  # These calls may change state at the server.
  # Only one update is allowed per message.
  @cherrypy.expose
  def update(self, signup=None, makebet=None, resolveclaim=None, \
      reopenclaim=None, promoteclaim=None, deleteclaim=None, \
      submitclaim = None, editclaim=None, \
      name=None, email=None, password=None, id=None, bet=None, version=None, \
      outcome=None, description=None, definition=None, bounty=None, \
      maxstake=None, closes=None, tags=None, groups=None,
      create_group=None, send_invites=None, boot_members=None, leave_group=None,
      group_name=None, label=None, invites=None,
      resolve_invite=None, invite=None, group_hash=None):
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
              bet, bounty, maxstake, closes, tags, groups))
        elif editclaim is not None:
          results.extend(editclaim_post(user, id, description, \
              definition, closes, tags, groups))
        elif create_group is not None:
          results.extend(create_group_post(user, label, invites))
        elif send_invites is not None:
          send_invites_post(user, group_name, invites)
        elif boot_members is not None:
          results.extend(boot_members_post(user, group_name, boot_members))
        elif leave_group is not None:
          results.extend(leave_group_post(user, group_name))
        elif resolve_invite is not None:
          results.extend(resolve_invite_post(
              user, group_name, invite, group_hash, resolve_invite))
        # Need to re-authenticate the user to refresh any changes.
        user = authenticate(name, password)
        results.append(('user', user.wrap(get_notifications=True)))
      else:
        results.append(authentication_failed_error)
    except Exception:
      raise
    results.append(('currenttime', now()))
    return '<body>%s</body>' % (wrap(results),)

if not sys.flags.interactive:
  cherrypy.quickstart(IdeaFuturesServer(), "/", "newserver.conf")
