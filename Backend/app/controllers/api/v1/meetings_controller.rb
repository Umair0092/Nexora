module Api
  module V1
    # Live interviews with candidates.
    #
    #   GET   /api/v1/meetings                       -> the company's upcoming interviews
    #   POST  /api/v1/candidates/:candidate_id/meetings
    #         { title, startsAt, durationMinutes, timeZone, panelistIds[], meetingUrl, createMeet, agenda }
    #   PATCH /api/v1/meetings/:id                   (same fields; sends updated invitations)
    #   POST  /api/v1/meetings/:id/cancel
    #
    # createMeet makes the event in the signed-in teammate's Google Calendar with a
    # Meet link; without it, meetingUrl is any https link (Meet, Zoom, Teams...).
    class MeetingsController < ApplicationController
      include HiringAccess

      before_action :load_meeting, only: [ :update, :cancel ]
      rate_limit to: 30, within: 10.minutes, only: [ :create, :update ], name: "meetings", by: -> { current_user.id },
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
        return unless valid_panel?(@meeting, attrs[:panelist_ids]) && in_future?(@meeting)

        MeetingScheduler.reschedule!(@meeting, user: current_user, **attrs)
        render json: HiringSerializer.meeting(@meeting.reload)
      rescue ActiveRecord::RecordInvalid => e
        errors_of(e.record)
      rescue GoogleCalendar::Error => e
        render json: { error: e.message }, status: :bad_gateway
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
          agenda: (params[:agenda].to_s.strip if params.key?(:agenda))
        }.select { |key, _| params.key?(PARAM_NAMES[key]) }
      end

      PARAM_NAMES = { title: :title, starts_at: :startsAt, duration_minutes: :durationMinutes, time_zone: :timeZone,
                      meeting_url: :meetingUrl, agenda: :agenda }.freeze

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
