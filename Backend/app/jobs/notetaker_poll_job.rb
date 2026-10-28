# Every couple of minutes: asks the notetaker service how each active bot is
# doing, and once a call is over, saves the transcript and writes the minutes.
# Polling (instead of webhooks) works on any host, including localhost.
class NotetakerPollJob < ApplicationJob
  queue_as :default

  ACTIVE = %w[scheduled joining waiting_room recording processing].freeze

  def perform
    return unless MeetingBot.configured?

    # Bots booked for later don't change until close to their start time.
    Meeting.where(notetaker_status: ACTIVE).where.not(bot_id: nil).where(starts_at: ..15.minutes.from_now).find_each do |meeting|
      check(meeting)
    end
  end

  def check(meeting)
    status = MeetingBot.status(meeting.bot_id)
    state = status[:state] || meeting.notetaker_status
    if state == "done" && status[:transcript_url]
      transcript = MeetingBot.transcript(status[:transcript_url])
      meeting.update!(notetaker_status: "done", transcript: transcript, transcript_source: "bot", minutes_status: "pending")
      meeting.organization.log!("meeting_transcribed", candidate: meeting.candidate, meeting_id: meeting.id, source: "notetaker")
      MeetingMinutesJob.perform_later(meeting.id)
    elsif state == "failed"
      meeting.update!(notetaker_status: "failed", notetaker_error: failure_message(status))
    elsif state != meeting.notetaker_status
      meeting.update!(notetaker_status: state)
    end
  rescue MeetingBot::Error => e
    Rails.logger.warn("Notetaker check for meeting #{meeting.id}: #{e.message}")
  end

  def failure_message(status)
    case status[:sub_code].to_s
    when /waiting_room|timeout/ then "Nobody let the notetaker in from the waiting room."
    when /denied|permission/ then "The host didn't allow the notetaker to record."
    else "The notetaker couldn't record this call."
    end
  end
end
