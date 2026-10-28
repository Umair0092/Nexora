# Turns an activity log entry into webhook deliveries for every endpoint that
# listens to it. Payloads describe the candidate and the change; screening
# answers and transcripts are never included.
#
#   { "id": "dlv_...", "event": "candidate.stage_changed", "createdAt": "...",
#     "data": { "candidate": {...}, "change": { "from": "shortlisted", "to": "offer" } } }
module WebhookDispatcher
  module_function

  def call(hiring_event)
    name = WebhookEndpoint.event_for(hiring_event.action)
    return unless name

    endpoints = hiring_event.organization.webhook_endpoints.listening_to(name).to_a
    return if endpoints.empty?

    payload = payload(name, hiring_event)
    endpoints.each { |endpoint| deliver(endpoint, name, payload) }
  end

  # Also used by "Send a test event".
  def deliver(endpoint, name, payload)
    id = "dlv_#{SecureRandom.hex(12)}"
    delivery = endpoint.deliveries.create!(event: name, delivery_id: id, payload: payload.merge(id: id))
    WebhookDeliveryJob.perform_later(delivery.id)
    delivery
  end

  def payload(name, e)
    data = {}
    data[:candidate] = candidate(e.candidate) if e.candidate
    data[:change] = { from: e.details["from"], to: e.details["to"] } if name == "candidate.stage_changed"
    if (meeting = e.details["meeting_id"] && e.organization.meetings.find_by(id: e.details["meeting_id"]))
      data[:meeting] = { id: meeting.id, title: meeting.title, startsAt: meeting.starts_at.iso8601, durationMinutes: meeting.duration_minutes,
                         meetingUrl: meeting.meeting_url, status: meeting.status, url: ApplicationMailer.app_url("/hiring/meetings/#{meeting.id}") }
      data[:meeting][:minutesSummary] = meeting.minutes&.dig("summary") if name == "meeting.minutes_ready"
    end
    data[:by] = e.user && { name: HiringSerializer.display_name(e.user), email: e.user.email }
    { id: nil, event: name, createdAt: e.created_at.iso8601, company: e.organization.name, data: data }
  end

  def candidate(c)
    { id: c.id, name: c.name, email: c.email, status: c.status, stage: c.stage, aiScore: c.ai_score, cvMatch: c.resume_score,
      job: { id: c.job_id, title: c.job.title }, url: ApplicationMailer.app_url("/hiring/candidates/#{c.id}") }
  end

  def sample(organization)
    candidate = organization.candidates.order(:id).last
    { id: nil, event: "test.ping", createdAt: Time.current.iso8601, company: organization.name,
      data: { message: "A test event from Nexora. If you can read this, the webhook works.", candidate: candidate && candidate(candidate) } }
  end
end
