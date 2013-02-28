# Script to make all names lowercase.
# Note that this doesn't fix the user table.
claims = Claim.find()
for claim in claims:
  for row in claim.history:
    row['user'] = row['user'].lower()
  claim.owner = claim.owner.lower()
  assert(claim.save())

groups = Group.find()
for group in groups:
  for email in group.invites:
    group.invites[email] = group.invites[email].lower()
  group.owner = group.owner.lower()
  assert(group.save())
