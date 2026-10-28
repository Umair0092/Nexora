class WebhookDelivery < ApplicationRecord
  KEEP = 50

  belongs_to :webhook_endpoint

  def succeeded?
    status_code.to_i.between?(200, 299)
  end
end
