# Shared by the interview and quiz controllers: rate limits on the calls that
# reach the model, and readable errors for expired interviews and AI failures.
module LiveInterviewActions
  extend ActiveSupport::Concern

  included do
    rate_limit to: 60, within: 10.minutes, only: %i[create answer], name: "live-ai", by: -> { current_user.id },
               store: Api::V1::AuthController::RATE_LIMIT_STORE, with: Api::V1::AuthController::RATE_LIMIT_RESPONSE

    rescue_from(LiveInterview::Expired) { |e| render json: { error: e.message }, status: :not_found }
    rescue_from(Llm::Error) { |e| render json: { error: e.message }, status: e.status }
  end

  private

  def open_live(kind, &block)
    LiveInterview.open!(current_user, params[:id], kind, &block)
  end

  def answer_text
    text = params[:answer].is_a?(String) ? params[:answer].strip : ""
    return text if text.present? && text.length <= 10_000

    render json: { error: "Send an answer between 1 and 10,000 characters." }, status: :unprocessable_entity
    nil
  end

  def speech_param
    SpeechMetrics.sanitize(params[:speech])
  end
end
