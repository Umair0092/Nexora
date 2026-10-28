# Keeps a company's plan in step with Stripe. Stripe can send events more than
# once and out of order, so each handler sets state rather than toggling it.
module BillingEvents
  PAID = %w[active trialing past_due].freeze

  module_function

  def apply(event)
    object = event.dig("data", "object") || {}
    case event["type"]
    when "checkout.session.completed"
      org = Organization.find_by(id: object.dig("metadata", "organization_id") || object["client_reference_id"])
      return unless org

      org.update!(stripe_customer_id: object["customer"], stripe_subscription_id: object["subscription"], plan: "team", plan_status: "active")
      org.log!("plan_changed", to: "team")
    when "customer.subscription.created", "customer.subscription.updated"
      org = find(object)
      return unless org

      paid = PAID.include?(object["status"])
      period_end = object["current_period_end"] || object.dig("items", "data", 0, "current_period_end")
      before = org.plan
      org.update!(plan: paid ? (org.plan == "business" ? "business" : "team") : "free", plan_status: object["status"],
                  stripe_subscription_id: object["id"], current_period_end: period_end && Time.zone.at(period_end))
      org.log!("plan_changed", to: org.plan) if org.plan != before
    when "customer.subscription.deleted"
      org = find(object)
      return unless org

      org.update!(plan: "free", plan_status: "canceled", stripe_subscription_id: nil)
      org.log!("plan_changed", to: "free")
    when "invoice.payment_failed"
      org = Organization.find_by(stripe_customer_id: object["customer"])
      org&.update!(plan_status: "past_due")
    end
  end

  def find(subscription)
    Organization.find_by(stripe_subscription_id: subscription["id"]) ||
      Organization.find_by(stripe_customer_id: subscription["customer"]) ||
      Organization.find_by(id: subscription.dig("metadata", "organization_id"))
  end
end
