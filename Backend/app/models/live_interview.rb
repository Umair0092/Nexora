# An interview or quiz in progress. `state` holds everything CvInterview or
# QuizRun needs, so a deploy or restart doesn't lose it. Rows are deleted once
# the report is saved, and purged after TTL of inactivity.
#
#   live = LiveInterview.start!(user, CvInterview.build(...))
#   LiveInterview.open!(user, live.id, "cv") { |interview| interview.answer!("...", nil) }
class LiveInterview < ApplicationRecord
  KINDS = { "cv" => CvInterview, "quiz" => QuizRun }.freeze
  TTL = (ENV.fetch("LIVE_INTERVIEW_TTL_MINUTES", 180).to_i.nonzero? || 180).minutes
  # Starting one more evicts the user's oldest of that kind.
  MAX_PER_USER = 5
  EXPIRED = "This interview has expired, so it can't be continued or scored. Start a new one.".freeze

  class Expired < StandardError
    def initialize(message = EXPIRED)
      super
    end
  end

  belongs_to :user

  validates :kind, inclusion: { in: KINDS.keys }

  scope :active, -> { where(updated_at: TTL.ago..) }
  scope :expired, -> { where(updated_at: ...TTL.ago) }

  def self.start!(user, engine)
    kind = KINDS.key(engine.class)
    live = user.live_interviews.create!(kind: kind, state: engine.state)
    stale = user.live_interviews.where(kind: kind).order(updated_at: :desc, created_at: :desc).offset(MAX_PER_USER).pluck(:id)
    where(id: stale).delete_all if stale.any?
    live
  end

  # Locks the user's interview, yields its engine and saves the state when the
  # block returns. Nothing is saved when the block raises. Any other user's id,
  # an expired one or a malformed one raises Expired, never revealing which.
  def self.open!(user, id, kind)
    raise Expired unless id.is_a?(String) && id.match?(/\A\h{8}-\h{4}-\h{4}-\h{4}-\h{12}\z/)

    transaction do
      live = user.live_interviews.active.where(kind: kind).lock.find_by(id: id)
      raise Expired unless live

      engine = KINDS.fetch(kind).new(live.state)
      result = yield engine
      live.state = engine.state
      live.updated_at = Time.current
      live.save!
      result
    end
  end
end
