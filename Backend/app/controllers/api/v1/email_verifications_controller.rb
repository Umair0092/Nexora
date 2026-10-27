module Api
  module V1
    class EmailVerificationsController < ApplicationController
      skip_before_action :authenticate_request, only: :create
      rate_limit to: 3, within: 10.minutes, only: :resend, name: "email-resend",
                 store: AuthController::RATE_LIMIT_STORE, with: AuthController::RATE_LIMIT_RESPONSE,
                 by: -> { current_user&.id || request.remote_ip }

      # POST /api/v1/email/verify { token } — works signed in or out.
      def create
        user = User.find_by_token_for(:email_verification, params[:token].to_s)
        unless user
          return render json: { error: "This confirmation link has expired or was already used. Sign in to send a new one." }, status: :unprocessable_entity
        end

        user.verify_email!
        render json: { verified: true, user: UserSerializer.call(user) }
      end

      # POST /api/v1/email/resend
      def resend
        if current_user.email_verified?
          return render json: { message: "Your email is already confirmed." }
        end

        UserMailer.email_verification(current_user).deliver_now
        render json: { message: "We've sent a new confirmation link to #{current_user.email}." }
      rescue StandardError => e
        Rails.logger.error("Verification email failed: #{e.class}: #{e.message}")
        render json: { error: "We couldn't send the email right now. Try again in a few minutes." }, status: :service_unavailable
      end
    end
  end
end
