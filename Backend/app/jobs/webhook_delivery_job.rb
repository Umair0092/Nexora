require "net/http"

# Posts one webhook, signed like Stripe's so receivers can check it came from us:
#
#   Nexora-Signature: t=1730000000,v1=<hex HMAC-SHA256 of "#{t}.#{body}" with the endpoint's secret>
#
# Retries up to 6 times with growing waits on network errors and non-2xx
# answers. Connects to the IP that SafeUrl checked, and never follows redirects.
class WebhookDeliveryJob < ApplicationJob
  queue_as :default

  class Failed < StandardError; end

  retry_on Failed, wait: :polynomially_longer, attempts: 6

  TIMEOUT = 10

  def perform(delivery_id)
    delivery = WebhookDelivery.find_by(id: delivery_id)
    endpoint = delivery&.webhook_endpoint
    return unless endpoint&.active?

    body = delivery.payload.to_json
    stamp = Time.current.to_i
    signature = OpenSSL::HMAC.hexdigest("SHA256", endpoint.secret, "#{stamp}.#{body}")
    delivery.increment!(:attempts)

    status, error = post(endpoint.url, body, "t=#{stamp},v1=#{signature}", delivery)
    delivery.update!(status_code: status, error: error, delivered_at: (Time.current if status.to_i.between?(200, 299)))
    prune(endpoint)
    raise Failed, error || "HTTP #{status}" unless status.to_i.between?(200, 299)
  end

  private

  def post(url, body, signature, delivery)
    uri = URI(url)
    ip = SafeUrl.resolve(url).first
    return [ nil, "The address isn't public." ] unless ip

    http = Net::HTTP.new(uri.host, uri.port)
    http.ipaddr = ip
    http.use_ssl = true
    http.open_timeout = TIMEOUT
    http.read_timeout = TIMEOUT
    request = Net::HTTP::Post.new(uri.request_uri)
    request["Content-Type"] = "application/json"
    request["User-Agent"] = "Nexora-Webhooks/1.0"
    request["Nexora-Event"] = delivery.event
    request["Nexora-Delivery"] = delivery.delivery_id
    request["Nexora-Signature"] = signature
    request.body = body
    response = http.request(request)
    [ response.code.to_i, nil ]
  rescue SocketError, SystemCallError, IOError, Net::OpenTimeout, Net::ReadTimeout, OpenSSL::SSL::SSLError => e
    [ nil, e.class.name.demodulize ]
  end

  # Only the latest few deliveries are kept per endpoint.
  def prune(endpoint)
    old = endpoint.deliveries.offset(WebhookDelivery::KEEP).pluck(:id)
    WebhookDelivery.where(id: old).delete_all if old.any?
  end
end
