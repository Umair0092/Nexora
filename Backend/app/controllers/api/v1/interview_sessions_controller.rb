module Api
  module V1
    class InterviewSessionsController < ApplicationController
      INTERVIEW_TYPES = Domain::INTERVIEW_TYPE_DOMAINS.keys.freeze
      DEFAULT_INTERVIEW_TYPE = "cv".freeze
      MAX_QUESTIONS = 30
      MAX_LIST_ITEMS = 10
      HIRE_RECOMMENDATIONS = [ "Strong Yes", "Yes", "Maybe", "No" ].freeze
      CV_TYPES = %w[cv complete behavioral].freeze
      QUIZ_TYPES = %w[role complete].freeze
      STAR_KEYS = %w[situation task action result].freeze

      # Each save runs up to two LLM evaluations.
      rate_limit to: 20, within: 10.minutes, only: :sync_ai_session, name: "sync-ai", by: -> { current_user.id },
                 store: AuthController::RATE_LIMIT_STORE, with: AuthController::RATE_LIMIT_RESPONSE

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

      # Totals plus streaks, counted in the browser's timezone (?tz=Europe/London).
      def stats
        sessions = current_user.interview_sessions
        completed = sessions.where(status: "completed")
        zone = (params[:tz].is_a?(String) && ActiveSupport::TimeZone[params[:tz]]) || Time.zone
        streak = PracticeStreak.new(completed.pluck(Arel.sql("COALESCE(completed_at, started_at)")), zone)

        render json: {
          totalSessions: sessions.count,
          completedSessions: completed.count,
          averageScore: completed.where.not(overall_score: nil).average(:overall_score).to_f.round,
          currentStreak: streak.current,
          longestStreak: streak.longest,
          practicedToday: streak.practiced_today?,
          thisWeek: streak.this_week,
          weeklyGoal: current_user.weekly_goal
        }
      end

      # One point per finished interview, oldest first, for the dashboard chart.
      # Scores are 0–100; presence is nil when the camera wasn't analysed.
      def progress
        sessions = current_user.interview_sessions.where(status: "completed").includes(:report)
                               .order(Arel.sql("COALESCE(interview_sessions.completed_at, interview_sessions.started_at)"))
        points = sessions.map do |session|
          report = session.report
          summary = report&.behavioral_summary.is_a?(Hash) ? report.behavioral_summary : {}
          evaluation = summary["evaluation"].is_a?(Hash) ? summary["evaluation"] : {}
          {
            sessionId: session.id,
            date: (session.completed_at || session.started_at)&.iso8601,
            title: session.title,
            interviewType: session.interview_type,
            overall: session.overall_score,
            communication: score_percent(evaluation["communication_score"]),
            technical: score_percent(evaluation["technical_score"]),
            presence: report&.camera_analysed? ? report.non_verbal_score : nil
          }
        end
        render json: points
      end

      # Saves a finished interview. The browser only says which live interviews it
      # ran; Rails scores them itself, so the scores can't be supplied or edited
      # by the client.
      def sync_ai_session
        interview_type = INTERVIEW_TYPES.include?(params[:interviewType].to_s) ? params[:interviewType].to_s : DEFAULT_INTERVIEW_TYPE
        cv_id = params[:cvSessionId].presence if CV_TYPES.include?(interview_type)
        quiz_id = params[:quizSessionId].presence if QUIZ_TYPES.include?(interview_type)
        unless cv_id.is_a?(String) || quiz_id.is_a?(String)
          return render json: { error: "There are no answers to save for this interview." }, status: :unprocessable_entity
        end

        raw = fetch_evaluation(cv_id, quiz_id)
        evaluation = sanitize_evaluation(raw || {})
        nonverbal = sanitize_nonverbal(hash_param(:nonverbalReport))
        title = params[:title].is_a?(String) ? params[:title].strip.truncate(100).presence : nil
        title ||= evaluation["target_role"].presence&.truncate(100)
        per_question = evaluation["per_question"]
        if per_question.empty?
          return render json: { error: "There are no answers to save for this interview." }, status: :unprocessable_entity
        end
        total_questions = per_question.size
        now = Time.current

        @session = nil
        @report = nil

        ActiveRecord::Base.transaction do
          domain = Domain.for_interview_type!(interview_type)

          @session = current_user.interview_sessions.create!(
            domain: domain,
            title: title,
            interview_type: interview_type,
            job_description: evaluation["job_description"].presence,
            difficulty: "intermediate",
            language: evaluation["language"] || "en",
            total_questions: total_questions,
            completed_questions: per_question.size,
            status: "completed",
            overall_score: to_percent(evaluation["overall_score"]),
            started_at: parse_started_at(params[:startedAt], now),
            completed_at: now
          )

          per_question.each do |q_data|
            question = Question.create!(domain: domain, text: q_data["question"], difficulty: "intermediate")
            @session.answers.create!(
              question: question,
              transcript: q_data["answer"],
              duration: q_data.dig("speech", "duration_seconds")&.round || 60,
              score: to_percent(q_data["score"]),
              strengths: q_data["strengths"],
              weaknesses: q_data["improvements"],
              feedback: q_data["feedback"],
              ideal_answer: q_data["ideal_answer"].presence,
              star: q_data["star"],
              speech_metrics: q_data["speech"]
            )
          end

          @report = Report.create!(
            session_id: @session.id,
            user: current_user,
            overall_score: to_percent(evaluation["overall_score"]),
            verbal_score: to_percent(evaluation["communication_score"]),
            non_verbal_score: nonverbal&.dig(:average_attention_score),
            overall_strengths: evaluation["top_strengths"],
            overall_weaknesses: evaluation["areas_to_improve"],
            recommendations: evaluation["improvement_points"],
            behavioral_summary: {
              nonVerbalData: nonverbal,
              evaluation: evaluation
            }
          )
        end

        current_user.live_interviews.where(id: [ cv_id, quiz_id ].compact).delete_all
        render json: { success: true, session_id: @session.id, report_id: @report.id }
      rescue LiveInterview::Expired => e
        render json: { error: e.message }, status: :not_found
      rescue Llm::Error => e
        render json: { error: e.message }, status: e.status
      rescue StandardError => e
        Rails.logger.error("sync_ai_session failed: #{e.class}: #{e.message}\n#{Array(e.backtrace).first(15).join("\n")}")
        render json: { error: "Could not save interview results" }, status: :unprocessable_entity
      end

      private

      # Evaluations from the CV and/or quiz half. A half with no answers yet is
      # skipped; a Full interview's halves are combined.
      def fetch_evaluation(cv_id, quiz_id)
        cv = evaluate_live(cv_id, "cv") if cv_id
        quiz = evaluate_live(quiz_id, "quiz") if quiz_id
        return cv || quiz unless cv && quiz

        avg = ->(key) { ((cv[key].to_f + quiz[key].to_f) / 2).round }
        {
          "target_role" => cv["target_role"],
          "language" => cv["language"],
          "interview_style" => cv["interview_style"],
          "job_description" => cv["job_description"],
          "job_fit" => cv["job_fit"],
          "overall_score" => avg.call("overall_score"),
          "communication_score" => avg.call("communication_score"),
          "technical_score" => avg.call("technical_score"),
          "hire_recommendation" => cv["hire_recommendation"],
          "top_strengths" => (Array(cv["top_strengths"]) + Array(quiz["top_strengths"])).first(5),
          "areas_to_improve" => (Array(cv["areas_to_improve"]) + Array(quiz["areas_to_improve"])).first(5),
          "summary" => [ cv["summary"], quiz["summary"] ].compact.join(" "),
          "recommendation_summary" => cv["recommendation_summary"],
          "improvement_points" => (Array(cv["improvement_points"]) + Array(quiz["areas_to_improve"])).first(6),
          "per_question" => Array(cv["per_question"]) + Array(quiz["per_question"])
        }
      end

      # The interview's evaluation plus its settings, or nil when it has no answers.
      def evaluate_live(id, kind)
        LiveInterview.open!(current_user, id, kind) do |engine|
          evaluation = engine.evaluate!
          evaluation && engine.summary.merge(evaluation)
        end
      end

      def score_percent(value)
        n = numeric(value)
        n.nil? ? nil : to_percent(n)
      end

      def hash_param(key)
        value = params[key]
        return value.to_unsafe_h if value.is_a?(ActionController::Parameters)

        nil
      end

      def sanitize_evaluation(raw)
        per_question = Array(raw["per_question"]).first(MAX_QUESTIONS).filter_map do |q|
          next unless q.is_a?(Hash)

          {
            "question" => text(q["question"], 1000).presence || "Question",
            "answer" => text(q["answer"], 5000),
            "score" => clamp_score(q["score"]),
            "strengths" => list(q["strengths"]),
            "improvements" => list(q["improvements"]),
            "feedback" => text(q["feedback"], 2000),
            "recommendation" => text(q["recommendation"], 2000),
            "ideal_answer" => text(q["ideal_answer"], 5000),
            "star" => sanitize_star(q["star"]),
            "speech" => SpeechMetrics.sanitize(q["speech"])
          }
        end

        hire = text(raw["hire_recommendation"], 50)

        {
          "target_role" => text(raw["target_role"], 100),
          "language" => text(raw["language"], 10).presence || "en",
          "interview_style" => raw["interview_style"] == "behavioral" ? "behavioral" : "standard",
          "job_description" => text(raw["job_description"], 6000),
          "job_fit" => text(raw["job_fit"], 2000),
          "num_questions" => clamp_int(raw["num_questions"], 1, MAX_QUESTIONS, nil),
          "questions_asked" => clamp_int(raw["questions_asked"], 0, MAX_QUESTIONS, per_question.size),
          "is_complete" => ActiveModel::Type::Boolean.new.cast(raw["is_complete"]) || false,
          "overall_score" => clamp_score(raw["overall_score"]),
          "communication_score" => clamp_score(raw["communication_score"]),
          "technical_score" => clamp_score(raw["technical_score"]),
          "hire_recommendation" => HIRE_RECOMMENDATIONS.include?(hire) ? hire : nil,
          "top_strengths" => list(raw["top_strengths"]),
          "areas_to_improve" => list(raw["areas_to_improve"]),
          "summary" => text(raw["summary"], 2000),
          "recommendation_summary" => text(raw["recommendation_summary"], 2000),
          "improvement_points" => list(raw["improvement_points"]),
          "per_question" => per_question
        }
      end

      def sanitize_star(raw)
        return nil unless raw.is_a?(Hash)

        STAR_KEYS.index_with { |k| ActiveModel::Type::Boolean.new.cast(raw[k]) || false }
                 .merge("note" => text(raw["note"], 500))
      end

      # Keeps the nonVerbalData shape the report page reads (camelized on output).
      # nil when the camera wasn't analysed, so the report shows "not analysed", not 0.
      def sanitize_nonverbal(raw)
        return nil unless raw.is_a?(Hash) && raw["attentionSummary"].is_a?(Hash)

        attention = raw["attentionSummary"].is_a?(Hash) ? raw["attentionSummary"] : {}
        states = attention["stateDistribution"].is_a?(Hash) ? attention["stateDistribution"] : {}
        hands = raw["handActivitySummary"].is_a?(Hash) ? raw["handActivitySummary"] : {}

        reasons = Array(raw["disengagementReasons"]).first(MAX_LIST_ITEMS).each_with_object({}) do |r, h|
          next unless r.is_a?(Hash)

          reason = text(r["reason"], 300)
          next if reason.blank?

          h[reason] = clamp_int(r["count"], 0, 100_000, 0)
        end

        {
          average_attention_score: clamp_float(attention["averageScore"], 0, 100).round(1),
          attention_distribution: {
            attentive: fraction(states.dig("ATTENTIVE", "percentage")),
            partially_attentive: fraction(states.dig("PARTIALLY ATTENTIVE", "percentage")),
            disengaged: fraction(states.dig("DISENGAGED", "percentage"))
          },
          disengagement_reasons: reasons,
          hand_activity: {
            calm: fraction(hands.dig("calm", "percentage")),
            moderate: fraction(hands.dig("moderate", "percentage")),
            excessive: fraction(hands.dig("excessive", "percentage"))
          }
        }
      end

      def parse_started_at(value, now)
        default = now - 15.minutes
        return default unless value.is_a?(String) && value.present?

        parsed = Time.zone.iso8601(value)
        parsed.clamp(now - 3.hours, now)
      rescue ArgumentError
        default
      end

      def text(value, max)
        return "" if value.is_a?(Hash) || value.is_a?(Array)

        value.to_s.strip.truncate(max)
      end

      def list(value)
        Array(value).first(MAX_LIST_ITEMS).filter_map do |item|
          next if item.is_a?(Hash) || item.is_a?(Array)

          text(item, 300).presence
        end
      end

      def numeric(value)
        Float(value.to_s, exception: false)&.then { |f| f.finite? ? f : nil }
      end

      def clamp_float(value, min, max)
        (numeric(value) || 0.0).clamp(min, max)
      end

      def clamp_int(value, min, max, default)
        n = numeric(value)
        n.nil? ? default : n.round.clamp(min, max)
      end

      # AI scores are on a 0–10 scale.
      def clamp_score(value)
        clamp_float(value, 0, 10)
      end

      def to_percent(score_0_to_10)
        (score_0_to_10.to_f.clamp(0, 10) * 10).round(1)
      end

      def fraction(percentage)
        (clamp_float(percentage, 0, 100) / 100.0).round(4)
      end
    end
  end
end
