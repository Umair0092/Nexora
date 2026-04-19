module Api
  module V1
    class AnswersController < ApplicationController
      def index
        @session = current_user.interview_sessions.find(params[:session_id])
        @answers = @session.answers.includes(:question)
        render json: @answers.as_json(include: :question)
      end

      def create
        @session = current_user.interview_sessions.find(params[:session_id])
        # Find answer by questionId - the frontend sends questionId
        question_id = params[:questionId] || params[:question_id]
        @answer = @session.answers.find_by(question_id: question_id)

        if @answer
            update_answer_logic
        else
            render json: { error: "Answer record not found for this question" }, status: :not_found
        end
      end

      def update
        @session = current_user.interview_sessions.find(params[:session_id])
        @answer = @session.answers.find(params[:id])
        update_answer_logic
      end

      private

      def update_answer_logic
        if @answer.update(answer_params)
          # Mock AI Evaluation
          if @answer.transcript.present?
             @answer.update(
               score: rand(70..100),
               feedback: "Good answer! (Mock AI)",
               strengths: ["Clear communication", "Relevant examples"],
               weaknesses: ["Could be more concise"]
             )
          end
          
          # Update session completed count
          completed_count = @session.answers.where.not(transcript: nil).count
          @session.update(completed_questions: completed_count)

          render json: @answer
        else
          render json: { errors: @answer.errors.full_messages }, status: :unprocessable_entity
        end
      end

      def answer_params
        # Allow flat params
        params.permit(:transcript, :duration)
      end
    end
  end
end
