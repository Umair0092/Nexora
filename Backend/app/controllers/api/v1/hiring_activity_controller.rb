require "csv"

module Api
  module V1
    # The company's audit log: who viewed, scored, moved, emailed or exported what.
    #
    #   GET /api/v1/hiring/activity?page=1&action_name=stage_changed&userId=3&q=sam
    #     -> { events[], page, pages, actions[], people[] }
    #   GET /api/v1/hiring/activity.csv (same filters) -> every matching entry
    class HiringActivityController < ApplicationController
      include HiringAccess

      PER_PAGE = 50
      MAX_CSV_ROWS = 50_000

      def show
        scope = filtered
        if request.format.csv?
          current_organization.log!("audit_log_exported", user: current_user)
          return send_data csv(scope), filename: "nexora-activity-#{Date.current.iso8601}.csv", type: "text/csv; charset=utf-8"
        end

        total = scope.count
        pages = [ (total / PER_PAGE.to_f).ceil, 1 ].max
        page = params[:page].to_i.clamp(1, pages)
        render json: {
          events: scope.offset((page - 1) * PER_PAGE).limit(PER_PAGE).map { |e| event(e) },
          page: page, pages: pages, total: total,
          actions: current_organization.hiring_events.distinct.order(:action).pluck(:action),
          people: current_organization.users.map { |u| { id: u.id, name: HiringSerializer.display_name(u) } }
        }
      end

      private

      def filtered
        scope = current_organization.hiring_events.includes(:user, candidate: :job).order(created_at: :desc, id: :desc)
        scope = scope.where(action: params[:action_name]) if params[:action_name].present?
        scope = scope.where(user_id: params[:userId]) if params[:userId].present?
        if params[:q].present?
          scope = scope.left_joins(:candidate).where("candidates.name ILIKE :q OR candidates.email ILIKE :q",
                                                     q: "%#{ActiveRecord::Base.sanitize_sql_like(params[:q].to_s)}%")
        end
        scope
      end

      def event(e)
        { id: e.id, action: e.action, at: e.created_at, details: e.details, by: e.user && HiringSerializer.display_name(e.user),
          candidate: e.candidate && { id: e.candidate.id, name: e.candidate.name, jobTitle: e.candidate.job.title } }
      end

      def csv(scope)
        CSV.generate do |out|
          out << [ "When", "Who", "Action", "Candidate", "Job", "Details" ]
          scope.limit(MAX_CSV_ROWS).each do |e|
            out << [ e.created_at.iso8601, e.user && HiringSerializer.display_name(e.user), e.action, e.candidate&.name,
                     e.candidate&.job&.title, e.details.presence&.to_json ].map { |v| v.is_a?(String) && v.match?(/\A[=+\-@]/) ? "'#{v}" : v }
          end
        end
      end
    end
  end
end
