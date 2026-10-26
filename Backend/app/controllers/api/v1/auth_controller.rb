module Api
  module V1
    class AuthController < ApplicationController
      # Per-process store so throttling works regardless of the configured
      # Rails.cache (null_store in test, solid_cache in production).
      RATE_LIMIT_STORE = ActiveSupport::Cache::MemoryStore.new
      RATE_LIMIT_RESPONSE = -> {
        render json: { error: "Too many attempts. Please try again in a few minutes." }, status: :too_many_requests
      }

      skip_before_action :authenticate_request, only: [ :login, :register ]

      rate_limit to: 10, within: 3.minutes, only: :login, name: "auth-login",
                 store: RATE_LIMIT_STORE, with: RATE_LIMIT_RESPONSE
      rate_limit to: 10, within: 3.minutes, only: :register, name: "auth-register",
                 store: RATE_LIMIT_STORE, with: RATE_LIMIT_RESPONSE

      def login
        email = params[:email].to_s.strip.downcase
        @user = User.find_by(email: email) if email.present?
        if @user&.authenticate(params[:password].to_s)
          token = JsonWebToken.encode(user_id: @user.id)
          render json: { token: token, user: UserSerializer.call(@user) }
        else
          render json: { error: "Invalid email or password" }, status: :unauthorized
        end
      end

      def register
        @user = User.new(user_params)
        if @user.save
          token = JsonWebToken.encode(user_id: @user.id)
          render json: { token: token, user: UserSerializer.call(@user) }, status: :created
        else
          render json: { errors: @user.errors.full_messages }, status: :unprocessable_entity
        end
      end

      def user
        render json: UserSerializer.call(current_user)
      end

      private

      def user_params
        permitted = params.permit(:email, :password, :first_name, :last_name, :firstName, :lastName)
        {
          email: permitted[:email],
          password: permitted[:password],
          first_name: permitted[:first_name] || permitted[:firstName],
          last_name: permitted[:last_name] || permitted[:lastName]
        }
      end
    end
  end
end
