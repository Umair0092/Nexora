# A user's place in a company. Owners manage the team; recruiters run hiring.
class Membership < ApplicationRecord
  ROLES = %w[owner recruiter].freeze

  belongs_to :organization
  belongs_to :user

  validates :role, inclusion: { in: ROLES }
  validates :user_id, uniqueness: { message: "already belongs to a company" }

  # Joining or founding a company moves the account into the hiring workspace.
  after_create { user.update_columns(account_type: "employer") unless user.employer? }

  def owner?
    role == "owner"
  end
end
