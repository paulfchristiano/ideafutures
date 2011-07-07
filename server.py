#!/usr/bin/python
from math import log
from datetime import datetime
import pymongo
import cherrypy
import sys

db = pymongo.Connection("localhost").ideafutures
datacache = {}
dependencies = {}
computationcache = {}

class Data:

    collection = None
    required_fields = frozenset()
    default_fields = dict()

    def fields(self):
        return sef.__dict__

    def validate(self)
        if not required_fields.issubset(self.fields().keys()):
            print("Missing fields " + required_fields.difference(self.fields().keys()))
        else:
            return self

    def save(self):
        if id:
            datacache[id] = self.fields()
            for computation in dependencies[id]:
                computation.calculate()
            db[collection].update({'id':self.id}, {'$set':self.fields()}, True)
        else:
            self.id = self.getid()
            db[collection].insert(self.fields())
        return self;

    def byField(self, fieldname, fieldvalue):
        values = db[collection].find_one({fieldname:fieldvalue})
        return self.update(values)

    def load(self, id=None):
        if not id:
            id = self.id
        if id in datacache:
            values = datacache[id]
        else:
            values = db[collection].find_one({'id':self.id})
            datacache[id] = values
        return self.update(values)

    def __repr__(self):
        return repr(self.fields())

    def __init__(self, values):
        self.update(values)

    def update(self, values):
        self.fields().update(values)
        if not self.fresh():
            self.calculate()
        return self

    def calculate(self):
        return self

    def getid(self):
        db.nextid.find_and_modify(update= {'$inc': {'nextid':1}})['nextid']

class Cached:

    name = None
    required_args = ()
    default_args = {}

    def __init__(self, args):
        self.args = args
        self.args.update(default_args)
        argtuple = self.argtutple()
        if argtuple in computationcache:
            self.value = computationcache[argtuple]
        else:
            for arg, value in args.items():
                dependencies.setdefault(value, []).append(self)
            self.calculate()
            computationcache[argtuple] = self.value

    def argtuple(self):
        return tuple([self.args[arg] for arg in self.required_args])

    def validate(self):
        if not set(required_args).issubset(self.args.keys()):
            print("Missing arguments " + required_fields.difference(self.fields().keys()))
        else:
            return self

    def calculate(self):
        self.value = {}
        return self
    
class Claim(Data):

    collection = "claims"
    required_fields = frozenset(["description", "definition", "owner", "modified", "created", "estimate", "size", "open", "domains", "outcomes", "lastmodifier"])
    default_fields = dict(outcomes=[True, False])
    
class Bet(Data):

    collection = "bets"
    required_fields = frozenset(["owner", "estimate", "created", "claim", "oldestimate"])

    def value(self, outcome):
        size = Claim().load(self.claim).size
        return size * ( score(self.estimate[outcome]) - score(self.oldestimate[outcome]) )

class Domain(Data):

    collection = "domains"
    required_fields = frozenset(["name", "description"])

class Stake(Cached):

    required_args = ('user', 'claim') 

    def calculate(self):
        claim = Claim().load(self.args.claim).estimate
        value = {}
        value.payoff = {}
        value.modified = claim.created
        value.exists = False
        for outcome in claim.outcomes:
            value.payoff[outcome] = 0
        for bet in db.bets.find({'claim':self.claim, 'owner':self.args.user})
            value.exists = True
            value.modified = max(bet.created, self.modified)
            for outcome in claim.outcomes:
                value.payoff[outcome] += bet.value(outcome)
        value.payoff['expected'] = sum([probability * value.payoff[outcome] for outcome, probability in claim.estimate.items()])
        self.value = value
        return self

def make_bet(user, claim_id, estimate):
    claim = Claim().load(claim_id)
    oldestimate = claim.estimate
    dt = datetime.datetime.utcnow()
    claim.update({'modified':dt, 'lastmodifier':user}).save()
    return Bet({'owner':user, 'estimate':estimate, 'created':dt, 'claim':claim_id, 'oldestimate':oldestimate}).save()

def score(p):
    return math.log(p)

def get_claims(domains=[Domain().byField('name', 'promoted').id], limit=20, open=True):
    query = { 'domains': {'$in':domains} }
    if open:
        query['open'] = True
    return db.claims.find(open).sort({'modified':-1}).limit(limit)

def history(claim, limit=20):
    return db.bets.find({'claim':claim}).sort({'created':-1}).limit(limit)

def get_stakes(user):
    db.bets.distinct({'owner':user}
