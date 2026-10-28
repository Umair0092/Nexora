module Api
  module V1
    # GET /api/v1/hiring/analytics?days=30|90|365|all&jobId=
    class HiringAnalyticsController < ApplicationController
      include HiringAccess

      def show
        job = params[:jobId].present? ? current_organization.jobs.find_by(id: params[:jobId]) : nil
        return render(json: { error: "Not found" }, status: :not_found) if params[:jobId].present? && !job

        days = params[:days] == "all" ? nil : (params[:days].presence || 90).to_i
        render json: HiringAnalytics.new(current_organization, days: days, job: job).to_h
      end
    end
  end
end
