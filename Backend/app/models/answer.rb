class Answer < ApplicationRecord
  belongs_to :interview_session, foreign_key: :session_id
  belongs_to :question
end
