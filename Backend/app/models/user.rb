class User < ApplicationRecord
  MAX_EXPERIENCE_ENTRIES = 20
  EXPERIENCE_FIELDS = %w[title company duration description].freeze

  ACCOUNT_TYPES = %w[candidate employer].freeze
  MAX_WEEKLY_GOAL = 14
  REMINDER_GAP = 3.days

  has_secure_password
  has_many :interview_sessions, dependent: :destroy
  has_many :reports, dependent: :destroy
  has_many :live_interviews, dependent: :delete_all
  has_one :membership, dependent: :destroy
  has_one :organization, through: :membership
  has_one :calendar_connection, dependent: :destroy

  normalizes :email, with: ->(e) { e.strip.downcase }

  # Signed, expiring tokens for links sent by email. Each one embeds a value that
  # changes once the link has been used, which makes the links single-use.
  generates_token_for :password_reset, expires_in: 30.minutes do
    password_salt.last(10)
  end

  generates_token_for :email_verification, expires_in: 3.days do
    [ email, email_verified_at.to_i ]
  end

  generates_token_for :unsubscribe do
    email
  end

  validates :email, presence: true,
                    format: { with: URI::MailTo::EMAIL_REGEXP },
                    uniqueness: { case_sensitive: false }
  validates :password, length: { minimum: 8 }, if: -> { new_record? || password.present? }
  validates :first_name, :last_name, length: { maximum: 50 }
  validates :bio, length: { maximum: 2000 }
  validates :account_type, inclusion: { in: ACCOUNT_TYPES, message: "must be candidate or employer" }
  validate :stays_employer_while_on_a_team
  validates :weekly_goal, numericality: { only_integer: true, in: 1..MAX_WEEKLY_GOAL }
  validate :experience_shape

  # Verified users with reminders on who haven't finished an interview, or been
  # reminded, within REMINDER_GAP.
  scope :due_for_reminder, ->(now = Time.current) {
    cutoff = now - REMINDER_GAP
    recent_practice = InterviewSession.where(status: "completed").where("interview_sessions.completed_at > ?", cutoff)
                                      .where("interview_sessions.user_id = users.id")
    where(reminders_enabled: true)
      .where.not(email_verified_at: nil)
      .where("users.last_reminded_at IS NULL OR users.last_reminded_at <= ?", cutoff)
      .where.not(recent_practice.arel.exists)
  }

  def employer?
    account_type == "employer"
  end

  def email_verified?
    email_verified_at.present?
  end

  def verify_email!
    update!(email_verified_at: Time.current) unless email_verified?
  end

  def last_practiced_at
    interview_sessions.where(status: "completed").maximum(:completed_at)
  end

  # Deletes the account and everything it owns, including the per-answer
  # questions created for its interviews. In-progress interviews go with it
  # (live_interviews cascades on delete).
  # A company's last member takes the company (jobs, candidates) with them; an
  # owner leaving others behind hands ownership to the longest-standing member.
  def destroy_with_data!
    transaction do
      question_ids = Answer.joins(:interview_session).where(interview_sessions: { user_id: id }).pluck(:question_id)
      hand_over_company
      destroy!
      Question.where(id: question_ids).where.missing(:answers).delete_all
    end
  end

  private

  def hand_over_company
    return unless membership

    org = membership.organization
    others = org.memberships.where.not(user_id: id).order(:created_at)
    if others.none?
      org.destroy!
    elsif membership.owner? && !others.exists?(role: "owner")
      others.first.update!(role: "owner")
    end
  end

  def stays_employer_while_on_a_team
    return unless will_save_change_to_account_type? && !employer? && membership

    errors.add(:account_type, "can't change while you're on a company's hiring team")
  end

  def experience_shape
    return if experience.nil?

    unless experience.is_a?(Array)
      errors.add(:experience, "must be a list")
      return
    end

    if experience.size > MAX_EXPERIENCE_ENTRIES
      errors.add(:experience, "can have at most #{MAX_EXPERIENCE_ENTRIES} entries")
    end

    valid = experience.all? do |entry|
      entry.is_a?(Hash) &&
        (entry.keys.map(&:to_s) - EXPERIENCE_FIELDS).empty? &&
        entry.values.all? { |v| v.nil? || v.is_a?(String) }
    end
    errors.add(:experience, "entries must contain only string fields: #{EXPERIENCE_FIELDS.join(', ')}") unless valid
  end
end
