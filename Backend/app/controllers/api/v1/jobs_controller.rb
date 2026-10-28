module Api
  module V1
    # The company's jobs and their screening interviews.
    #
    #   GET    /api/v1/jobs                 -> jobs with candidate counts by status
    #   POST   /api/v1/jobs                 { title, description, questions[], criteria[], answerSeconds }
    #   GET    /api/v1/jobs/:id             -> job and its candidates
    #   PATCH  /api/v1/jobs/:id             (questions, criteria and time limit lock once a candidate starts)
    #   DELETE /api/v1/jobs/:id             -> deletes its candidates and their answers too
    #   POST   /api/v1/jobs/suggest         { title, description } -> drafted { questions, criteria }
    #   GET    /api/v1/jobs/:id/compare?ids=1,2,3  -> 2–4 candidates side by side (logged as views)
    class JobsController < ApplicationController
      include HiringAccess

      before_action :load_job, only: [ :show, :update, :destroy, :compare ]
      rate_limit to: 20, within: 10.minutes, only: :suggest, name: "job-suggest", by: -> { current_user.id },
                 store: AuthController::RATE_LIMIT_STORE, with: AuthController::RATE_LIMIT_RESPONSE

      def index
        jobs = current_organization.jobs.order(created_at: :desc).to_a
        counts = Candidate.where(job_id: jobs.map(&:id)).group(:job_id, :status).count
        render json: jobs.map { |job|
          HiringSerializer.job(job, counts.select { |(id, _), _| id == job.id }.transform_keys(&:last))
        }
      end

      def show
        candidates = @job.candidates.includes(:scorecards, :notes).order(created_at: :desc)
        render json: HiringSerializer.job(@job).merge(candidates: candidates.map { |c| HiringSerializer.candidate_row(c) })
      end

      def create
        return if over_plan?(:open_job)

        job = current_organization.jobs.new(job_params.merge(created_by: current_user))
        return errors_of(job) unless job.save

        current_organization.log!("job_created", user: current_user, job_id: job.id)
        render json: HiringSerializer.job(job), status: :created
      end

      def update
        return if !@job.open? && job_params[:status] == "open" && over_plan?(:open_job)
        return errors_of(@job) unless @job.update(job_params)

        render json: HiringSerializer.job(@job)
      end

      def destroy
        @job.destroy!
        current_organization.log!("job_deleted", user: current_user, job_id: @job.id, title: @job.title)
        head :no_content
      end

      def compare
        ids = params[:ids].to_s.split(",").filter_map { |id| Integer(id, exception: false) }.uniq
        candidates = @job.candidates.includes(:answers, scorecards: :user).where(id: ids).to_a
        unless candidates.size.between?(2, 4) && candidates.size == ids.size
          return render json: { error: "Choose 2 to 4 of this job's candidates to compare." }, status: :unprocessable_entity
        end

        candidates.each { |c| log_view(c) }
        render json: {
          job: HiringSerializer.job(@job),
          candidates: candidates.sort_by { |c| ids.index(c.id) }.map { |c| HiringSerializer.comparison(c) }
        }
      end

      def suggest
        title = params[:title].to_s.strip.truncate(120)
        description = params[:description].to_s.strip
        if title.blank? || description.length < 30
          return render json: { error: "Add the job title and a description of at least a few sentences first." }, status: :unprocessable_entity
        end
        if description.length > Interviewing::MAX_JOB_DESCRIPTION
          return render json: { error: "The description can be up to 6,000 characters." }, status: :unprocessable_entity
        end

        render json: JobDrafter.call(title: title, description: description)
      rescue Llm::Error => e
        render json: { error: e.message }, status: e.status
      end

      private

      def load_job
        @job = current_organization.jobs.find(params[:id])
      end

      def job_params
        attrs = {}
        attrs[:title] = params[:title].to_s.strip if params.key?(:title)
        attrs[:description] = params[:description].to_s.strip if params.key?(:description)
        attrs[:questions] = string_list(params[:questions]) if params.key?(:questions)
        attrs[:criteria] = string_list(params[:criteria]) if params.key?(:criteria)
        attrs[:answer_seconds] = params[:answerSeconds].to_i if params.key?(:answerSeconds)
        attrs[:status] = params[:status].to_s if params.key?(:status)
        attrs[:collect_resume] = ActiveModel::Type::Boolean.new.cast(params[:collectResume]) if params.key?(:collectResume)
        attrs
      end

      def string_list(value)
        Array(value).first(20).map { |v| v.is_a?(String) ? v : "" }
      end
    end
  end
end
