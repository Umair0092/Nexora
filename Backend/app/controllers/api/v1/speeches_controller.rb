module Api
  module V1
    # The interviewer's voice: text in, natural-sounding speech out.
    #
    #   POST /api/v1/speech  { text } -> audio/wav
    #
    # The same text is only synthesised once (cached for a week). When the
    # voice service is unavailable this answers 503 and the browser falls back
    # to its own speech synthesis.
    class SpeechesController < ApplicationController
      MAX_TEXT = 1000

      rate_limit to: 120, within: 10.minutes, name: "speech", by: -> { current_user.id },
                 store: AuthController::RATE_LIMIT_STORE, with: AuthController::RATE_LIMIT_RESPONSE

      def create
        text = params[:text].is_a?(String) ? params[:text].squish : ""
        return render json: { error: "Send some text to read out." }, status: :unprocessable_entity if text.blank? || text.length > MAX_TEXT

        key = [ "speech", ENV.fetch("TTS_MODEL", Llm::DEFAULT_TTS_MODEL), ENV.fetch("TTS_VOICE", Llm::DEFAULT_TTS_VOICE),
                Digest::SHA256.hexdigest(text) ].join(":")
        audio = Rails.cache.fetch(key, expires_in: 7.days) { Llm.speak(text) }
        expires_in 7.days, public: false
        send_data audio, type: "audio/wav", disposition: "inline"
      rescue Llm::Error, Wav::Invalid => e
        Rails.logger.warn("Speech unavailable: #{e.message}")
        render json: { error: "The interviewer's voice is unavailable right now." }, status: :service_unavailable
      end
    end
  end
end
