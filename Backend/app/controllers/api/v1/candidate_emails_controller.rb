module Api
  module V1
    # Emails some of a job's candidates at once. {{placeholders}} in the subject
    # and body are filled per candidate; replies go to the sender.
    #
    #   POST /api/v1/jobs/:job_id/emails  { candidateIds: [], subject, body } -> { sent }
    class CandidateEmailsController < ApplicationController
      include HiringAccess

      MAX_RECIPIENTS = 100

      rate_limit to: 10, within: 10.minutes, name: "candidate-emails", by: -> { current_user.id },
                 store: AuthController::RATE_LIMIT_STORE, with: AuthController::RATE_LIMIT_RESPONSE

      def create
        job = current_organization.jobs.find(params[:job_id])
        ids = Array(params[:candidateIds]).map { |id| Integer(id.to_s, exception: false) }.compact.uniq
        subject = params[:subject].to_s.strip
        body = params[:body].to_s.strip
        candidates = job.candidates.where(id: ids).where.not(status: "withdrawn").to_a

        error = if candidates.empty? then "Choose at least one candidate who hasn't withdrawn."
        elsif ids.size > MAX_RECIPIENTS then "You can email up to #{MAX_RECIPIENTS} candidates at once."
        elsif subject.blank? || subject.length > 200 then "Add a subject of up to 200 characters."
        elsif body.blank? || body.length > 10_000 then "Add a message of up to 10,000 characters."
        end
        return render json: { error: error }, status: :unprocessable_entity if error

        candidates.each do |candidate|
          filled = EmailTemplate.fill(subject, candidate)
          HiringMailer.candidate_message(candidate, subject: filled, body: EmailTemplate.fill(body, candidate), sender: current_user).deliver_later
          current_organization.log!("email_sent", user: current_user, candidate: candidate, subject: filled.truncate(200))
        end
        render json: { sent: candidates.size }
      end
    end
  end
end
