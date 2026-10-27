module Api
  module V1
    class RemindersController < ApplicationController
      skip_before_action :authenticate_request

      # POST /api/v1/reminders/unsubscribe { token } — the link in every reminder email.
      def unsubscribe
        user = User.find_by_token_for(:unsubscribe, params[:token].to_s)
        return render json: { error: "This unsubscribe link isn't valid." }, status: :unprocessable_entity unless user

        user.update!(reminders_enabled: false)
        render json: { unsubscribed: true }
      end
    end
  end
end
