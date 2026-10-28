class MeetingMinutesJob < ApplicationJob
  queue_as :default

  def perform(meeting_id)
    meeting = Meeting.find_by(id: meeting_id)
    return unless meeting && Array(meeting.transcript).any?

    MeetingMinutes.call(meeting)
    return unless meeting.minutes_status == "done"

    meeting.organization.log!("minutes_ready", candidate: meeting.candidate, meeting_id: meeting.id)
    meeting.panelists.each { |user| HiringMailer.minutes_ready(meeting, user).deliver_later }
  end
end
