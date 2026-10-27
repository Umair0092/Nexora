# Deletes interviews nobody has touched for LiveInterview::TTL.
class PurgeLiveInterviewsJob < ApplicationJob
  queue_as :default

  def perform
    count = LiveInterview.expired.delete_all
    Rails.logger.info("Purged #{count} expired live interviews") if count.positive?
  end
end
