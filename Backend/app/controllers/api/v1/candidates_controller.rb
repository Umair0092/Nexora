module Api
  module V1
    # Candidates for the company's jobs, and the team's review of them.
    #
    #   POST   /api/v1/jobs/:job_id/candidates      { name, email } -> invites them by email
    #   GET    /api/v1/candidates/:id               -> answers, AI summary, scorecards, activity (logged as a view)
    #   PUT    /api/v1/candidates/:id/scorecard     { ratings: { criterion => 1..5 }, notes, recommendation }
    #   POST   /api/v1/candidates/:id/stage         { stage: shortlisted | interviewing | offer | hired | rejected | null }
    #   POST   /api/v1/candidates/:id/resend        -> emails the link again
    #   POST   /api/v1/candidates/:id/evaluate      -> re-runs the AI summary (e.g. after a failure)
    #   POST   /api/v1/candidates/:id/match         -> re-runs the CV match
    #   DELETE /api/v1/candidates/:id               -> deletes the candidate and their answers
    class CandidatesController < ApplicationController
      include HiringAccess

      before_action :load_candidate, except: :create
      rate_limit to: 60, within: 10.minutes, only: [ :create, :resend ], name: "candidate-invite", by: -> { current_user.id },
                 store: AuthController::RATE_LIMIT_STORE, with: AuthController::RATE_LIMIT_RESPONSE
      rate_limit to: 10, within: 10.minutes, only: [ :evaluate, :match ], name: "candidate-evaluate", by: -> { current_user.id },
                 store: AuthController::RATE_LIMIT_STORE, with: AuthController::RATE_LIMIT_RESPONSE

      def create
        job = current_organization.jobs.find(params[:job_id])
        unless job.open?
          return render json: { error: "This job is closed. Reopen it to invite candidates." }, status: :unprocessable_entity
        end
        return if over_plan?(:invite)

        candidate = job.candidates.new(name: params[:name].to_s.strip, email: params[:email].to_s, invited_by: current_user)
        return errors_of(candidate) unless candidate.save

        HiringMailer.candidate_invitation(candidate).deliver_now
        current_organization.log!("candidate_invited", user: current_user, candidate: candidate)
        render json: HiringSerializer.candidate_row(candidate), status: :created
      end

      def show
        log_view(@candidate)
        render json: HiringSerializer.candidate_detail(@candidate, current_user)
      end

      def scorecard
        card = @candidate.scorecards.find_or_initialize_by(user: current_user)
        ratings = params[:ratings].is_a?(ActionController::Parameters) ? params[:ratings].to_unsafe_h : {}
        card.assign_attributes(
          ratings: ratings.transform_values { |v| Integer(v.to_s, exception: false) || v }.compact_blank,
          notes: params[:notes].to_s.strip,
          recommendation: params[:recommendation].presence
        )
        return errors_of(card) unless card.save

        current_organization.log!("scorecard_saved", user: current_user, candidate: @candidate, recommendation: card.recommendation)
        render json: HiringSerializer.candidate_detail(@candidate.reload, current_user)
      end

      def stage
        stage = params[:stage].presence
        unless stage.nil? || Candidate::STAGES.include?(stage)
          return render json: { error: "That isn't a stage." }, status: :unprocessable_entity
        end
        if @candidate.status == "withdrawn"
          return render json: { error: "This candidate withdrew." }, status: :unprocessable_entity
        end

        if stage != @candidate.stage
          from = @candidate.stage
          @candidate.update!(stage: stage)
          current_organization.log!("stage_changed", user: current_user, candidate: @candidate, from: from, to: stage)
        end
        render json: HiringSerializer.candidate_detail(@candidate, current_user)
      end

      def resend
        unless %w[invited in_progress].include?(@candidate.status)
          return render json: { error: "This candidate has already finished or withdrawn." }, status: :unprocessable_entity
        end

        HiringMailer.candidate_invitation(@candidate).deliver_now
        current_organization.log!("invitation_resent", user: current_user, candidate: @candidate)
        render json: HiringSerializer.candidate_row(@candidate)
      end

      def evaluate
        unless @candidate.status == "completed"
          return render json: { error: "The candidate hasn't finished yet." }, status: :unprocessable_entity
        end

        @candidate.update!(evaluation_status: "pending")
        EvaluateCandidateJob.perform_later(@candidate)
        render json: HiringSerializer.candidate_detail(@candidate, current_user)
      end

      def match
        unless @candidate.resume_data.present?
          return render json: { error: "This candidate hasn't added a CV." }, status: :unprocessable_entity
        end

        @candidate.update!(resume_status: "pending")
        MatchResumeJob.perform_later(@candidate)
        render json: HiringSerializer.candidate_detail(@candidate, current_user)
      end

      def destroy
        @candidate.destroy!
        current_organization.log!("candidate_deleted", user: current_user, name: @candidate.name)
        head :no_content
      end

      private

      def load_candidate
        @candidate = current_organization.candidates.includes(:job, :answers, scorecards: :user, notes: :user).find(params[:id])
      end
    end
  end
end
