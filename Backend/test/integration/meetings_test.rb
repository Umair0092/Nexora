require "test_helper"

class MeetingsTest < ActionDispatch::IntegrationTest
  include ActiveJob::TestHelper

  setup do
    @owner = create_user(email: "owner@acme.test", first_name: "Ada", last_name: "Park")
    @riya = create_user(email: "riya@acme.test", first_name: "Riya", last_name: "Shah")
    @org = Organization.create!(name: "Acme")
    @org.memberships.create!(user: @owner, role: "owner")
    @org.memberships.create!(user: @riya, role: "recruiter")
    @job = @org.jobs.create!(title: "Backend Engineer", questions: %w[Q1 Q2 Q3], criteria: %w[Design Ownership])
    @candidate = @job.candidates.create!(name: "Sam Lee", email: "sam@example.com", status: "completed", completed_at: 1.day.ago)
    @start = 2.days.from_now.change(hour: 10, min: 0)
  end

  def schedule(user = @owner, **params)
    post "/api/v1/candidates/#{@candidate.id}/meetings",
         params: { startsAt: @start.iso8601, durationMinutes: 45, timeZone: "Asia/Karachi", meetingUrl: "https://acme.zoom.us/j/123", **params },
         headers: auth_headers(user), as: :json
  end

  # The invite with folded lines joined back up.
  def ics(mail)
    mail.attachments.find { |a| a.filename == "invite.ics" }.decoded.gsub(/\r?\n /, "")
  end

  test "scheduling with a link emails the candidate and the panel a calendar invite" do
    perform_enqueued_jobs { schedule(panelistIds: [ @owner.id, @riya.id ], agenda: "System design, 30 minutes") }
    assert_response :created
    assert_equal "zoom", json["provider"]
    assert_equal "Interview: Sam Lee, Backend Engineer", json["title"]
    assert_equal %w[Ada\ Park Riya\ Shah], json["panel"].map { |p| p["name"] }

    mails = ActionMailer::Base.deliveries
    assert_equal %w[owner@acme.test riya@acme.test sam@example.com], mails.flat_map(&:to).sort
    to_candidate = mails.find { |m| m.to == [ "sam@example.com" ] }
    assert_match(/Thu|Fri|Sat|Sun|Mon|Tue|Wed/, to_candidate.subject)
    assert_includes to_candidate.text_part.body.to_s, "https://acme.zoom.us/j/123"
    assert_equal [ "owner@acme.test" ], to_candidate.reply_to

    invite = ics(to_candidate)
    meeting = Meeting.last
    assert_includes invite, "METHOD:REQUEST"
    assert_includes invite, "UID:#{meeting.uid}"
    assert_includes invite, "DTSTART:#{@start.utc.strftime('%Y%m%dT%H%M%SZ')}"
    assert_includes invite, "ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:riya@acme.test"
    assert_includes invite, "System design\\, 30 minutes"
    assert_equal "meeting_scheduled", @org.hiring_events.last.action
  end

  test "the organizer is the panel when nobody is chosen" do
    schedule
    assert_response :created
    assert_equal [ @owner.id ], Meeting.last.panelist_ids
  end

  test "rejects outsiders on the panel, past times, bad links and withdrawn candidates" do
    outsider = create_user(email: "x@globex.test")
    schedule(panelistIds: [ outsider.id ])
    assert_response :unprocessable_entity

    schedule(startsAt: 1.hour.ago.iso8601)
    assert_equal "Pick a time in the future.", json["error"]

    schedule(meetingUrl: "javascript:alert(1)")
    assert_response :unprocessable_entity

    @candidate.update!(status: "withdrawn")
    schedule
    assert_response :unprocessable_entity
    assert_equal 0, Meeting.count
  end

  test "another company can't see or book interviews" do
    other = create_user(email: "boss@globex.test")
    Organization.create!(name: "Globex").memberships.create!(user: other, role: "owner")
    schedule(other)
    assert_response :not_found
  end

  test "rescheduling sends updates to the same event and cancels for people taken off the panel" do
    schedule(panelistIds: [ @owner.id, @riya.id ])
    meeting = Meeting.last
    ActionMailer::Base.deliveries.clear

    perform_enqueued_jobs do
      patch "/api/v1/meetings/#{meeting.id}", params: { startsAt: (@start + 1.day).iso8601, panelistIds: [ @owner.id ] },
                                              headers: auth_headers(@owner), as: :json
    end
    assert_response :ok
    assert_equal 1, meeting.reload.sequence
    assert_equal 45, meeting.duration_minutes, "fields that weren't sent are kept"

    updates, cancels = ActionMailer::Base.deliveries.partition { |m| m.subject.start_with?("Updated:") }
    assert_equal %w[owner@acme.test sam@example.com], updates.flat_map(&:to).sort
    assert_equal [ "riya@acme.test" ], cancels.flat_map(&:to)
    assert_includes ics(updates.first), "SEQUENCE:1"
    assert_includes ics(cancels.first), "METHOD:CANCEL"
  end

  test "changing only the time keeps the panel" do
    schedule(panelistIds: [ @owner.id, @riya.id ])
    meeting = Meeting.last
    patch "/api/v1/meetings/#{meeting.id}", params: { startsAt: (@start + 2.hours).iso8601 }, headers: auth_headers(@riya), as: :json
    assert_response :ok
    assert_equal [ @owner.id, @riya.id ].sort, meeting.reload.panelist_ids.sort
    assert_equal (@start + 2.hours).to_i, meeting.starts_at.to_i
  end

  test "cancelling tells everyone and the candidate's link stops showing it" do
    schedule
    meeting = Meeting.last
    get "/api/v1/apply/#{@candidate.access_token}"
    assert_equal "https://acme.zoom.us/j/123", json.dig("upcomingInterview", "meetingUrl")

    ActionMailer::Base.deliveries.clear
    perform_enqueued_jobs { post "/api/v1/meetings/#{meeting.id}/cancel", headers: auth_headers(@riya) }
    assert_response :ok
    assert_equal "cancelled", meeting.reload.status
    assert ActionMailer::Base.deliveries.all? { |m| m.subject.start_with?("Cancelled:") && ics(m).include?("STATUS:CANCELLED") }

    get "/api/v1/apply/#{@candidate.access_token}"
    assert_nil json["upcomingInterview"]
  end

  test "upcoming interviews show on the hiring home and in the meetings list" do
    schedule
    get "/api/v1/hiring/overview", headers: auth_headers(@riya)
    assert_equal [ "Sam Lee" ], json["upcomingMeetings"].map { |m| m.dig("candidate", "name") }
    get "/api/v1/meetings", headers: auth_headers(@riya)
    assert_equal 1, json.size
  end

  test "a withdrawing candidate's interviews are cancelled" do
    schedule
    perform_enqueued_jobs { Candidate.find(@candidate.id).withdraw! }
    assert_equal "cancelled", Meeting.last.status
  end

  test "a Google Meet link comes from the organizer's calendar and Google sends the invitations" do
    @owner.create_calendar_connection!(email: "ada@gmail.com", access_token: "token", refresh_token: "refresh", expires_at: 1.hour.from_now)
    sent = nil
    google = lambda do |method, url, json: nil, **|
      sent = [ method, url, json ]
      { "id" => "evt123", "hangoutLink" => "https://meet.google.com/abc-defg-hij" }
    end
    with_google_configured do
      GoogleCalendar.stub(:request, google) do
        perform_enqueued_jobs { schedule(createMeet: true, meetingUrl: nil) }
      end
    end
    assert_response :created
    assert_equal "google_meet", json["provider"]
    assert_equal "https://meet.google.com/abc-defg-hij", json["meetingUrl"]
    assert json["inGoogleCalendar"]
    assert_equal :post, sent[0]
    assert_includes sent[1], "conferenceDataVersion=1&sendUpdates=all"
    assert_equal "hangoutsMeet", sent[2].dig(:conferenceData, :createRequest, :conferenceSolutionKey, :type)
    assert_equal "Asia/Karachi", sent[2].dig(:start, :timeZone)
    assert_empty ActionMailer::Base.deliveries, "Google emails the attendees itself"
  end

  test "asking for a Meet link without a connected calendar says what to do" do
    with_google_configured { schedule(createMeet: true) }
    assert_response :unprocessable_entity
    assert_match "Connect Google Calendar", json["error"]
  end

  test "a Google failure saves nothing" do
    @owner.create_calendar_connection!(email: "ada@gmail.com", access_token: "token", expires_at: 1.hour.from_now)
    with_google_configured do
      GoogleCalendar.stub(:request, ->(*, **) { raise GoogleCalendar::Error, "Google Calendar didn't accept the request." }) do
        schedule(createMeet: true)
      end
    end
    assert_response :bad_gateway
    assert_equal 0, Meeting.count
  end

  test "connecting Google Calendar checks the signed state and stores encrypted tokens" do
    with_google_configured do
      get "/api/v1/calendar", headers: auth_headers(@owner)
      assert_equal({ "available" => true, "connected" => false, "email" => nil, "notetakerAvailable" => false }, json)

      post "/api/v1/calendar/google", headers: auth_headers(@owner)
      url = URI(json["url"])
      assert_equal "accounts.google.com", url.host
      state = Rack::Utils.parse_query(url.query)["state"]

      get "/api/v1/calendar/google/callback", params: { state: "forged", code: "abc" }
      assert_redirected_to "/account?calendar=failed"

      id_token = [ "x", Base64.urlsafe_encode64({ email: "ada@gmail.com" }.to_json, padding: false), "sig" ].join(".")
      tokens = { "access_token" => "at-1", "refresh_token" => "rt-1", "expires_in" => 3600, "id_token" => id_token }
      GoogleCalendar.stub(:request, ->(*, **) { tokens }) do
        get "/api/v1/calendar/google/callback", params: { state: state, code: "abc" }
      end
      assert_redirected_to "/account?calendar=connected"
    end

    connection = @owner.reload.calendar_connection
    assert_equal "ada@gmail.com", connection.email
    assert_equal "rt-1", connection.refresh_token
    raw = CalendarConnection.connection.select_value("SELECT refresh_token FROM calendar_connections WHERE id = #{connection.id}")
    assert_not_includes raw, "rt-1", "tokens are encrypted at rest"

    GoogleCalendar.stub(:request, ->(*, **) { {} }) { delete "/api/v1/calendar", headers: auth_headers(@owner) }
    assert_response :no_content
    assert_nil @owner.reload.calendar_connection
  end

  def with_google_configured(&)
    ENV["GOOGLE_CLIENT_ID"], ENV["GOOGLE_CLIENT_SECRET"] = "client", "secret"
    yield
  ensure
    ENV.delete("GOOGLE_CLIENT_ID")
    ENV.delete("GOOGLE_CLIENT_SECRET")
  end
end
