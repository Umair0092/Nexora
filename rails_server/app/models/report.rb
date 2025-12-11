class Report < ApplicationRecord
  belongs_to :interview_session, foreign_key: :session_id
  belongs_to :user
end
