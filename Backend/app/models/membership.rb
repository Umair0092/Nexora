# A user's place in a company. Owners manage the team; recruiters run hiring.
class Membership < ApplicationRecord
  ROLES = %w[owner recruiter].freeze

  belongs_to :organization
  belongs_to :user

  validates :role, inclusion: { in: ROLES }
  validates :user_id, uniqueness: { message: "already belongs to a company" }

  def owner?
    role == "owner"
  end
end
