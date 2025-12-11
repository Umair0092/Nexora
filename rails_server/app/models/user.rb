class User < ApplicationRecord
  has_secure_password
  has_many :interview_sessions
  has_many :reports

  validates :email, presence: true, uniqueness: true
end
