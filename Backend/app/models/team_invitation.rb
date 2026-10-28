# An emailed invitation to join a company's hiring team. The link is signed,
# expires after a week and stops working once accepted.
class TeamInvitation < ApplicationRecord
  belongs_to :organization
  belongs_to :invited_by, class_name: "User", optional: true

  normalizes :email, with: ->(e) { e.strip.downcase }

  generates_token_for :accept, expires_in: 7.days do
    accepted_at.to_i
  end

  validates :email, presence: true, format: { with: URI::MailTo::EMAIL_REGEXP }
  validates :role, inclusion: { in: Membership::ROLES }
  validates :email, uniqueness: { scope: :organization_id, conditions: -> { where(accepted_at: nil) },
                                  message: "has already been invited" }

  scope :pending, -> { where(accepted_at: nil) }

  # Adds `user` to the company. Returns the membership; raises
  # ActiveRecord::RecordInvalid if they already belong to a company.
  def accept!(user)
    transaction do
      membership = organization.memberships.create!(user: user, role: role)
      update!(accepted_at: Time.current)
      organization.log!("member_joined", user: user, email: email)
      membership
    end
  end
end
