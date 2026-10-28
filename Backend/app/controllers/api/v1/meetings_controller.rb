module Api
  module V1
    # Live interviews with candidates.
    #
    #   GET   /api/v1/meetings                       -> the company's upcoming interviews
    #   POST  /api/v1/candidates/:candidate_id/meetings
    #         { title, startsAt, durationMinutes, timeZone, panelistIds[], meetingUrl, createMeet, agenda }
    #   PATCH /api/v1/meetings/:id                   (same fields; sends updated invitations)
    #   POST  /api/v1/meetings/:id/cancel
    #   GET   /api/v1/meetings/:id                   -> with transcript and minutes
    #   POST  /api/v1/meetings/:id/notetaker         sends the notetaker into the call now
    #   POST  /api/v1/meetings/:id/recording         multipart file (audio, max 25 MB) -> transcript, then minutes
    #   POST  /api/v1/meetings/:id/minutes           writes the minutes again
    #
    # `notetaker: true` on create or update books the notetaker for the start time.
    # createMeet makes the event in the signed-in teammate's Google Calendar with a
    # Meet link; without it, meetingUrl is any https link (Meet, Zoom, Teams...).
    class MeetingsController < ApplicationController
      include HiringAccess

      MAX_RECORDING_BYTES = 25.megabytes
      RECORDING_EXTENSIONS = %w[.mp3 .m4a .mp4 .mpeg .mpga .wav .webm .ogg .flac].freeze

      before_action :load_meeting, only: [ :show, :update, :cancel, :notetaker, :recording, :minutes ]
      rate_limit to: 30, within: 10.minutes, only: [ :create, :update ], name: "meetings", by: -> { current_user.id },
                 store: AuthController::RATE_LIMIT_STORE, with: AuthController::RATE_LIMIT_RESPONSE
      rate_limit to: 10, within: 10.minutes, only: [ :recording, :minutes, :notetaker ], name: "meeting-ai", by: -> { current_user.id },
                 store: AuthController::RATE_LIMIT_STORE, with: AuthController::RATE_LIMIT_RESPONSE

      def index
        meetings = current_organization.meetings.upcoming.includes(:panelists, :created_by, candidate: :job).limit(20)
        render json: meetings.map { |m| HiringSerializer.meeting(m) }
      end

      def create
        candidate = current_organization.candidates.find_by(id: params[:candidate_id])
        return render(json: { error: "Not found" }, status: :not_found) unless candidate
        return render(json: { error: "This candidate withdrew." }, status: :unprocessable_entity) if candidate.status == "withdrawn"

        meeting = current_organization.meetings.new(candidate: candidate, created_by: current_user, **attributes)
        meeting.title = "Interview: #{candidate.name}, #{candidate.job.title}" if meeting.title.blank?
        return unless valid_panel?(meeting) && in_future?(meeting)

        google = nil
        if ActiveModel::Type::Boolean.new.cast(params[:createMeet])
          google = current_user.calendar_connection
          return render(json: { error: "Connect Google Calendar on your Account page to create Meet links." }, status: :unprocessable_entity) unless google && GoogleCalendar.configured?
        end
        MeetingScheduler.schedule!(meeting, google: google)
        render json: HiringSerializer.meeting(meeting), status: :created
      rescue ActiveRecord::RecordInvalid => e
        errors_of(e.record)
      rescue GoogleCalendar::Error => e
        render json: { error: e.message }, status: :bad_gateway
      end

      def update
        return render(json: { error: "This interview was cancelled." }, status: :unprocessable_entity) unless @meeting.scheduled?

        attrs = attributes
        attrs.delete(:time_zone) if attrs[:time_zone].blank?
        attrs.delete(:meeting_url) if @meeting.google_event_id
        attrs[:panelist_ids] = panel_ids if params.key?(:panelistIds)
        @meeting.assign_attributes(attrs.except(:panelist_ids))
        return if attrs.key?(:panelist_ids) && !valid_panel?(@meeting, attrs[:panelist_ids])
        return unless in_future?(@meeting)

        MeetingScheduler.reschedule!(@meeting, user: current_user, **attrs)
        render json: HiringSerializer.meeting(@meeting.reload)
      rescue ActiveRecord::RecordInvalid => e
        errors_of(e.record)
      rescue GoogleCalendar::Error => e
        render json: { error: e.message }, status: :bad_gateway
      end

      def show
        render json: HiringSerializer.meeting_detail(@meeting)
      end

      def notetaker
        return render(json: { error: "The notetaker isn't set up on this server." }, status: :unprocessable_entity) unless MeetingBot.configured?
        return render(json: { error: "Add a video link to the interview first." }, status: :unprocessable_entity) if @meeting.meeting_url.blank?
        return render(json: { error: "This interview was cancelled." }, status: :unprocessable_entity) unless @meeting.scheduled?
        return render(json: { error: "The notetaker already has this call." }, status: :conflict) if @meeting.bot_id.present?

        @meeting.update!(notetaker: true)
        NotetakerJob.perform_now(@meeting.id)
        current_organization.log!("notetaker_sent", user: current_user, candidate: @meeting.candidate, meeting_id: @meeting.id)
        render json: HiringSerializer.meeting_detail(@meeting.reload)
      end

      # A recording from the call (any app's export, or a phone's voice memo) instead of the bot.
      def recording
        file = params[:file]
        return render(json: { error: "Attach the recording." }, status: :unprocessable_entity) unless file.respond_to?(:read)
        return render(json: { error: "Recordings can be up to 25 MB. Export audio only (M4A or MP3) to make it smaller." }, status: :content_too_large) if file.size > MAX_RECORDING_BYTES

        extension = File.extname(file.original_filename.to_s).downcase
        return render(json: { error: "Upload an audio or video file (MP3, M4A, MP4, WAV or WebM)." }, status: :unsupported_media_type) unless RECORDING_EXTENSIONS.include?(extension)

        result = Llm.transcribe(file.read, filename: "interview#{extension}", language: Interviewing.language(params[:language].to_s))
        transcript = MeetingTranscript.from_whisper(result)
        return render(json: { error: "No speech was found in that recording." }, status: :unprocessable_entity) if transcript.empty?

        @meeting.update!(transcript: transcript, transcript_source: "upload", minutes_status: "pending", minutes: nil)
        current_organization.log!("meeting_transcribed", user: current_user, candidate: @meeting.candidate, meeting_id: @meeting.id, source: "upload")
        MeetingMinutesJob.perform_later(@meeting.id)
        render json: HiringSerializer.meeting_detail(@meeting)
      rescue Llm::Error => e
        render json: { error: e.message }, status: e.status
      end

      def minutes
        return render(json: { error: "There's no transcript yet." }, status: :unprocessable_entity) if Array(@meeting.transcript).empty?

        @meeting.update!(minutes_status: "pending")
        MeetingMinutesJob.perform_later(@meeting.id)
        render json: HiringSerializer.meeting_detail(@meeting)
      end

      def cancel
        MeetingScheduler.cancel!(@meeting, user: current_user) if @meeting.scheduled?
        render json: HiringSerializer.meeting(@meeting)
      rescue GoogleCalendar::Error => e
        render json: { error: e.message }, status: :bad_gateway
      end

      private

      def load_meeting
        @meeting = current_organization.meetings.find_by(id: params[:id])
        render json: { error: "Not found" }, status: :not_found unless @meeting
      end

      # Only the fields the request sends, so a PATCH changes just those.
      def attributes
        {
          title: (params[:title].to_s.squish if params.key?(:title)),
          starts_at: (parse_time(params[:startsAt]) if params.key?(:startsAt)),
          duration_minutes: (params[:durationMinutes].to_i if params.key?(:durationMinutes)),
          time_zone: (params[:timeZone].to_s if params.key?(:timeZone)),
          meeting_url: (params[:meetingUrl].to_s.strip.presence if params.key?(:meetingUrl)),
          agenda: (params[:agenda].to_s.strip if params.key?(:agenda)),
          notetaker: (ActiveModel::Type::Boolean.new.cast(params[:notetaker]) if params.key?(:notetaker))
        }.select { |key, _| params.key?(PARAM_NAMES[key]) }
      end

      PARAM_NAMES = { title: :title, starts_at: :startsAt, duration_minutes: :durationMinutes, time_zone: :timeZone,
                      meeting_url: :meetingUrl, agenda: :agenda, notetaker: :notetaker }.freeze

      # An unparseable time becomes a blank one, which fails validation with a clear message.
      def parse_time(value)
        Time.iso8601(value.to_s)
      rescue ArgumentError
        nil
      end

      def panel_ids
        Array(params[:panelistIds]).map(&:to_i).uniq
      end

      # Panelists must be teammates; a new meeting with no panel gets its organizer.
      def valid_panel?(meeting, ids = panel_ids)
        ids = [ current_user.id ] if ids.empty? && meeting.new_record?
        members = current_organization.users.where(id: ids).to_a
        if members.size != ids.size || ids.size > Meeting::MAX_PANEL
          render json: { error: "Choose up to #{Meeting::MAX_PANEL} people from your team for the panel." }, status: :unprocessable_entity
          return false
        end
        meeting.panelists = members if meeting.new_record?
        true
      end

      def in_future?(meeting)
        return true if meeting.starts_at.nil? || meeting.starts_at > 5.minutes.ago

        render json: { error: "Pick a time in the future." }, status: :unprocessable_entity
        false
      end
    end
  end
end
