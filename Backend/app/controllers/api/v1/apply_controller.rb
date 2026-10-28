module Api
  module V1
    # The candidate's side of a screening interview, reached through their
    # personal link. No account: the token in the URL is the credential. The
    # current question is only revealed after consent, one at a time.
    #
    #   GET    /api/v1/apply/:token                 -> company, job, progress and the current question
    #   POST   /api/v1/apply/:token/consent         -> starts the interview
    #   POST   /api/v1/apply/:token/transcriptions  multipart file -> { text }
    #   POST   /api/v1/apply/:token/speech          -> the current question read aloud (audio/wav)
    #   POST   /api/v1/apply/:token/resume          multipart PDF file, or { skip: true } (before the first answer)
    #   POST   /api/v1/apply/:token/answers         { position, transcript, durationSeconds }
    #   POST   /api/v1/apply/:token/complete        -> submits; the team is notified
    #   DELETE /api/v1/apply/:token                 -> withdraw: deletes answers
    class ApplyController < ApplicationController
      MAX_AUDIO_BYTES = 15.megabytes
      MAX_RESUME_BYTES = 5.megabytes
      NOT_FOUND = "This interview link isn't valid. Check the link in your email.".freeze

      skip_before_action :authenticate_request
      before_action :load_candidate
      before_action :require_in_progress, only: [ :transcribe, :speech, :resume, :answer, :complete ]

      rate_limit to: 60, within: 10.minutes, only: [ :transcribe, :speech, :resume ], name: "apply-ai",
                 by: -> { params[:token].to_s }, store: AuthController::RATE_LIMIT_STORE, with: AuthController::RATE_LIMIT_RESPONSE
      rate_limit to: 120, within: 10.minutes, name: "apply", by: -> { request.remote_ip },
                 store: AuthController::RATE_LIMIT_STORE, with: AuthController::RATE_LIMIT_RESPONSE

      def show
        render json: state
      end

      def consent
        if @candidate.status == "invited"
          unless @job.open?
            return render json: { error: "This job is no longer taking applications." }, status: :unprocessable_entity
          end

          now = Time.current
          @candidate.update!(status: "in_progress", consented_at: now, started_at: now)
          @candidate.organization.log!("candidate_consented", candidate: @candidate)
        end
        render json: state
      end

      def transcribe
        file = params[:file]
        unless file.respond_to?(:read) && file.size.between?(1, MAX_AUDIO_BYTES)
          return render json: { error: "Record your answer again: the audio didn't arrive." }, status: :unprocessable_entity
        end

        result = Llm.transcribe(file.read, filename: "answer.webm", language: "en")
        render json: { text: result["text"].to_s.strip }
      rescue Llm::Error => e
        render json: { error: e.message }, status: e.status
      end

      def speech
        text = @candidate.current_question unless resume_step?
        return render json: { error: "There's no question to read yet." }, status: :unprocessable_entity unless text

        key = [ "speech", ENV.fetch("TTS_MODEL", Llm::DEFAULT_TTS_MODEL), ENV.fetch("TTS_VOICE", Llm::DEFAULT_TTS_VOICE),
                Digest::SHA256.hexdigest(text) ].join(":")
        send_data Rails.cache.fetch(key, expires_in: 7.days) { Llm.speak(text) }, type: "audio/wav", disposition: "inline"
      rescue Llm::Error, Wav::Invalid
        render json: { error: "The interviewer's voice is unavailable right now." }, status: :service_unavailable
      end

      # The CV is read once, before the questions. Only its extracted text is kept.
      def resume
        unless resume_step?
          return render json: { error: "Your CV can only be added before the first question.", state: state }, status: :conflict
        end
        if ActiveModel::Type::Boolean.new.cast(params[:skip])
          @candidate.update!(resume_status: "skipped")
          return render json: state
        end

        file = params[:file]
        unless file.respond_to?(:read) && file.size.between?(1, MAX_RESUME_BYTES)
          return render json: { error: "Choose a PDF of up to 5 MB." }, status: :unprocessable_entity
        end

        data = ResumeParser.call(file.read)
        @candidate.update!(resume_data: data, resume_status: "pending")
        @candidate.organization.log!("resume_added", candidate: @candidate)
        MatchResumeJob.perform_later(@candidate)
        render json: state
      rescue ResumeParser::Unreadable => e
        render json: { error: "#{e.message}. You can try another file or continue without one." }, status: :unprocessable_entity
      rescue Llm::Error => e
        render json: { error: e.message }, status: e.status
      end

      # One attempt per question: the answer must be for the current question.
      def answer
        position = Integer(params[:position].to_s, exception: false)
        transcript = params[:transcript].is_a?(String) ? params[:transcript].strip : ""
        if position != @candidate.current_position || @candidate.current_question.nil?
          return render json: { error: "That question has already been answered.", state: state }, status: :conflict
        end
        if transcript.blank? || transcript.length > 10_000
          return render json: { error: "We didn't get an answer. Record it again." }, status: :unprocessable_entity
        end

        @candidate.answers.create!(
          position: position,
          question: @candidate.current_question,
          transcript: transcript,
          duration_seconds: Integer(params[:durationSeconds].to_s, exception: false)&.clamp(0, 3600)
        )
        render json: state
      rescue ActiveRecord::RecordNotUnique
        render json: { error: "That question has already been answered.", state: state }, status: :conflict
      end

      def complete
        if @candidate.current_question
          return render json: { error: "Answer every question before submitting." }, status: :unprocessable_entity
        end

        @candidate.update!(status: "completed", completed_at: Time.current, evaluation_status: "pending")
        @candidate.organization.log!("candidate_completed", candidate: @candidate)
        EvaluateCandidateJob.perform_later(@candidate)
        render json: state
      end

      def withdraw
        @candidate.withdraw! unless @candidate.status == "withdrawn"
        render json: state
      end

      private

      def load_candidate
        token = params[:token].to_s
        @candidate = Candidate.includes(job: :organization).find_by(access_token: token) if token.length == 32
        return render json: { error: NOT_FOUND }, status: :not_found unless @candidate

        @job = @candidate.job
      end

      def require_in_progress
        return if @candidate.status == "in_progress"

        render json: { error: "This interview isn't in progress.", state: state }, status: :conflict
      end

      # Offered once, right after consent, when the job asks for CVs.
      def resume_step?
        @job.collect_resume && @candidate.status == "in_progress" && @candidate.resume_status.nil? && @candidate.current_position.zero?
      end

      # The next live interview the team booked, so the candidate's link shows it too.
      def upcoming_interview
        m = @candidate.meetings.upcoming.first
        m && { title: m.title, startsAt: m.starts_at, durationMinutes: m.duration_minutes, meetingUrl: m.meeting_url, provider: m.provider }
      end

      def state
        in_progress = @candidate.status == "in_progress"
        {
          company: @job.organization.name,
          jobTitle: @job.title,
          candidateName: @candidate.name,
          status: @candidate.status,
          jobOpen: @job.open?,
          questionCount: @job.questions.size,
          answerSeconds: @job.answer_seconds,
          answered: @candidate.status == "withdrawn" ? 0 : @candidate.current_position,
          collectResume: @job.collect_resume,
          resumeStep: resume_step?,
          resumeAdded: @candidate.resume_data.present?,
          currentQuestion: in_progress && !resume_step? ? @candidate.current_question : nil,
          consentedAt: @candidate.consented_at,
          completedAt: @candidate.completed_at,
          upcomingInterview: upcoming_interview
        }
      end
    end
  end
end
