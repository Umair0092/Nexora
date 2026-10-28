module Api
  module V1
    # The company's reusable emails to candidates.
    #
    #   GET    /api/v1/email_templates
    #   POST   /api/v1/email_templates       { name, subject, body }
    #   PATCH  /api/v1/email_templates/:id   { name, subject, body }
    #   DELETE /api/v1/email_templates/:id
    class EmailTemplatesController < ApplicationController
      include HiringAccess

      def index
        current_organization.add_default_email_templates
        render json: current_organization.email_templates.map { |t| HiringSerializer.email_template(t) }
      end

      def create
        template = current_organization.email_templates.new(template_params)
        return errors_of(template) unless template.save

        render json: HiringSerializer.email_template(template), status: :created
      end

      def update
        template = current_organization.email_templates.find(params[:id])
        return errors_of(template) unless template.update(template_params)

        render json: HiringSerializer.email_template(template)
      end

      def destroy
        current_organization.email_templates.find(params[:id]).destroy!
        head :no_content
      end

      private

      def template_params
        %i[name subject body].index_with { |k| params[k].to_s.strip }.select { |k, _| params.key?(k) }
      end
    end
  end
end
