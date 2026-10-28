module Api
  module V1
    # The company's webhooks. Only the owner can see or change them.
    #
    #   GET    /api/v1/webhooks              -> endpoints with recent deliveries
    #   POST   /api/v1/webhooks              { url, events[] } -> includes the signing secret, shown this once
    #   PATCH  /api/v1/webhooks/:id          { url, events[], active }
    #   DELETE /api/v1/webhooks/:id
    #   POST   /api/v1/webhooks/:id/test     sends a test.ping event
    #   POST   /api/v1/webhooks/:id/rotate   a new secret, shown this once
    class WebhookEndpointsController < ApplicationController
      include HiringAccess

      before_action :require_owner
      before_action :load_endpoint, only: [ :update, :destroy, :test, :rotate ]
      rate_limit to: 20, within: 10.minutes, only: [ :create, :test, :rotate ], name: "webhooks", by: -> { current_user.id },
                 store: AuthController::RATE_LIMIT_STORE, with: AuthController::RATE_LIMIT_RESPONSE

      def index
        endpoints = current_organization.webhook_endpoints.order(:created_at)
        render json: { events: WebhookEndpoint::EVENTS.keys, endpoints: endpoints.map { |e| serialize(e) } }
      end

      def create
        endpoint = current_organization.webhook_endpoints.new(url: params[:url].to_s.strip, events: Array(params[:events]).map(&:to_s))
        return errors_of(endpoint) unless endpoint.save

        current_organization.log!("webhook_added", user: current_user, endpoint_id: endpoint.id)
        render json: serialize(endpoint).merge(secret: endpoint.secret), status: :created
      end

      def update
        @endpoint.url = params[:url].to_s.strip if params.key?(:url)
        @endpoint.events = Array(params[:events]).map(&:to_s) if params.key?(:events)
        @endpoint.active = ActiveModel::Type::Boolean.new.cast(params[:active]) if params.key?(:active)
        @endpoint.save ? render(json: serialize(@endpoint)) : errors_of(@endpoint)
      end

      def destroy
        @endpoint.destroy!
        current_organization.log!("webhook_removed", user: current_user, endpoint_id: @endpoint.id)
        head :no_content
      end

      def test
        delivery = WebhookDispatcher.deliver(@endpoint, "test.ping", WebhookDispatcher.sample(current_organization))
        render json: delivery_json(delivery), status: :accepted
      end

      def rotate
        @endpoint.update!(secret: "whsec_#{SecureRandom.hex(24)}")
        render json: serialize(@endpoint).merge(secret: @endpoint.secret)
      end

      private

      def load_endpoint
        @endpoint = current_organization.webhook_endpoints.find_by(id: params[:id])
        render json: { error: "Not found" }, status: :not_found unless @endpoint
      end

      def serialize(e)
        { id: e.id, url: e.url, events: e.events, active: e.active, createdAt: e.created_at,
          secretHint: "…#{e.secret.last(4)}", deliveries: e.deliveries.limit(10).map { |d| delivery_json(d) } }
      end

      def delivery_json(d)
        { id: d.delivery_id, event: d.event, statusCode: d.status_code, error: d.error, attempts: d.attempts,
          succeeded: d.succeeded?, at: d.created_at }
      end
    end
  end
end
