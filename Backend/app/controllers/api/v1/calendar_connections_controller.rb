module Api
  module V1
    # A teammate's Google Calendar, for interviews with Meet links.
    #
    #   GET    /api/v1/calendar                  -> { available, connected, email, notetakerAvailable }
    #   POST   /api/v1/calendar/google           -> { url } to send the browser to
    #   GET    /api/v1/calendar/google/callback  (Google redirects here; back to /account)
    #   DELETE /api/v1/calendar                  revokes access and forgets the tokens
    class CalendarConnectionsController < ApplicationController
      skip_before_action :authenticate_request, only: :callback

      STATE_PURPOSE = :google_calendar

      def show
        connection = current_user.calendar_connection
        render json: { available: GoogleCalendar.configured?, connected: connection.present?, email: connection&.email,
                       notetakerAvailable: MeetingBot.configured? }
      end

      def connect
        return render(json: { error: "Google Calendar isn't set up on this server." }, status: :unprocessable_entity) unless GoogleCalendar.configured?

        state = verifier.generate(current_user.id, expires_in: 10.minutes, purpose: STATE_PURPOSE)
        render json: { url: GoogleCalendar.authorize_url(state: state) }
      end

      # The state is signed and short-lived, so only the person who asked can land here with it.
      def callback
        user = User.find_by(id: verifier.verified(params[:state].to_s, purpose: STATE_PURPOSE))
        return redirect_to("/account?calendar=failed", allow_other_host: false) unless user && params[:code].present?

        GoogleCalendar.connect!(user, code: params[:code].to_s)
        redirect_to "/account?calendar=connected"
      rescue GoogleCalendar::Error
        redirect_to "/account?calendar=failed"
      end

      def destroy
        connection = current_user.calendar_connection
        GoogleCalendar.disconnect!(connection) if connection
        head :no_content
      end

      private

      def verifier
        Rails.application.message_verifier("calendar-oauth")
      end
    end
  end
end
