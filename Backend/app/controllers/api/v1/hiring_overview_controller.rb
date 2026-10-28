module Api
  module V1
    # The hiring home page in one request.
    #
    #   GET /api/v1/hiring/overview
    #     -> { stats, needsReview[], activity[], columns: { jobId => { column => count } } }
    class HiringOverviewController < ApplicationController
      include HiringAccess

      REVIEW_LIMIT = 6
      ACTIVITY_LIMIT = 8
      # Teammates opening a page isn't news on the home page.
      QUIET_ACTIONS = %w[candidate_viewed].freeze

      def show
        org = current_organization
        candidates = org.candidates
        to_review = candidates.where(status: "completed", stage: nil)

        render json: {
          stats: {
            openJobs: org.jobs.where(status: "open").count,
            toReview: to_review.count,
            interviewing: candidates.where(stage: "interviewing").count,
            offers: candidates.where(stage: "offer").count,
            hiredRecently: org.hiring_events.where(action: "stage_changed", created_at: 30.days.ago..)
                              .where("details->>'to' = 'hired'").count
          },
          needsReview: to_review.includes(:job).order(:completed_at).limit(REVIEW_LIMIT).map { |c|
            { id: c.id, name: c.name, jobId: c.job_id, jobTitle: c.job.title, aiScore: c.ai_score,
              resumeScore: c.resume_score, completedAt: c.completed_at }
          },
          activity: org.hiring_events.where.not(action: QUIET_ACTIONS).includes(:user, candidate: :job)
                       .order(created_at: :desc).limit(ACTIVITY_LIMIT).map { |e| event(e) },
          columns: column_counts(candidates)
        }
      end

      private

      def event(e)
        {
          id: e.id, action: e.action, at: e.created_at, details: e.details,
          by: e.user && HiringSerializer.display_name(e.user),
          candidate: e.candidate && { id: e.candidate.id, name: e.candidate.name, jobTitle: e.candidate.job.title }
        }
      end

      # Board column per job, the same rule as Candidate#board_column.
      def column_counts(candidates)
        rows = candidates.group(:job_id, :status, :stage).count
        rows.each_with_object(Hash.new { |h, k| h[k] = Hash.new(0) }) do |((job_id, status, stage), n), out|
          column = if status == "withdrawn" then "withdrawn"
          elsif stage then stage
          else status == "completed" ? "review" : "invited"
          end
          out[job_id][column] += n
        end
      end
    end
  end
end
