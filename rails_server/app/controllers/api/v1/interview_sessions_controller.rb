module Api
  module V1
    class InterviewSessionsController < ApplicationController
      def index
        @sessions = current_user.interview_sessions.includes(:domain).order(started_at: :desc)
        render json: @sessions.as_json(include: :domain)
      end

      def show
        @session = current_user.interview_sessions.includes(:domain, answers: :question).find(params[:id])
        
        render json: @session.as_json(
          include: {
            domain: {},
            answers: {
              include: :question
            }
          }
        ).merge({
          questions: @session.answers.map { |a| a.question.as_json }
        })
      end

      def create
        @session = current_user.interview_sessions.build(session_params)
        @session.status = 'in_progress'
        
        if @session.save
          # Create empty answers for all questions in the domain
          questions = @session.domain.questions.where(difficulty: @session.difficulty)
          questions.each do |q|
            @session.answers.create(question: q)
          end
          
          render json: @session.as_json(include: :domain).merge({
            questions: questions.as_json
          }), status: :created
        else
          render json: { errors: @session.errors.full_messages }, status: :unprocessable_entity
        end
      end

      def stats
        total_sessions = current_user.interview_sessions.count
        completed_sessions = current_user.interview_sessions.where(status: 'completed').count
        # Calculate average score from Reports, or assume 0 if no reports
        # Using a raw SQL or join might be better but let's stick to simple
        average_score = current_user.reports.average(:overall_score).to_f.round(1) || 0

        render json: {
          totalSessions: total_sessions,
          completedSessions: completed_sessions,
          averageScore: average_score
        }
      end

      def complete
        @session = current_user.interview_sessions.find(params[:id])
        
        # Calculate scores (simplified logic for now)
        answers = @session.answers.where.not(score: nil)
        overall_score = answers.average(:score).to_f || 0
        
        @session.update(
          status: 'completed',
          completed_at: Time.current,
          overall_score: overall_score
        )

        # Generate Report (Mock for now, normally would call AI service)
        report = Report.create(
          session_id: @session.id,
          user: current_user,
          overall_score: overall_score,
          verbal_score: overall_score,
          non_verbal_score: 0, 
          overall_strengths: answers.map(&:strengths).flatten.uniq.take(5),
          overall_weaknesses: answers.map(&:weaknesses).flatten.uniq.take(5),
          recommendations: ["Practice STAR method", "Improve body language"]
        )

        render json: { session: @session, report: report }
      end
      private

      def session_params
        # Frontend sends camelCase domainId, we need snake_case domain_id for the model
        # Also setting a default for total_questions
        p = params.permit(:domainId, :difficulty, :language)
        {
          domain_id: p[:domainId],
          difficulty: p[:difficulty],
          language: p[:language],
          total_questions: 5 
        }
      end
    end
  end
end
