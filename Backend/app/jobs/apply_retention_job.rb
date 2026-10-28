# Daily: anonymises candidates nobody has touched for longer than their
# company's retention period (see Candidate#anonymize!). Companies without a
# period keep data until someone deletes it.
class ApplyRetentionJob < ApplicationJob
  queue_as :default

  def perform
    Organization.where.not(retention_months: nil).find_each do |org|
      cutoff = org.retention_months.months.ago
      stale = org.candidates.where(anonymized_at: nil).where("candidates.updated_at < ? AND candidates.created_at < ?", cutoff, cutoff)
      # Upcoming interviews mean someone still needs the details.
      stale = stale.where.not(id: org.meetings.upcoming.select(:candidate_id))
      count = 0
      stale.find_each do |candidate|
        candidate.anonymize!
        count += 1
      end
      # Names kept in old log entries about deleted candidates go too.
      org.hiring_events.where(action: "candidate_deleted", created_at: ...cutoff).where("details ? 'name'").update_all(details: {})
      org.log!("retention_applied", months: org.retention_months, anonymized: count) if count.positive?
    end
  end
end
