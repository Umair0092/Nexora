module Api
  module V1
    class ReportsController < ApplicationController
      def show
        session = current_user.interview_sessions.find(params[:session_id])
        report = session.report
        return render json: { error: "Report not found" }, status: :not_found unless report

        render json: ReportSerializer.call(report)
      end
    end
  end
end
