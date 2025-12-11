class Domain < ApplicationRecord
  has_many :questions
  has_many :interview_sessions
end
