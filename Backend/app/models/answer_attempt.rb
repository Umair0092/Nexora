# A retry of one report question, scored by the AI service (never by the client).
class AnswerAttempt < ApplicationRecord
  belongs_to :answer
end
