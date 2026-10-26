class Domain < ApplicationRecord
  # Fixed, non-public domains used to file AI interview sessions by type.
  INTERVIEW_TYPE_DOMAINS = {
    "cv" => "CV Interview",
    "role" => "Role-based Interview",
    "complete" => "Complete Interview",
    "behavioral" => "Behavioral Interview"
  }.freeze

  has_many :questions
  has_many :interview_sessions

  scope :visible, -> { where(internal: false) }

  def self.for_interview_type!(interview_type)
    name = INTERVIEW_TYPE_DOMAINS.fetch(interview_type)
    domain = find_or_create_by!(name: name) do |d|
      d.description = "System domain for AI #{name.downcase} sessions"
      d.internal = true
    end
    domain.update!(internal: true) unless domain.internal?
    domain
  end
end
