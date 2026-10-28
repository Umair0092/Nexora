# Writes the advisory AI summary once a candidate finishes.
class EvaluateCandidateJob < ApplicationJob
  queue_as :default

  def perform(candidate)
    CandidateEvaluator.call(candidate) if candidate.status == "completed"
  end
end
