# Where a company wants hiring events posted. Each request is signed with the
# endpoint's secret (see WebhookDeliveryJob), and the URL must be public https.
class WebhookEndpoint < ApplicationRecord
  # Event name -> the activity log action that triggers it.
  EVENTS = {
    "candidate.invited" => "candidate_invited",
    "candidate.completed" => "candidate_completed",
    "candidate.stage_changed" => "stage_changed",
    "candidate.withdrew" => "candidate_withdrew",
    "meeting.scheduled" => "meeting_scheduled",
    "meeting.cancelled" => "meeting_cancelled",
    "meeting.minutes_ready" => "minutes_ready"
  }.freeze
  MAX_PER_COMPANY = 5

  belongs_to :organization
  has_many :deliveries, -> { order(created_at: :desc) }, class_name: "WebhookDelivery", dependent: :delete_all

  encrypts :secret

  validates :url, presence: true, length: { maximum: 500 }, format: { with: %r{\Ahttps://[^\s/$.?#][^\s]*\z}i, message: "must be an https:// address" }
  validate :events_known
  validate :public_host, if: :will_save_change_to_url?
  validate :within_limit, on: :create

  before_validation(on: :create) { self.secret ||= "whsec_#{SecureRandom.hex(24)}" }

  scope :listening_to, ->(event) { where(active: true).where("events @> ?", [ event ].to_json) }

  def self.event_for(action)
    EVENTS.key(action)
  end

  private

  def events_known
    errors.add(:events, "must include at least one event") if events.blank?
    errors.add(:events, "has an unknown event") unless Array(events).all? { |e| EVENTS.key?(e) }
  end

  def public_host
    errors.add(:url, "must be a public address, not localhost or a private network") unless SafeUrl.public?(url)
  end

  def within_limit
    errors.add(:base, "A company can have up to #{MAX_PER_COMPANY} webhooks") if organization && organization.webhook_endpoints.count >= MAX_PER_COMPANY
  end
end
