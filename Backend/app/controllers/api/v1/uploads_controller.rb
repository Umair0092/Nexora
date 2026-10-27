module Api
  module V1
    # File uploads that go straight to the model: CV parsing and answer transcription.
    #
    #   POST /api/v1/resume/parse    multipart file (PDF, max 10 MB) -> { candidate_data }
    #   POST /api/v1/transcriptions  multipart file (audio, max 15 MB), language -> { text, speech }
    class UploadsController < ApplicationController
      MAX_PDF_BYTES = 10.megabytes
      MAX_AUDIO_BYTES = 15.megabytes
      AUDIO_EXTENSIONS = %w[.webm .ogg .wav .mp3 .m4a .mp4].freeze

      rate_limit to: 60, within: 10.minutes, name: "uploads", by: -> { current_user.id },
                 store: AuthController::RATE_LIMIT_STORE, with: AuthController::RATE_LIMIT_RESPONSE

      rescue_from(Llm::Error) { |e| render json: { error: e.message }, status: e.status }

      def parse_resume
        file = uploaded_file or return
        return render json: { error: "File too large. Maximum allowed size is 10 MB." }, status: :content_too_large if file.size > MAX_PDF_BYTES

        bytes = file.read
        # Check the content, not the browser-supplied type.
        return render json: { error: "Only PDF files are accepted." }, status: :unsupported_media_type unless bytes.lstrip.start_with?("%PDF-")

        render json: { candidate_data: ResumeParser.call(bytes) }
      rescue ResumeParser::Unreadable => e
        render json: { error: e.message }, status: :unprocessable_entity
      rescue Llm::Error => e
        message = e.quota? || e.message == Llm::NOT_CONFIGURED ? e.message : "The AI service couldn't read your CV right now. Try again in a few minutes."
        render json: { error: message }, status: :service_unavailable
      end

      def transcribe
        file = uploaded_file or return
        return render json: { error: "Audio too large. Maximum allowed size is 15 MB." }, status: :content_too_large if file.size > MAX_AUDIO_BYTES

        language = Interviewing.language(params[:language].to_s)
        extension = File.extname(file.original_filename.to_s).downcase
        extension = ".webm" unless AUDIO_EXTENSIONS.include?(extension)

        result = Llm.transcribe(file.read, filename: "answer#{extension}", language: language,
                                prompt: language == "en" ? SpeechMetrics::WHISPER_PROMPT : nil)
        text = result["text"].to_s.strip
        speech = text.present? ? SpeechMetrics.compute(result["words"], result["duration"], text) : nil
        render json: { text: text, speech: speech }
      end

      private

      def uploaded_file
        file = params[:file]
        return file if file.respond_to?(:read) && file.respond_to?(:size)

        render json: { error: "Attach a file." }, status: :unprocessable_entity
        nil
      end
    end
  end
end
