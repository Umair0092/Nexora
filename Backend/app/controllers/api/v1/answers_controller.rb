module Api
  module V1
    # Practice tools for one answer in a report: retry it, or see a stronger version.
    # Both call the AI service from here, so the score and rewrite can't be forged.
    class AnswersController < ApplicationController
      MAX_TRANSCRIPT = 10_000

      before_action :load_answer
      rate_limit to: 30, within: 10.minutes, name: "answer-ai", by: -> { current_user.id },
                 store: AuthController::RATE_LIMIT_STORE, with: AuthController::RATE_LIMIT_RESPONSE

      # POST /api/v1/sessions/:session_id/answers/:id/attempts  { transcript, speech? }
      def create_attempt
        transcript = params[:transcript].is_a?(String) ? params[:transcript].strip : ""
        if transcript.blank?
          return render json: { error: "We didn't get an answer to score. Record it again." }, status: :unprocessable_entity
        end
        if transcript.length > MAX_TRANSCRIPT
          return render json: { error: "That answer is too long to score." }, status: :unprocessable_entity
        end

        result = AiServices.score_answer(current_user, **ai_payload(transcript))
        attempt = @answer.attempts.create!(
          transcript: transcript,
          score: (result["score"].to_f.clamp(0, 10) * 10).round(1),
          feedback: result["feedback"].to_s.truncate(2000),
          recommendation: result["recommendation"].to_s.truncate(2000),
          strengths: Array(result["strengths"]).first(5).map { |s| s.to_s.truncate(300) },
          improvements: Array(result["improvements"]).first(5).map { |s| s.to_s.truncate(300) },
          star: result["star"].is_a?(Hash) ? result["star"].slice("situation", "task", "action", "result", "note") : nil,
          speech_metrics: speech_param
        )
        render json: attempt.as_json.deep_transform_keys { |k| k.to_s.camelize(:lower) }, status: :created
      rescue AiServices::Error => e
        render json: { error: e.message }, status: e.status == :not_found ? :service_unavailable : e.status
      end

      # POST /api/v1/sessions/:session_id/answers/:id/improve — generated once, then cached.
      def improve
        if @answer.improved_answer.blank?
          result = AiServices.improve_answer(current_user, **ai_payload(@answer.transcript.to_s))
          @answer.update!(
            improved_answer: result["improved_answer"].to_s.truncate(5000),
            improvement_notes: Array(result["changes"]).first(5).map { |c| c.to_s.truncate(300) }
          )
        end
        render json: { improvedAnswer: @answer.improved_answer, improvementNotes: @answer.improvement_notes }
      rescue AiServices::Error => e
        render json: { error: e.message }, status: e.status == :not_found ? :service_unavailable : e.status
      end

      private

      def load_answer
        session = current_user.interview_sessions.find(params[:session_id])
        @session = session
        @answer = session.answers.find(params[:id])
      end

      def ai_payload(transcript)
        evaluation = @session.report&.behavioral_summary&.dig("evaluation") || {}
        {
          question: @answer.question&.text.to_s.truncate(2000),
          answer: transcript,
          target_role: (@session.title.presence || "Software Engineer").truncate(100),
          interview_style: @session.interview_type == "behavioral" || evaluation["interview_style"] == "behavioral" ? "behavioral" : "standard",
          ideal_answer: @answer.ideal_answer.presence&.truncate(10_000),
          job_description: @session.job_description.presence&.truncate(6000),
          language: %w[en ur fr es].include?(@session.language) ? @session.language : "en"
        }
      end

      def speech_param
        raw = params[:speech]
        return nil unless raw.is_a?(ActionController::Parameters)

        raw = raw.to_unsafe_h
        ints = %w[word_count words_per_minute filler_count long_pauses].index_with do |k|
          Float(raw[k].to_s, exception: false)&.round&.clamp(0, 20_000)
        end
        floats = %w[duration_seconds longest_pause_seconds].index_with do |k|
          (Float(raw[k].to_s, exception: false) || 0.0).clamp(0, 3600).round(1)
        end
        fillers = (raw["fillers"].is_a?(Hash) ? raw["fillers"] : {}).first(10).to_h do |w, c|
          [ w.to_s.truncate(30), Float(c.to_s, exception: false)&.round&.clamp(0, 5000) || 0 ]
        end
        ints.merge(floats).merge("fillers" => fillers)
      end
    end
  end
end
