module Api
  module V1
    class DomainsController < ApplicationController
      skip_before_action :authenticate_request, only: [ :index, :show ]

      def index
        @domains = Domain.visible
        render json: @domains
      end

      def show
        @domain = Domain.visible.find(params[:id])
        render json: @domain
      end
    end
  end
end
