module Api
  module V1
    class PasswordsController < ApplicationController
      SENT = "If that email has a Nexora account, a reset link is on its way. It expires in 30 minutes.".freeze

      skip_before_action :authenticate_request
      rate_limit to: 5, within: 15.minutes, only: :forgot, name: "password-forgot",
                 store: AuthController::RATE_LIMIT_STORE, with: AuthController::RATE_LIMIT_RESPONSE
      rate_limit to: 10, within: 15.minutes, only: :reset, name: "password-reset",
                 store: AuthController::RATE_LIMIT_STORE, with: AuthController::RATE_LIMIT_RESPONSE

      # POST /api/v1/password/forgot { email }
      # Same answer whether or not the account exists, so emails can't be probed.
      def forgot
        email = params[:email].to_s.strip.downcase
        user = User.find_by(email: email) if email.present?
        UserMailer.password_reset(user).deliver_now if user
        render json: { message: SENT }
      rescue StandardError => e
        Rails.logger.error("Password reset email failed: #{e.class}: #{e.message}")
        render json: { message: SENT }
      end

      # POST /api/v1/password/reset { token, password }
      def reset
        user = User.find_by_token_for(:password_reset, params[:token].to_s)
        unless user
          return render json: { error: "This reset link has expired or was already used. Request a new one." }, status: :unprocessable_entity
        end

        password = params[:password].to_s
        if user.update(password: password, password_confirmation: password)
          # Reaching the link proves they own the address.
          user.verify_email!
          render json: { token: JsonWebToken.encode(user_id: user.id), user: UserSerializer.call(user) }
        else
          render json: { errors: user.errors.full_messages }, status: :unprocessable_entity
        end
      end
    end
  end
end
