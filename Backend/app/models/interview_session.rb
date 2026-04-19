class InterviewSession < ApplicationRecord
  belongs_to :user
  belongs_to :domain
  has_many :answers, foreign_key: :session_id, dependent: :destroy
  has_one :report, foreign_key: :session_id, dependent: :destroy

  enum :status, { in_progress: "in_progress", completed: "completed" }, default: :in_progress
end
