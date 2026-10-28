# A company that screens candidates with Nexora.
class Organization < ApplicationRecord
  has_many :memberships, dependent: :delete_all
  has_many :users, through: :memberships
  has_many :team_invitations, dependent: :delete_all
  has_many :jobs, dependent: :destroy
  has_many :candidates, through: :jobs
  has_many :hiring_events, dependent: :delete_all
  has_many :meetings, dependent: :destroy
  has_many :webhook_endpoints, dependent: :destroy

  RETENTION_MONTHS = [ 6, 12, 24 ].freeze
  validates :retention_months, inclusion: { in: RETENTION_MONTHS }, allow_nil: true
  has_many :email_templates, -> { order(:name) }, dependent: :delete_all

  after_create :add_default_email_templates

  validates :name, presence: true, length: { maximum: 100 }

  # Appends to the audit log. `details` must not contain answers or personal data.
  def log!(action, user: nil, candidate: nil, **details)
    event = hiring_events.create!(action: action, user: user, candidate: candidate, details: details)
    WebhookDispatcher.call(event)
    event
  end

  # Companies created before templates existed get the defaults on first use.
  def add_default_email_templates
    EmailTemplate::DEFAULTS.each { |t| email_templates.create!(t) } if email_templates.none?
  end
end
