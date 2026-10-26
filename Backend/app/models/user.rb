class User < ApplicationRecord
  MAX_EXPERIENCE_ENTRIES = 20
  EXPERIENCE_FIELDS = %w[title company duration description].freeze

  has_secure_password
  has_many :interview_sessions, dependent: :destroy
  has_many :reports, dependent: :destroy

  normalizes :email, with: ->(e) { e.strip.downcase }

  validates :email, presence: true,
                    format: { with: URI::MailTo::EMAIL_REGEXP },
                    uniqueness: { case_sensitive: false }
  validates :password, length: { minimum: 8 }, if: -> { new_record? || password.present? }
  validates :first_name, :last_name, length: { maximum: 50 }
  validates :bio, length: { maximum: 2000 }
  validate :experience_shape

  private

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
