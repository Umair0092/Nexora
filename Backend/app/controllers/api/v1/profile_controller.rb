module Api
  module V1
    class ProfileController < ApplicationController
      def show
        render json: UserSerializer.call(current_user)
      end

      def update
        if current_user.update(user_params)
          render json: UserSerializer.call(current_user)
        else
          render json: { errors: current_user.errors.full_messages }, status: :unprocessable_entity
        end
      end

      # GET /api/v1/profile/export — everything Nexora stores about the user, as JSON.
      def export
        sessions = current_user.interview_sessions.includes(:report, answers: [ :question, :attempts ]).order(:started_at)
        data = {
          exportedAt: Time.current.iso8601,
          profile: UserSerializer.call(current_user).except(:id),
          interviews: sessions.map do |s|
            {
              title: s.title, interviewType: s.interview_type, language: s.language, status: s.status,
              overallScore: s.overall_score, startedAt: s.started_at&.iso8601, completedAt: s.completed_at&.iso8601,
              jobDescription: s.job_description,
              report: s.report && ReportSerializer.call(s.report).except("answers", "session"),
              answers: s.answers.map { |a| ReportSerializer.answer(a) }
            }
          end
        }
        send_data JSON.pretty_generate(data), type: "application/json", disposition: "attachment",
                                             filename: "nexora-data-#{Date.current.iso8601}.json"
      end

      # DELETE /api/v1/profile { password } — deletes the account and all its data.
      def destroy
        unless current_user.authenticate(params[:password].to_s)
          return render json: { error: "That password isn't right, so nothing was deleted." }, status: :unprocessable_entity
        end

        current_user.destroy_with_data!
        head :no_content
      end

      private

      def user_params
        raw = params.require(:user)
        permitted = raw.permit(
          :first_name, :last_name, :firstName, :lastName, :bio,
          :reminders_enabled, :remindersEnabled, :weekly_goal, :weeklyGoal,
          skills: [], experience: [ :title, :company, :duration, :description ]
        )

        attrs = {}
        attrs[:first_name] = permitted[:first_name] if permitted.key?(:first_name)
        attrs[:first_name] = permitted[:firstName] if permitted.key?(:firstName)
        attrs[:last_name] = permitted[:last_name] if permitted.key?(:last_name)
        attrs[:last_name] = permitted[:lastName] if permitted.key?(:lastName)
        attrs[:bio] = permitted[:bio] if permitted.key?(:bio)
        reminders = permitted.key?(:remindersEnabled) ? permitted[:remindersEnabled] : permitted[:reminders_enabled]
        attrs[:reminders_enabled] = ActiveModel::Type::Boolean.new.cast(reminders) || false if permitted.key?(:remindersEnabled) || permitted.key?(:reminders_enabled)
        goal = permitted.key?(:weeklyGoal) ? permitted[:weeklyGoal] : permitted[:weekly_goal]
        attrs[:weekly_goal] = goal if permitted.key?(:weeklyGoal) || permitted.key?(:weekly_goal)
        attrs[:skills] = Array(permitted[:skills]).map { |s| s.to_s.strip.truncate(100) }.reject(&:blank?).uniq.first(50) if permitted.key?(:skills)
        attrs[:experience] = experience_param(raw) if raw.key?(:experience)
        attrs
      end

      # Experience must be an array of hashes; anything else is passed through
      # as-is so the model validation rejects it with a clear error.
      def experience_param(raw)
        value = raw[:experience]
        return [] if value.nil?
        return value unless value.is_a?(Array)

        value.map do |entry|
          next entry unless entry.is_a?(ActionController::Parameters)

          entry.permit(:title, :company, :duration, :description).to_h.transform_values { |v| v.is_a?(String) ? v.truncate(2000) : v }
        end
      end
    end
  end
end
