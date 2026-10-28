# Calendar files and "add to calendar" links for a meeting.
#
#   CalendarInvite.ics(meeting)                    # => "BEGIN:VCALENDAR..." (METHOD:REQUEST)
#   CalendarInvite.ics(meeting, method: "CANCEL")  # tells calendars to remove it
#   CalendarInvite.google_url(meeting)             # opens Google Calendar with the event filled in
#   CalendarInvite.outlook_url(meeting)
#
# Calendars match updates by UID and keep the one with the highest SEQUENCE,
# so a reschedule or cancellation replaces the original in place.
module CalendarInvite
  module_function

  def ics(meeting, method: "REQUEST")
    organizer = meeting.created_by
    lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Nexora//Interviews//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:#{method}",
      "BEGIN:VEVENT",
      "UID:#{meeting.uid}",
      "SEQUENCE:#{meeting.sequence}",
      "DTSTAMP:#{stamp(Time.current)}",
      "DTSTART:#{stamp(meeting.starts_at)}",
      "DTEND:#{stamp(meeting.ends_at)}",
      "SUMMARY:#{escape(meeting.title)}",
      "DESCRIPTION:#{escape(description(meeting))}",
      ("LOCATION:#{escape(meeting.meeting_url)}" if meeting.meeting_url.present?),
      ("URL:#{meeting.meeting_url}" if meeting.meeting_url.present?),
      ("ORGANIZER;CN=#{param(HiringSerializer.display_name(organizer))}:mailto:#{organizer.email}" if organizer),
      *meeting.attendees.map { |email| "ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:#{email}" },
      "STATUS:#{method == 'CANCEL' ? 'CANCELLED' : 'CONFIRMED'}",
      "END:VEVENT",
      "END:VCALENDAR"
    ].compact
    lines.map { |line| fold(line) }.join("\r\n") + "\r\n"
  end

  def google_url(meeting)
    query = { action: "TEMPLATE", text: meeting.title, dates: "#{stamp(meeting.starts_at)}/#{stamp(meeting.ends_at)}",
              details: description(meeting), location: meeting.meeting_url.to_s }
    "https://calendar.google.com/calendar/render?#{query.to_query}"
  end

  def outlook_url(meeting)
    query = { path: "/calendar/action/compose", rru: "addevent", subject: meeting.title,
              startdt: meeting.starts_at.utc.iso8601, enddt: meeting.ends_at.utc.iso8601,
              body: description(meeting), location: meeting.meeting_url.to_s }
    "https://outlook.live.com/calendar/0/deeplink/compose?#{query.to_query}"
  end

  def description(meeting)
    [ ("Join: #{meeting.meeting_url}" if meeting.meeting_url.present?), meeting.agenda.presence ].compact.join("\n\n")
  end

  def stamp(time)
    time.utc.strftime("%Y%m%dT%H%M%SZ")
  end

  # RFC 5545 text: backslash, semicolon, comma and newlines are escaped.
  def escape(text)
    text.to_s.gsub("\\", "\\\\\\\\").gsub(";", "\;").gsub(",", "\\,").gsub(/\r?\n/, "\\n")
  end

  def param(text)
    %("#{text.to_s.delete('"')}")
  end

  # Lines longer than 75 bytes continue on the next line after a space.
  def fold(line)
    return line if line.bytesize <= 75

    parts = []
    current = +""
    line.each_char do |ch|
      if (current + ch).bytesize > (parts.empty? ? 75 : 74)
        parts << current
        current = +""
      end
      current << ch
    end
    parts << current
    parts.join("\r\n ")
  end
end
