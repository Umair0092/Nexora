# Matches a candidate's uploaded CV against the job.
class MatchResumeJob < ApplicationJob
  queue_as :default

  def perform(candidate)
    ResumeMatcher.call(candidate) if candidate.resume_status == "pending"
  end
end
