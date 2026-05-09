module Api
  module V1
    class ReportsController < ApplicationController
      def show
        @session = current_user.interview_sessions.find(params[:session_id])
        @report = @session.report
        
        if @report
           # Convert keys to camelCase for frontend
            report_data = @report.as_json.deep_transform_keys { |key| key.to_s.camelize(:lower) }
            
            # Merge nested behavioral summary if it exists
            if @report.behavioral_summary.is_a?(Hash)
              behavioral = @report.behavioral_summary.deep_transform_keys { |key| key.to_s.camelize(:lower) }
              report_data.merge!(behavioral)
            end

            session_data = @session.as_json(include: :domain).deep_transform_keys { |key| key.to_s.camelize(:lower) }
            answers_data = @session.answers.includes(:question).as_json(include: :question).map do |answer|
              answer.deep_transform_keys { |key| key.to_s.camelize(:lower) }
            end
            
            render json: report_data.merge({
              session: session_data,
              answers: answers_data
            })
        else
           render json: { error: "Report not found" }, status: :not_found
        end
      end
    end
  end
end
