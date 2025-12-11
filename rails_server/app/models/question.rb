class Question < ApplicationRecord
  belongs_to :domain
  has_many :answers
end
