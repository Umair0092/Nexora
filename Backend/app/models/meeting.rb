# A live interview with a candidate: when, where (a video link) and who's on the panel.
# Invitations are calendar files (see CalendarInvite) unless the event lives in the
# organizer's Google Calendar, in which case Google sends them.
class Meeting < ApplicationRecord
  STATUSES = %w[scheduled cancelled].freeze
  PROVIDERS = %w[google_meet zoom teams link].freeze
  DURATIONS = [ 15, 30, 45, 60, 90 ].freeze
  MAX_PANEL = 8

  belongs_to :organization
  belongs_to :candidate
  belongs_to :created_by, class_name: "User", optional: true
  has_many :meeting_panelists, dependent: :delete_all
  has_many :panelists, through: :meeting_panelists, source: :user

  validates :title, presence: true, length: { maximum: 120 }
  validates :starts_at, presence: true
  validates :duration_minutes, inclusion: { in: DURATIONS }
  validates :status, inclusion: { in: STATUSES }
  validates :provider, inclusion: { in: PROVIDERS }
  validates :agenda, length: { maximum: 2000 }
  validates :meeting_url, format: { with: %r{\Ahttps://[^\s]+\z}, message: "must be an https:// link" }, length: { maximum: 500 }, allow_blank: true
  validate :known_time_zone

  before_validation(on: :create) { self.uid ||= "#{SecureRandom.uuid}@nexora" }
  before_validation { self.provider = google_event_id.present? ? "google_meet" : Meeting.provider_for(meeting_url) }

  scope :scheduled, -> { where(status: "scheduled") }
  # Still worth showing: hasn't ended yet.
  scope :upcoming, -> { scheduled.where("starts_at + make_interval(mins => duration_minutes) > ?", Time.current).order(:starts_at) }

  def self.provider_for(url)
    host = URI.parse(url.to_s).host.to_s.downcase
    return "google_meet" if host == "meet.google.com"
    return "zoom" if host == "zoom.us" || host.end_with?(".zoom.us")
    return "teams" if %w[teams.microsoft.com teams.live.com].include?(host)

    "link"
  rescue URI::InvalidURIError
    "link"
  end

  def ends_at
    starts_at + duration_minutes.minutes
  end

  def zone
    ActiveSupport::TimeZone[time_zone] || ActiveSupport::TimeZone["UTC"]
  end

  def scheduled?
    status == "scheduled"
  end

  # Everyone who should have it in their calendar.
  def attendees
    [ candidate.email, *panelists.map(&:email) ].uniq
  end

  private

  def known_time_zone
    errors.add(:time_zone, "isn't a time zone we know") unless ActiveSupport::TimeZone[time_zone.to_s]
  end
end
