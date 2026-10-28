require "net/http"

# The few Stripe calls billing needs, without the SDK.
#
#   StripeBilling.configured?                          # STRIPE_SECRET_KEY and STRIPE_PRICE_TEAM are set
#   StripeBilling.checkout_url(org, user)              # => Stripe-hosted page to start the Team plan
#   StripeBilling.portal_url(org)                      # => Stripe's page to change card, cancel, see invoices
#   StripeBilling.event(payload, signature_header)     # => verified webhook event (Hash), or raises Stripe::Error
module StripeBilling
  API = "https://api.stripe.com/v1".freeze
  TOLERANCE = 5.minutes

  class Error < StandardError; end

  module_function

  def configured?
    ENV["STRIPE_SECRET_KEY"].present? && ENV["STRIPE_PRICE_TEAM"].present?
  end

  def checkout_url(organization, user)
    params = {
      "mode" => "subscription",
      "line_items[0][price]" => ENV.fetch("STRIPE_PRICE_TEAM"),
      "line_items[0][quantity]" => 1,
      "client_reference_id" => organization.id,
      "metadata[organization_id]" => organization.id,
      "subscription_data[metadata][organization_id]" => organization.id,
      "allow_promotion_codes" => true,
      "success_url" => ApplicationMailer.app_url("/hiring/billing?checkout=done"),
      "cancel_url" => ApplicationMailer.app_url("/hiring/billing")
    }
    if organization.stripe_customer_id.present?
      params["customer"] = organization.stripe_customer_id
    else
      params["customer_email"] = user.email
    end
    request(:post, "/checkout/sessions", params).fetch("url")
  end

  def portal_url(organization)
    raise Error, "There's no subscription to manage yet." if organization.stripe_customer_id.blank?

    request(:post, "/billing_portal/sessions", "customer" => organization.stripe_customer_id,
                                               "return_url" => ApplicationMailer.app_url("/hiring/billing")).fetch("url")
  end

  # Stripe-Signature: t=1730000000,v1=<hex HMAC-SHA256 of "t.payload" with STRIPE_WEBHOOK_SECRET>
  def event(payload, header)
    secret = ENV["STRIPE_WEBHOOK_SECRET"].to_s
    raise Error, "STRIPE_WEBHOOK_SECRET isn't set" if secret.empty?

    parts = header.to_s.split(",").map { |p| p.split("=", 2) }
    stamp = parts.find { |k, _| k == "t" }&.last.to_i
    signatures = parts.select { |k, _| k == "v1" }.map(&:last)
    expected = OpenSSL::HMAC.hexdigest("SHA256", secret, "#{stamp}.#{payload}")
    raise Error, "bad signature" unless signatures.any? { |s| ActiveSupport::SecurityUtils.secure_compare(s, expected) }
    raise Error, "stale event" if (Time.current.to_i - stamp).abs > TOLERANCE

    JSON.parse(payload)
  rescue JSON::ParserError
    raise Error, "unreadable event"
  end

  # Separate so tests can stand in for Stripe.
  def request(method, path, params = {})
    uri = URI("#{API}#{path}")
    req = { post: Net::HTTP::Post, get: Net::HTTP::Get }.fetch(method).new(uri)
    req.basic_auth(ENV.fetch("STRIPE_SECRET_KEY"), "")
    req["Stripe-Version"] = "2024-06-20"
    req.set_form_data(params) if method == :post
    response = Net::HTTP.start(uri.host, uri.port, use_ssl: true, open_timeout: 10, read_timeout: 20) { |http| http.request(req) }
    data = JSON.parse(response.body)
    return data if response.is_a?(Net::HTTPSuccess)

    Rails.logger.error("Stripe #{path} -> #{response.code}: #{data.dig('error', 'message')}")
    raise Error, "Stripe didn't accept the request. Try again in a minute."
  rescue SocketError, SystemCallError, IOError, Net::OpenTimeout, Net::ReadTimeout, OpenSSL::SSL::SSLError, JSON::ParserError, KeyError
    raise Error, "Couldn't reach Stripe. Try again in a minute."
  end
end
