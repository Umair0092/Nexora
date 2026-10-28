# The hiring audit log: who viewed, scored or decided what, and when.
class HiringEvent < ApplicationRecord
  belongs_to :organization
  belongs_to :candidate, optional: true
  belongs_to :user, optional: true
end
