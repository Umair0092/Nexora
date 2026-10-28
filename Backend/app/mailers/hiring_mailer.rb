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

  # 120 -> "2 minutes", 90 -> "90 seconds"
  def self.duration(seconds)
    (seconds % 60).zero? ? ActionController::Base.helpers.pluralize(seconds / 60, "minute") : "#{seconds} seconds"
  end
end
