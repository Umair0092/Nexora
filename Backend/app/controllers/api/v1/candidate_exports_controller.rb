require "csv"

module Api
  module V1
    # GET /api/v1/candidates/export?jobId= -> a CSV of the company's candidates.
    #
    # The columns follow what applicant tracking systems import (Greenhouse and
    # Lever both take first name, last name, email, job and stage); scores and
    # links come after. Answers and transcripts aren't included.
    class CandidateExportsController < ApplicationController
      include HiringAccess

      HEADERS = [ "First name", "Last name", "Email", "Job", "Stage", "Status", "AI screening score", "CV match %",
                  "Team average (1-5)", "Scorecards", "Invited at", "Finished at", "Next interview", "Nexora link" ].freeze

      def show
        scope = current_organization.candidates.includes(:job, :scorecards, :meetings).order("jobs.title", :created_at)
        if params[:jobId].present?
          job = current_organization.jobs.find_by(id: params[:jobId])
          return render(json: { error: "Not found" }, status: :not_found) unless job

          scope = scope.where(job: job)
        end

        current_organization.log!("candidates_exported", user: current_user, count: scope.size, job_id: job&.id)
        filename = "nexora-candidates-#{(job&.title || 'all-jobs').parameterize}-#{Date.current.iso8601}.csv"
        send_data csv(scope), filename: filename, type: "text/csv; charset=utf-8", disposition: "attachment"
      end

      private

      def csv(candidates)
        CSV.generate(headers: HEADERS, write_headers: true) do |out|
          candidates.each do |c|
            first, last = c.name.split(" ", 2)
            upcoming = c.meetings.select { |m| m.scheduled? && m.ends_at > Time.current }.min_by(&:starts_at)
            out << [ first, last, c.email, c.job.title, HiringSerializer::COLUMN_NAMES.fetch(c.board_column), c.status.humanize,
                     c.ai_score&.round, c.resume_score&.round, c.scorecard_average, c.scorecards.size,
                     c.created_at.iso8601, c.completed_at&.iso8601, upcoming&.starts_at&.iso8601,
                     ApplicationMailer.app_url("/hiring/candidates/#{c.id}") ].map { |v| safe(v) }
          end
        end
      end

      # Spreadsheets run cells that start with = + - @ as formulas; quote them.
      def safe(value)
        value.is_a?(String) && value.match?(/\A[=+\-@\t\r]/) ? "'#{value}" : value
      end
    end
  end
end
