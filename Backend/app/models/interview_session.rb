class InterviewSession < ApplicationRecord
  belongs_to :user
  belongs_to :domain
  has_many :answers, -> { order(:id) }, foreign_key: :session_id, dependent: :destroy, inverse_of: :interview_session
  has_one :report, foreign_key: :session_id, dependent: :destroy

  enum :status, { in_progress: "in_progress", completed: "completed" }, default: :in_progress
end
