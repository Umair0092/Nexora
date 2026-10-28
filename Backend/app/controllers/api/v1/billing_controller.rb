module Api
  module V1
    # The company's plan.
    #
    #   GET  /api/v1/billing            -> { enabled, plan, status, periodEnd, usage, plans[], canManage }
    #   POST /api/v1/billing/checkout   -> { url } Stripe Checkout for the Team plan (owner)
    #   POST /api/v1/billing/portal     -> { url } Stripe's customer portal (owner)
    #   POST /api/v1/billing/webhook    Stripe events, checked with STRIPE_WEBHOOK_SECRET
    class BillingController < ApplicationController
      include HiringAccess

      skip_before_action :authenticate_request, :require_membership, only: :webhook
      before_action :require_owner, only: [ :checkout, :portal ]

      def show
        org = current_organization
        plan = Plan.for(org)
        render json: {
          enabled: Plan.billing?, plan: { key: plan.key, name: plan.name }, status: org.plan_status, periodEnd: org.current_period_end,
          usage: Plan.usage(org), limits: { openJobs: plan.limit(:open_jobs), candidatesPerMonth: plan.limit(:candidates_per_month) },
          plans: Plan::ALL.map { |key, p| p.slice(:name, :price, :open_jobs, :candidates_per_month, :notetaker, :webhooks, :blurb).merge(key: key) },
          canManage: @membership.owner?, hasSubscription: org.stripe_customer_id.present?,
          contactEmail: ENV["SALES_EMAIL"].presence || ENV["MAIL_FROM"].to_s[/[^<\s]+@[^>\s]+/]
        }
      end

      def checkout
        return render(json: { error: "Billing isn't set up on this server." }, status: :unprocessable_entity) unless Plan.billing?

        render json: { url: StripeBilling.checkout_url(current_organization, current_user) }
      rescue StripeBilling::Error => e
        render json: { error: e.message }, status: :bad_gateway
      end

      def portal
        render json: { url: StripeBilling.portal_url(current_organization) }
      rescue StripeBilling::Error => e
        render json: { error: e.message }, status: :unprocessable_entity
      end

      def webhook
        event = StripeBilling.event(request.raw_post, request.headers["Stripe-Signature"])
        BillingEvents.apply(event)
        head :ok
      rescue StripeBilling::Error => e
        Rails.logger.warn("Stripe webhook rejected: #{e.message}")
        head :bad_request
      end
    end
  end
end
