# Books the notetaker bot for a meeting (or sends it now, when the call is soon).
class NotetakerJob < ApplicationJob
  queue_as :default

  def perform(meeting_id)
    meeting = Meeting.find_by(id: meeting_id)
    return unless meeting&.scheduled? && meeting.notetaker && meeting.meeting_url.present? && meeting.bot_id.blank?

    meeting.update!(bot_id: MeetingBot.create(meeting), notetaker_status: "scheduled", notetaker_error: nil)
  rescue MeetingBot::Error => e
    meeting&.update!(notetaker_status: "failed", notetaker_error: e.message)
  end
end
