class Answer < ApplicationRecord
  belongs_to :interview_session, foreign_key: :session_id
  belongs_to :question
  has_many :attempts, -> { order(:id) }, class_name: "AnswerAttempt", dependent: :delete_all, inverse_of: :answer
end
