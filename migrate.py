#!/usr/bin/python
import MySQLdb
from data import Data, db
from datetime import datetime

cursor = MySQLdb.connect("sql.mit.edu", "paulfc", "guk38qaq", "paulfc+bets").cursor()

class User(Data):
  collection = 'users'
  fields = ('name', 'password', 'reputation', 'domains')
  num_key_fields = 1

class Claim(Data):
  collection = 'claims'
  fields = ('uid', 'age', 'bounty', 'closes', 'currentbet', 'description', \
            'domain', 'lastbetter', 'lastbettime', 'maxstake', 'owner', \
            'promoted', 'resolved', 'definition')
  num_key_fields = 1

def getAllUsers():
  cursor.execute("SELECT name, password, reputation, domains FROM users")
  users = []
  for row in cursor.fetchall():
    result = {}
    result['name'] = row[0]
    result['password'] = row[1]
    result['reputation'] = float(row[2])
    # Initialize all users' domains to ['promoted']
    #result['domains'] = row[3].split(' ')
    result['domains'] = ['promoted']
    users.append(User(result))
    print result
  return users

def getAllClaims():
  cursor.execute("SELECT id, age, bounty, closes, currentbet, description, domain, lastbetter, lastbettime, maxstake, owner, promoted, resolved, definition FROM topics")
  claims = []
  id = 0
  for row in cursor.fetchall():
    result = {}
    # check id type but assign new uid
    int(row[0])
    result['uid'] = id
    assert(type(row[1]) == datetime)
    result['age'] = row[1]
    result['bounty'] = float(row[2])
    assert(row[3] is None or type(row[3]) == datetime)
    result['closes'] = row[3]
    result['currentbet'] = float(row[4])
    result['description'] = row[5]
    result['domain'] = row[6]
    result['lastbetter'] = row[7]
    assert(type(row[8]) == datetime)
    result['lastbettime'] = row[8]
    result['maxstake'] = float(row[9]) 
    result['owner'] = row[10]
    assert(int(row[11]) in (0, 1))
    result['promoted'] = int(row[11])
    assert(int(row[12]) in (0, 1))
    result['resolved'] = int(row[12])
    result['definition'] = row[13]
    claims.append(Claim(result))
    print result
    id += 1
  return claims

print 'Users:'
users = getAllUsers()
print '\nClaims:'
claims = getAllClaims()

# Warning: only uncomment the next two lines if you're okay with wiping the
# mongod instance!
# # # db.drop_collection(User.collection)
# # # db.drop_collection(Claim.collection)

# Warning: only uncomment the next few lines if you're okay with moving all of
# the SQL data to the mongod instance!
# # for user in users:
# #   if user.name in ('paulfc', 'skishore'):
# #     user.save()
# # for claim in claims:
# #   claim.save()
