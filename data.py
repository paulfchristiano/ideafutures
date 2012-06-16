import pymongo
from pymongo.objectid import ObjectId

db = pymongo.Connection('localhost').test

# Class required to define class-level properties.
#
# Usage: before a class property, add both the @classproperty and @classmethod
# decorators, in that order. This method overrides @classmethod's __get__.
class classproperty(property):
  def __get__(self, cls, owner):
    return self.fget.__get__(None, owner)()

# Returns a field:value mapping given a tuple of fields and values data. The
# values may be pased in as a dictionary, list, or tuple. If 'values' is a
# dictionary it should have 'fields' as a subset of its keys; if it is a list or
# tuple, it should be the same length as 'fields'. Throws an error if these
# conditions are not satisfied.
def convert_to_dict(fields, values):
  if type(values) == dict:
    assert(set(fields).issubset(set(values.keys())))
    return {field:values[field] for field in fields}
  elif type(values) in (list, tuple):
    assert(len(fields) == len(values))
    return {fields[i]:values[i] for i in range(len(fields))}
  return None

# Return a getter for a member 'name' of an object. Used to construct
# properties. The 'name' is stored as a function parameter.
def make_getter(name):
  return lambda self: self.__dict__[name]

# Base class for all data objects. 'fields' should be a list of strings. The
# first 'num_key_fields' of those fields are enough to uniquely identify a
# data object. The values of an object's fields are stored in the object's
# '__dict__' so they can be accessed with a dot.
#
# None of the fields should be 'id'.
class Data(object):
  collection = None
  fields = tuple()
  num_key_fields = int()
  has_key_properties = False

  # Returns a tuple containing the key fields of this object.
  @classproperty
  @classmethod
  def keys(cls):
    return cls.fields[:cls.num_key_fields]

  # Returns a tuple of attributes corresponding to each field of this class.
  # Key fields are appended with '_', while value fields are not. The result
  # is cached for all Data objects of the same type.
  @classproperty
  @classmethod
  def internal_fields(cls):
    if 'internal_fields_' not in cls.__dict__:
      cls.internal_fields_ = \
          tuple(key + '_' for key in cls.fields[:cls.num_key_fields]) + \
          tuple(field for field in cls.fields[cls.num_key_fields:])
    return cls.internal_fields_

  # Returns a tuple for the internal key fields of this object.
  @classproperty
  @classmethod
  def internal_keys(cls):
    return cls.internal_fields[:cls.num_key_fields]

  # Takes a dict and replaces all entries for key fields with entries for their
  # internal names.
  @classmethod
  def internalize(cls, keys_dict):
    for (key, internal_key) in zip(cls.keys, cls.internal_keys):
      keys_dict[internal_key] = keys_dict[key]
      del keys_dict[key]
    return keys_dict

  # Adds properties for this Data class's key fields if they do not already
  # exist. Called on __init__().
  @classmethod
  def add_key_properties(cls):
    if not cls.has_key_properties:
      setattr(cls, 'id', property(make_getter('id_')))
      for (key, internal_key) in zip(cls.keys, cls.internal_keys):
        setattr(cls, key, property(make_getter(internal_key)))
      cls.has_key_properties = True

  # Retrieves a data object from the database. User can specify the record's id
  # or its key fields, but not both. Returns None if the record is not found.
  @classmethod
  def get(cls, keys=None, id=None):
    assert((id is not None) + (keys is not None)) == 1
    if keys is not None:
      if type(keys) not in (list, tuple, dict):
        keys = (keys,)
      keys_dict = cls.internalize(convert_to_dict(cls.keys, keys))
      values = db[cls.collection].find_one(keys_dict)
    else:
      id = ObjectId(id) if type(id) == str else id
      values = db[cls.collection].find_one({'_id':id})
    if values is None:
      return None
    data = cls(values, internal=True)
    data.id_ = values['_id']
    return data

  # Performs a MongoDB search on the database, then returns the documents found
  # as Data objects.
  # This method automatically changes key fields in the search to internal key
  # fields. As an optimization, if the query contains no key fields, the user
  # can skip this step by setting 'uses_key_fields' to False.
  @classmethod
  def find(cls, query, uses_key_fields=True):
    if uses_key_fields:
      def sanitize(query):
        for (key, internal_key) in zip(cls.keys, cls.internal_keys):
          if key in query:
            query[internal_key] = query[key]
            del query[key]
        for val in query.values():
          if type(val) == dict:
            sanitize(val)
      sanitize(query)
    results = []
    for values in db[cls.collection].find(query):
      result = cls(values, internal=True)
      result.id_ = values['_id']
      results.append(result)
    return results

  # Constructs a new object from its values. Does not save it to the database.
  def __init__(self, values, internal=False):
    self.__class__.add_key_properties()
    values_dict = values if internal else \
        self.internalize(convert_to_dict(self.fields, values))
    self.__dict__.update(values_dict)

  # Saves this object to the database. Throws an error if this object does not
  # have an id and an object with the same keys already exists in the database.
  def save(self):
    values_dict = convert_to_dict(self.internal_fields, self.__dict__)
    if 'id_' in self.__dict__:
      db[self.collection].update({'_id':self.id}, {'$set':values_dict})
    else:
      keys_dict = convert_to_dict(self.internal_keys, self.__dict__)
      assert(db[self.collection].find_one(keys_dict) is None)
      self.id_ = db[self.collection].insert(values_dict)

  # Returns a dictionary representing this object, keyed by its fields.
  def to_dict(self):
    return {field:self.__dict__[internal_field] \
        for (field, internal_field) in zip(self.fields, self.internal_fields)}

  def __repr__(self):
    return str(self)

  def __str__(self):
    return '%s(%s)' % (self.__class__.__name__, self.to_dict())

# Examples of usage.
class TestData(Data):
  collection = 'testdata'
  fields = ('key1', 'value1')
  num_key_fields = 1
