# Someone invited to a job's screening interview. They answer through a
# personal link (access_token) without an account.
class Candidate < ApplicationRecord
  STATUSES = %w[invited in_progress completed withdrawn].freeze
  # Where the team has put the candidate. nil means not yet placed: they show
  # as Invited until they finish the interview, then as To review.
  STAGES = %w[shortlisted interviewing offer hired rejected].freeze
  RESUME_STATUSES = %w[skipped pending done failed].freeze

  belongs_to :job
  belongs_to :invited_by, class_name: "User", optional: true
  has_many :answers, -> { order(:position) }, class_name: "CandidateAnswer", dependent: :delete_all
  has_many :scorecards, dependent: :delete_all
  has_many :hiring_events, dependent: :delete_all
  has_many :notes, -> { order(:created_at) }, class_name: "CandidateNote", dependent: :delete_all
  has_many :meetings, -> { order(:starts_at) }, dependent: :destroy

  has_secure_token :access_token, length: 32
  normalizes :email, with: ->(e) { e.strip.downcase }

  validates :name, presence: true, length: { maximum: 100 }
  validates :email, presence: true, format: { with: URI::MailTo::EMAIL_REGEXP },
                    uniqueness: { scope: :job_id, message: "has already been invited to this job" }
  validates :status, inclusion: { in: STATUSES }
  validates :stage, inclusion: { in: STAGES }, allow_nil: true
  validates :resume_status, inclusion: { in: RESUME_STATUSES }, allow_nil: true

  delegate :organization, to: :job

  # The pipeline column the candidate appears in.
  def board_column
    return "withdrawn" if status == "withdrawn"
    return stage if stage

    status == "completed" ? "review" : "invited"
  end

  def interview_url
    ApplicationMailer.app_url("/apply/#{access_token}")
  end

  def consented?
    consented_at.present?
  end

  # The next unanswered question, or nil when all are answered.
  def current_position
    answers.count
  end

  def current_question
    job.questions[current_position]
  end

  def scorecard_average
    values = scorecards.flat_map { |s| s.ratings.values }.grep(Integer)
    values.any? ? (values.sum.to_f / values.size).round(1) : nil
  end

  # The candidate asked to leave: their answers, CV and the AI summaries are deleted.
  def withdraw!
    transaction do
      answers.delete_all
      update!(status: "withdrawn", ai_evaluation: nil, ai_score: nil, evaluation_status: nil,
              resume_data: nil, resume_match: nil, resume_score: nil, resume_status: nil)
      organization.log!("candidate_withdrew", candidate: self)
    end
    # Tell the panel; a Google event that can't be reached is still cancelled here.
    meetings.scheduled.each do |meeting|
      MeetingScheduler.cancel!(meeting, user: nil)
    rescue GoogleCalendar::Error
      meeting.update!(status: "cancelled")
    end
  end
end
