module Api
  module V1
    class AuthController < ApplicationController
      skip_before_action :authenticate_request, only: [:login, :register]

      def login
        @user = User.find_by_email(params[:email])
        if @user&.authenticate(params[:password])
          token = JsonWebToken.encode(user_id: @user.id)
          render json: { token: token, user: user_response(@user) }
        else
          render json: { error: 'Invalid email or password' }, status: :unauthorized
        end
      end

      def register
        @user = User.new(user_params)
        if @user.save
          token = JsonWebToken.encode(user_id: @user.id)
          render json: { token: token, user: user_response(@user) }, status: :created
        else
          render json: { errors: @user.errors.full_messages }, status: :unprocessable_entity
        end
      end

      def user
        render json: current_user.as_json(only: [:id, :email, :first_name, :last_name, :profile_image_url, :bio, :skills, :experience, :resume_url])
      end

      private

      def user_params
        params.permit(:email, :password, :first_name, :last_name, :profile_image_url)
      end

      def user_response(user)
        user.as_json(except: [:password_digest, :created_at, :updated_at])
      end
    end
  end
end
