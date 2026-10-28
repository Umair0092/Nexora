module Api
  module V1
    # Joining a company from an emailed link.
    #
    #   GET  /api/v1/team_invitations/preview?token=  (no sign-in) -> { company, email }
    #   POST /api/v1/team_invitations/accept { token }             -> joins, if the signed-in email matches
    class TeamInvitationsController < ApplicationController
      INVALID = "This invitation link is invalid or has expired. Ask for a new one.".freeze

      skip_before_action :authenticate_request, only: :preview
      rate_limit to: 20, within: 10.minutes, name: "team-join", store: AuthController::RATE_LIMIT_STORE,
                 with: AuthController::RATE_LIMIT_RESPONSE

      def preview
        invitation = find_invitation
        return render json: { error: INVALID }, status: :not_found unless invitation

        render json: { company: invitation.organization.name, email: invitation.email, role: invitation.role }
      end

      def accept
        invitation = find_invitation
        return render json: { error: INVALID }, status: :not_found unless invitation

        if invitation.email != current_user.email
          return render json: { error: "This invitation is for #{invitation.email}. Sign in with that address to accept it." },
                        status: :forbidden
        end
        if current_user.membership
          return render json: { error: "You already belong to a company." }, status: :unprocessable_entity
        end

        membership = invitation.accept!(current_user)
        render json: HiringSerializer.organization(membership.organization, membership)
      end

      private

      def find_invitation
        token = params[:token]
        token.is_a?(String) ? TeamInvitation.pending.find_by_token_for(:accept, token) : nil
      end
    end
  end
end
