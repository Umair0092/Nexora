module Api
  module V1
    class InterviewSessionsController < ApplicationController
      def index
        @sessions = current_user.interview_sessions.includes(:domain).order(started_at: :desc)
        sessions_data = @sessions.as_json(include: :domain).map do |session|
          session.deep_transform_keys { |key| key.to_s.camelize(:lower) }
        end
        render json: sessions_data
      end

      def show
        @session = current_user.interview_sessions.includes(:domain, answers: :question).find(params[:id])
        
        session_data = @session.as_json(
          include: {
            domain: {},
            answers: {
              include: :question
            }
          }
        ).merge({
          questions: @session.answers.map { |a| a.question.as_json }
        }).deep_transform_keys { |key| key.to_s.camelize(:lower) }
        
        render json: session_data
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

      def sync_ai_session
        evaluation = params[:evaluation]
        nonverbal_report = params[:nonverbalReport]
        
        domain_name = evaluation['target_role'] || "AI Interview"
        domain = Domain.find_or_create_by(name: domain_name) do |d|
           d.description = "AI generated domain for #{domain_name}"
        end
        
        @session = current_user.interview_sessions.create!(
          domain: domain,
          difficulty: "intermediate",
          language: evaluation['language'] || "en",
          total_questions: evaluation['num_questions'] || 10,
          completed_questions: evaluation['questions_asked'] || 10,
          status: 'completed',
          overall_score: (evaluation['overall_score'] || 0) * 10,
          started_at: Time.current - 15.minutes,
          completed_at: Time.current
        )
        
        if evaluation['per_question'].is_a?(Array)
          evaluation['per_question'].each do |q_data|
            q = Question.find_or_create_by(text: q_data['question'], domain: domain) do |new_q|
              new_q.difficulty = "intermediate"
            end
            
            @session.answers.create!(
              question: q,
              transcript: q_data['answer'],
              duration: 60,
              score: (q_data['score'] || 0) * 10,
              strengths: q_data['strengths'] || [],
              weaknesses: q_data['improvements'] || [],
              feedback: q_data['feedback']
            )
          end
        end
        
        # Calculate non-verbal score from attention summary if available
        nv_score = 0
        if nonverbal_report && nonverbal_report['attentionSummary']
          nv_score = nonverbal_report['attentionSummary']['averageScore'] || 0
        end

        @report = Report.create!(
          session_id: @session.id,
          user: current_user,
          overall_score: (evaluation['overall_score'] || 0) * 10,
          verbal_score: (evaluation['communication_score'] || 0) * 10,
          non_verbal_score: nv_score,
          overall_strengths: evaluation['top_strengths'] || [],
          overall_weaknesses: evaluation['areas_to_improve'] || [],
          recommendations: evaluation['improvement_points'] || [],
          behavioral_summary: {
            nonVerbalData: {
              average_attention_score: nv_score,
              attention_distribution: {
                attentive: nonverbal_report.dig('attentionSummary', 'stateDistribution', 'ATTENTIVE', 'percentage').to_f / 100,
                partially_attentive: nonverbal_report.dig('attentionSummary', 'stateDistribution', 'PARTIALLY ATTENTIVE', 'percentage').to_f / 100,
                disengaged: nonverbal_report.dig('attentionSummary', 'stateDistribution', 'DISENGAGED', 'percentage').to_f / 100
              },
              disengagement_reasons: nonverbal_report['disengagementReasons']&.each_with_object({}) { |r, h| h[r['reason']] = r['count'] },
              hand_activity: {
                calm: nonverbal_report.dig('handActivitySummary', 'calm', 'percentage').to_f / 100,
                moderate: nonverbal_report.dig('handActivitySummary', 'moderate', 'percentage').to_f / 100,
                excessive: nonverbal_report.dig('handActivitySummary', 'excessive', 'percentage').to_f / 100
              }
            },
            evaluation: evaluation
          }
        )
        
        render json: { success: true, session_id: @session.id, report_id: @report.id }
      rescue => e
        render json: { error: e.message }, status: :unprocessable_entity
      end

      private

      def session_params
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
