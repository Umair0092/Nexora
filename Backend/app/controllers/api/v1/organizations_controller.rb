module Api
  module V1
    # The signed-in user's company and team.
    #
    #   GET    /api/v1/organization                       -> company, members, pending invitations (404 if none)
    #   POST   /api/v1/organization            { name }   -> creates it; you become the owner
    #   PATCH  /api/v1/organization            { name }   (owner)
    #   POST   /api/v1/organization/invitations { email, role }  (owner) -> emails a join link
    #   DELETE /api/v1/organization/invitations/:id       (owner)
    #   DELETE /api/v1/organization/members/:id           (owner; not yourself)
    class OrganizationsController < ApplicationController
      include HiringAccess

      skip_before_action :require_membership, only: :create
      before_action :require_owner, only: [ :update, :invite, :cancel_invitation, :remove_member ]
      rate_limit to: 20, within: 10.minutes, only: :invite, name: "team-invite", by: -> { current_user.id },
                 store: AuthController::RATE_LIMIT_STORE, with: AuthController::RATE_LIMIT_RESPONSE

      def show
        render json: HiringSerializer.organization(current_organization, @membership)
      end

      def create
        if current_user.membership
          return render json: { error: "You already belong to a company." }, status: :unprocessable_entity
        end

        org = Organization.new(name: params[:name].to_s.strip)
        Organization.transaction do
          org.save!
          @membership = org.memberships.create!(user: current_user, role: "owner")
          org.log!("company_created", user: current_user)
        end
        render json: HiringSerializer.organization(org, @membership), status: :created
      rescue ActiveRecord::RecordInvalid
        errors_of(org)
      end

      def update
        attrs = {}
        attrs[:name] = params[:name].to_s.strip if params.key?(:name)
        attrs[:retention_months] = params[:retentionMonths].presence&.to_i if params.key?(:retentionMonths)
        return errors_of(current_organization) unless current_organization.update(attrs)

        current_organization.log!("retention_changed", user: current_user, months: current_organization.retention_months) if attrs.key?(:retention_months)

        render json: HiringSerializer.organization(current_organization, @membership)
      end

      def invite
        email = params[:email].to_s.strip.downcase
        if current_organization.users.exists?(email: email)
          return render json: { error: "#{email} is already on the team." }, status: :unprocessable_entity
        end

        invitation = current_organization.team_invitations.new(email: email, role: params[:role].presence || "recruiter", invited_by: current_user)
        return errors_of(invitation) unless invitation.save

        HiringMailer.team_invitation(invitation).deliver_now
        current_organization.log!("member_invited", user: current_user, email: email)
        render json: HiringSerializer.organization(current_organization, @membership), status: :created
      end

      def cancel_invitation
        current_organization.team_invitations.pending.find(params[:id]).destroy!
        render json: HiringSerializer.organization(current_organization, @membership)
      end

      def remove_member
        member = current_organization.memberships.find(params[:id])
        if member.user_id == current_user.id
          return render json: { error: "You can't remove yourself." }, status: :unprocessable_entity
        end

        member.destroy!
        current_organization.log!("member_removed", user: current_user, email: member.user.email)
        render json: HiringSerializer.organization(current_organization, @membership)
      end
    end
  end
end
