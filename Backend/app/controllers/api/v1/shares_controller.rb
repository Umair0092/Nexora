module Api
  module V1
    # Read-only public links to a report. The token is random and unguessable;
    # revoking it breaks the link for everyone.
    class SharesController < ApplicationController
      skip_before_action :authenticate_request, only: :show

      # POST /api/v1/sessions/:session_id/share
      def create
        report = owned_report
        report.share!
        render json: { shared: true, shareUrl: ReportSerializer.share_url(report) }
      end

      # DELETE /api/v1/sessions/:session_id/share
      def destroy
        owned_report.unshare!
        render json: { shared: false, shareUrl: nil }
      end

      # GET /api/v1/shared/:token — no sign-in needed.
      def show
        token = params[:token].to_s
        report = Report.find_by(share_token: token) if token.length >= 20
        return render json: { error: "This link has been turned off or doesn't exist." }, status: :not_found unless report

        response.headers["X-Robots-Tag"] = "noindex, nofollow"
        render json: ReportSerializer.call(report, public: true)
      end

      private

      def owned_report
        current_user.interview_sessions.find(params[:session_id]).report || raise(ActiveRecord::RecordNotFound)
      end
    end
  end
end
