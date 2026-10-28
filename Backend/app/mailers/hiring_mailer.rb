class HiringMailer < ApplicationMailer
  def candidate_invitation(candidate)
    @candidate = candidate
    @job = candidate.job
    @company = @job.organization.name
    @url = app_url("/apply/#{candidate.access_token}")
    @answer_time = HiringMailer.duration(@job.answer_seconds)
    @total_minutes = (@job.questions.size * @job.answer_seconds / 60.0).ceil + 5
    mail(to: candidate.email, subject: "#{@company}: your screening interview for #{@job.title}")
  end

  def team_invitation(invitation)
    @invitation = invitation
    @company = invitation.organization.name
    @inviter = invitation.invited_by&.then { |u| [ u.first_name, u.last_name ].compact_blank.join(" ").presence || u.email }
    @url = app_url("/join?token=#{CGI.escape(invitation.generate_token_for(:accept))}")
    mail(to: invitation.email, subject: "Join #{@company} on Nexora")
  end

  # A message from the hiring team, already filled in for this candidate.
  # Replies go to the teammate who sent it.
  def candidate_message(candidate, subject:, body:, sender:)
    @body = body
    @company = candidate.organization.name
    mail(to: candidate.email, subject: subject, reply_to: sender.email)
  end

  def mention(note, user)
    @note = note
    @candidate = note.candidate
    @author = note.user && HiringSerializer.display_name(note.user)
    @url = app_url("/hiring/candidates/#{@candidate.id}")
    mail(to: user.email, subject: "#{@author || 'A teammate'} mentioned you on #{@candidate.name}")
  end

  # A live interview, with a calendar file so it lands in any calendar app.
  # `email` is the candidate or a panelist; `update` marks a reschedule.
  def meeting_invitation(meeting, email, update: false)
    meeting_mail(meeting, email, method: "REQUEST")
    @update = update
    subject = "#{update ? 'Updated: ' : ''}#{meeting.title}, #{@when}"
    mail(to: email, subject: subject, reply_to: meeting.created_by&.email)
  end

  def meeting_cancelled(meeting, email)
    meeting_mail(meeting, email, method: "CANCEL")
    mail(to: email, subject: "Cancelled: #{meeting.title}, #{@when}", reply_to: meeting.created_by&.email)
  end

  def minutes_ready(meeting, user)
    @meeting = meeting
    @candidate = meeting.candidate
    @summary = meeting.minutes&.dig("summary")
    @when = HiringMailer.meeting_time(meeting)
    @url = app_url("/hiring/meetings/#{meeting.id}")
    mail(to: user.email, subject: "Minutes ready: #{@candidate.name}, #{@candidate.job.title}")
  end

  # 120 -> "2 minutes", 90 -> "90 seconds"
  def self.duration(seconds)
    (seconds % 60).zero? ? ActionController::Base.helpers.pluralize(seconds / 60, "minute") : "#{seconds} seconds"
  end

  # "Thu 30 Oct, 10:00-10:45 PKT" in the organizer's time zone.
  def self.meeting_time(meeting)
    start = meeting.starts_at.in_time_zone(meeting.zone)
    "#{start.strftime('%a %-d %b, %H:%M')}-#{meeting.ends_at.in_time_zone(meeting.zone).strftime('%H:%M')} #{start.strftime('%Z')}"
  end

  private

  def meeting_mail(meeting, email, method:)
    @meeting = meeting
    @candidate = meeting.candidate
    @company = meeting.organization.name
    @for_candidate = email == @candidate.email
    @when = HiringMailer.meeting_time(meeting)
    @panel = meeting.panelists.map { |u| HiringSerializer.display_name(u) }
    @google_url = CalendarInvite.google_url(meeting)
    @outlook_url = CalendarInvite.outlook_url(meeting)
    @candidate_url = app_url("/hiring/candidates/#{@candidate.id}")
    attachments["invite.ics"] = { mime_type: "text/calendar; method=#{method}; charset=UTF-8", content: CalendarInvite.ics(meeting, method: method) }
  end
end
