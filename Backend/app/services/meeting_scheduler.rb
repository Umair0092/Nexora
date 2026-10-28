# Creates, reschedules and cancels live interviews, and tells everyone.
#
# With a Google Meet link the event lives in the organizer's Google Calendar and
# Google sends the invitations. Otherwise each attendee gets an email with a
# calendar file, and later changes go out as updates to the same event.
#
#   MeetingScheduler.schedule!(meeting, google: current_user.calendar_connection)
#   MeetingScheduler.reschedule!(meeting, starts_at: ..., panelist_ids: [...])
#   MeetingScheduler.cancel!(meeting)
#
# Raises ActiveRecord::RecordInvalid or GoogleCalendar::Error; nothing is saved or sent then.
module MeetingScheduler
  module_function

  def schedule!(meeting, google: nil)
    meeting.validate!
    if google
      event = GoogleCalendar.create_event(google, meeting)
      meeting.assign_attributes(google_event_id: event[:id], meeting_url: event[:meet_url].presence || meeting.meeting_url)
    end
    begin
      meeting.save!
    rescue ActiveRecord::RecordInvalid
      GoogleCalendar.cancel_event(google, meeting) if google && meeting.google_event_id
      raise
    end
    invite(meeting, meeting.attendees) unless meeting.google_event_id
    meeting.organization.log!("meeting_scheduled", user: meeting.created_by, candidate: meeting.candidate, meeting_id: meeting.id)
    meeting
  end

  def reschedule!(meeting, user:, **attrs)
    before = meeting.attendees
    Meeting.transaction do
      panelist_ids = attrs.delete(:panelist_ids)
      meeting.assign_attributes(attrs)
      meeting.sequence += 1
      meeting.panelist_ids = panelist_ids unless panelist_ids.nil?
      meeting.save!
      GoogleCalendar.update_event(google_for(meeting), meeting) if meeting.google_event_id
    end
    unless meeting.google_event_id
      invite(meeting, meeting.attendees, update: true)
      (before - meeting.attendees).each { |email| HiringMailer.meeting_cancelled(meeting, email).deliver_later }
    end
    meeting.organization.log!("meeting_rescheduled", user: user, candidate: meeting.candidate, meeting_id: meeting.id)
    meeting
  end

  def cancel!(meeting, user:)
    Meeting.transaction do
      meeting.update!(status: "cancelled", sequence: meeting.sequence + 1)
      GoogleCalendar.cancel_event(google_for(meeting), meeting) if meeting.google_event_id
    end
    meeting.attendees.each { |email| HiringMailer.meeting_cancelled(meeting, email).deliver_later } unless meeting.google_event_id
    meeting.organization.log!("meeting_cancelled", user: user, candidate: meeting.candidate, meeting_id: meeting.id)
    meeting
  end

  def invite(meeting, emails, update: false)
    emails.each { |email| HiringMailer.meeting_invitation(meeting, email, update: update).deliver_later }
  end

  # Google events can only be changed through the calendar they were made in.
  def google_for(meeting)
    meeting.created_by&.calendar_connection ||
      raise(GoogleCalendar::Error, "This event is in a disconnected Google Calendar. Its organizer needs to reconnect it.")
  end
end
