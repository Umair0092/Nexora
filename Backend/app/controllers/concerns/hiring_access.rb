# For the company side of hiring: the signed-in user must belong to a company,
# and everything they reach is scoped to it. Other companies' records are 404s.
module HiringAccess
  extend ActiveSupport::Concern

  included do
    before_action :require_membership
  end

  private

  def require_membership
    @membership = current_user.membership
    render json: { error: "Create or join a company first." }, status: :not_found unless @membership
  end

  def current_organization
    @membership.organization
  end

  def require_owner
    render json: { error: "Only the company's owner can do that." }, status: :forbidden unless @membership.owner?
  end

  # One view per person per half hour, so reloads and polling don't flood the log.
  def log_view(candidate)
    return if candidate.hiring_events.where(action: "candidate_viewed", user: current_user, created_at: 30.minutes.ago..).exists?

    current_organization.log!("candidate_viewed", user: current_user, candidate: candidate)
  end

  # Plan limits (only when billing is on). Renders 402 and returns true when blocked.
  def over_plan?(action)
    message = Plan.blocked(current_organization, action)
    return false unless message

    render json: { error: message, upgrade: true }, status: :payment_required
    true
  end

  def errors_of(record)
    render json: { errors: record.errors.full_messages }, status: :unprocessable_entity
  end
end
