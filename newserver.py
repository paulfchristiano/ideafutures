#!/usr/bin/python
import cherrypy
from datetime import datetime
from math import log
import pymongo
from pymongo.objectid import ObjectId

db = pymongo.Connection("localhost").test

# Returns a field:value mapping given a tuple of fields and values data. The
# values may be pased in as a dictionary, list, or tuple. If 'values' is a
# dictionary it should have 'fields' as a subset of its keys; if it is a list or
# tuple, it should be the same length as 'fields'. Throws an error if these 
# conditions are not satisfied.
def get_fields_dict(fields, values):
  if type(values) == dict:
    assert(set(fields).issubset(set(values.keys())))
    return {field:values[field] for field in fields}
  elif type(values) in (list, tuple):
    assert(len(fields) == len(values))
    return {fields[i]:values[i] for i in range(len(fields))}
  return None

# Base class for all data objects. 'fields' should be a list of strings. The
# first 'num_key_fields' of those fields are enough to uniquely identify a
# data object. The values of an object's fields are stored in the object's
# '__dict__' so they can be accessed with a dot.
#
# None of the fields should be 'id'.
class Data():
  collection = None
  fields = tuple()
  num_key_fields = int()

  # Returns True if this object has all of its required fields.
  def validate(self):
    return all(field in self.__dict__ for field in self.fields)

  # Retrieves a record from the database. User can specify the record's id or
  # its key fields, but not both. Returns None if the record is not found.
  @classmethod
  def get(cls, keys=None, id=None):
    assert((id is not None) + (keys is not None)) == 1
    if keys is not None:
      keys_dict = get_fields_dict(cls.fields[:cls.num_key_fields], keys)
      values = db[cls.collection].find_one(keys_dict)
    else:
      id = ObjectId(id) if type(id) == str else id
      values = db[cls.collection].find_one({'_id':id})
    if values is None:
      return None
    data = cls(values)
    data.id = values['_id']
    return data

  # Constructs a new object from its values. Does not save it to the database.
  def __init__(self, values):
    self.__dict__.update(get_fields_dict(self.fields, values))
    if id is not None:
      self.id = id

  # Saves this object to the database. Throws an error if this object does not
  # have an id and an object with the same keys already exists in the database.
  def save(self):
    values_dict = get_fields_dict(self.fields, self.__dict__)
    if 'id' in self.__dict__:
      db[self.collection].update({'_id':self.id}, {'$set':values_dict})
    else:
      keys_dict = get_fields_dict(
          self.fields[:self.num_key_fields], self.__dict__)
      assert(db[self.collection].find_one(keys_dict) is None)
      self.id = db[self.collection].insert(values_dict)

class TestData(Data):
  collection = 'testdata'
  fields = ('key1', 'value1')
  num_key_fields = 1
