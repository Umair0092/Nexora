# One answer, transcribed from the candidate's voice. The question text is
# copied so the record stays accurate if the job changes later.
class CandidateAnswer < ApplicationRecord
  belongs_to :candidate

  validates :question, :transcript, presence: true
  validates :transcript, length: { maximum: 10_000 }
end
