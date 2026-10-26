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

      private

      def user_params
        raw = params.require(:user)
        permitted = raw.permit(
          :first_name, :last_name, :firstName, :lastName, :bio,
          skills: [], experience: [ :title, :company, :duration, :description ]
        )

        attrs = {}
        attrs[:first_name] = permitted[:first_name] if permitted.key?(:first_name)
        attrs[:first_name] = permitted[:firstName] if permitted.key?(:firstName)
        attrs[:last_name] = permitted[:last_name] if permitted.key?(:last_name)
        attrs[:last_name] = permitted[:lastName] if permitted.key?(:lastName)
        attrs[:bio] = permitted[:bio] if permitted.key?(:bio)
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
