module Api
  module V1
    class ReportsController < ApplicationController
      def show
        @session = current_user.interview_sessions.find(params[:session_id])
        @report = @session.report
        
        if @report
           render json: { 
             report: @report, 
             session: @session, 
             answers: @session.answers.includes(:question).as_json(include: :question) 
           }
        else
           render json: { error: "Report not found" }, status: :not_found
        end
      end
    end
  end
end
