require "test_helper"

class MeetingNotetakerTest < ActionDispatch::IntegrationTest
  include ActiveJob::TestHelper

  MINUTES = {
    "summary" => "Covered the payouts service and an on-call incident.",
    "topics" => [ { "title" => "Payouts batch job", "notes" => "Split one long transaction into per-merchant jobs." } ],
    "criteria" => [
      { "criterion" => "System design", "signal" => "strong", "evidence" => "Per-merchant jobs with retries." },
      { "criterion" => "Ownership", "signal" => "excellent", "evidence" => "Ran the post-mortem." }
    ],
    "candidate_questions" => [ "How is on-call shared?" ],
    "concerns" => [ "Little on cost trade-offs" ],
    "follow_ups" => [ { "owner" => "Riya Shah", "item" => "Send the take-home" }, { "owner" => "", "item" => "Check references" } ]
  }.freeze

  setup do
    @owner = create_user(email: "owner@acme.test", first_name: "Ada", last_name: "Park")
    @riya = create_user(email: "riya@acme.test", first_name: "Riya", last_name: "Shah")
    @org = Organization.create!(name: "Acme")
    @org.memberships.create!(user: @owner, role: "owner")
    @org.memberships.create!(user: @riya, role: "recruiter")
    @job = @org.jobs.create!(title: "Backend Engineer", questions: %w[Q1 Q2 Q3], criteria: [ "System design", "Ownership" ])
    @candidate = @job.candidates.create!(name: "Sam Lee", email: "sam@example.com", status: "completed", completed_at: 1.day.ago)
    ENV["RECALL_API_KEY"] = "test-key"
  end

  teardown { ENV.delete("RECALL_API_KEY") }

  def meeting(**attrs)
    @org.meetings.create!(candidate: @candidate, created_by: @owner, title: "Interview", starts_at: 2.days.from_now,
                          meeting_url: "https://meet.google.com/abc-defg-hij", panelists: [ @owner, @riya ], **attrs)
  end

  test "scheduling with the notetaker books a bot for the start time and tells the candidate it's recorded" do
    sent = []
    MeetingBot.stub(:request, ->(method, path, body = nil) { sent << [ method, path, body ]; { "id" => "bot_1" } }) do
      perform_enqueued_jobs do
        post "/api/v1/candidates/#{@candidate.id}/meetings",
             params: { startsAt: 2.days.from_now.iso8601, meetingUrl: "https://meet.google.com/abc-defg-hij", notetaker: true },
             headers: auth_headers(@owner), as: :json
      end
    end
    assert_response :created
    m = Meeting.last
    assert_equal [ "bot_1", "scheduled" ], [ m.bot_id, m.notetaker_status ]
    method, path, body = sent.first
    assert_equal [ :post, "/bot/" ], [ method, path ]
    assert_equal "Nexora Notetaker", body[:bot_name]
    assert_equal m.starts_at.utc.iso8601, body[:join_at]
    assert_equal({ meeting_captions: {} }, body.dig(:recording_config, :transcript, :provider))

    to_candidate = ActionMailer::Base.deliveries.find { |mail| mail.to == [ "sam@example.com" ] }
    assert_includes to_candidate.text_part.body.to_s, "joins the call as \"Nexora Notetaker\""
  end

  test "when the call is over the transcript is saved, minutes written and the panel emailed" do
    m = meeting(notetaker: true, bot_id: "bot_1", notetaker_status: "recording", starts_at: 30.minutes.ago)
    turns = [
      { "participant" => { "name" => "Riya Shah" }, "words" => [ { "text" => "Tell", "start_timestamp" => { "relative" => 3.2 } }, { "text" => "me about payouts." } ] },
      { "participant" => { "name" => "Sam Lee" }, "words" => [ { "text" => "I split the batch job.", "start_timestamp" => { "relative" => 9.0 } } ] }
    ]
    bot = { "status_changes" => [ { "code" => "in_call_recording" }, { "code" => "done" } ],
            "recordings" => [ { "media_shortcuts" => { "transcript" => { "data" => { "download_url" => "https://files.recall.ai/t.json" } } } } ] }

    stub_llm(json: ->(prompt, **) { assert_includes prompt, "[00:03] Riya Shah: Tell me about payouts."; MINUTES }) do
      MeetingBot.stub(:request, ->(*) { bot }) do
        MeetingBot.stub(:fetch_json, ->(_) { turns }) do
          perform_enqueued_jobs { NotetakerPollJob.perform_now }
        end
      end
    end

    m.reload
    assert_equal [ "done", "bot", "done" ], [ m.notetaker_status, m.transcript_source, m.minutes_status ]
    assert_equal [ "Riya Shah", "Sam Lee" ], m.transcript.map { |e| e["speaker"] }
    assert_equal %w[strong not_covered], m.minutes["criteria"].map { |c| c["signal"] }, "unknown signals become not_covered"
    assert_equal "Panel", m.minutes["followUps"].last["owner"]
    assert_equal %w[owner@acme.test riya@acme.test], ActionMailer::Base.deliveries.select { |d| d.subject.start_with?("Minutes ready") }.flat_map(&:to).sort
    assert_equal %w[meeting_transcribed minutes_ready], @org.hiring_events.order(:id).last(2).map(&:action)
  end

  test "a bot nobody admitted is reported, not retried forever" do
    m = meeting(notetaker: true, bot_id: "bot_1", notetaker_status: "waiting_room", starts_at: 5.minutes.ago)
    bot = { "status_changes" => [ { "code" => "fatal", "sub_code" => "timeout_exceeded_waiting_room" } ] }
    MeetingBot.stub(:request, ->(*) { bot }) { NotetakerPollJob.perform_now }
    assert_equal "failed", m.reload.notetaker_status
    assert_equal "Nobody let the notetaker in from the waiting room.", m.notetaker_error
  end

  test "an uploaded recording is transcribed and summarised without a bot" do
    ENV.delete("RECALL_API_KEY")
    m = meeting(starts_at: 1.hour.ago)
    whisper = { "text" => "Hello. Hi.", "segments" => [ { "start" => 0.0, "text" => " Tell me about payouts." }, { "start" => 4.5, "text" => " I split the batch job." } ] }
    Llm.stub(:transcribe, ->(bytes, filename:, language:, **) { assert_equal "interview.m4a", filename; assert_equal "en", language; whisper }) do
      stub_llm(json: ->(prompt, **) { assert_includes prompt, "[00:04] I split the batch job."; MINUTES }) do
        perform_enqueued_jobs do
          post "/api/v1/meetings/#{m.id}/recording", params: { file: fixture_file_upload(audio_file, "audio/mp4") }, headers: auth_headers(@riya)
        end
      end
    end
    assert_response :ok
    m.reload
    assert_equal [ "upload", "done" ], [ m.transcript_source, m.minutes_status ]
    assert_nil m.transcript.first["speaker"]

    get "/api/v1/meetings/#{m.id}", headers: auth_headers(@owner)
    assert_equal "Covered the payouts service and an on-call incident.", json.dig("minutes", "summary")
    assert_equal [ "System design", "Ownership" ], json["criteria"]
  end

  test "recordings must be audio and not too large" do
    m = meeting
    post "/api/v1/meetings/#{m.id}/recording", params: { file: fixture_file_upload(audio_file("notes.pdf"), "application/pdf") }, headers: auth_headers(@owner)
    assert_response :unsupported_media_type
  end

  test "long calls are summarised in parts before the minutes are written" do
    m = meeting(transcript: Array.new(30) { |i| { "speaker" => i.even? ? "Riya Shah" : "Sam Lee", "start" => i * 30.0, "text" => "x" * 900 } })
    prompts = []
    stub_llm(json: ->(prompt, name:, **) { prompts << name; name == "InterviewPart" ? { "notes" => "part notes" } : MINUTES }) do
      MeetingMinutes.call(m)
    end
    assert_equal %w[InterviewPart InterviewPart InterviewPart InterviewMinutes], prompts
    assert_equal "done", m.reload.minutes_status
  end

  test "an AI failure is recorded and can be retried" do
    m = meeting(transcript: [ { "speaker" => nil, "start" => 0, "text" => "Hello" } ])
    stub_llm(json: ->(*, **) { raise Llm::Error }) { MeetingMinutes.call(m) }
    assert_equal "failed", m.reload.minutes_status

    stub_llm(json: ->(*, **) { MINUTES }) do
      perform_enqueued_jobs { post "/api/v1/meetings/#{m.id}/minutes", headers: auth_headers(@owner) }
    end
    assert_equal "done", m.reload.minutes_status
  end

  test "cancelling calls the bot off; rescheduling books a new one" do
    m = meeting(notetaker: true, bot_id: "bot_1", notetaker_status: "scheduled")
    calls = []
    MeetingBot.stub(:request, ->(method, path, _body = nil) { calls << [ method, path ]; { "id" => "bot_2" } }) do
      perform_enqueued_jobs do
        patch "/api/v1/meetings/#{m.id}", params: { startsAt: 3.days.from_now.iso8601 }, headers: auth_headers(@owner), as: :json
      end
      assert_equal [ [ :delete, "/bot/bot_1/" ], [ :post, "/bot/" ] ], calls
      assert_equal "bot_2", m.reload.bot_id

      post "/api/v1/meetings/#{m.id}/cancel", headers: auth_headers(@owner)
    end
    assert_equal [ :delete, "/bot/bot_2/" ], calls.last
    assert_nil m.reload.bot_id
  end

  test "sending the notetaker now needs the service and a link" do
    m = meeting(starts_at: 2.minutes.ago)
    MeetingBot.stub(:request, ->(_method, _path, body = nil) { assert_nil body[:join_at], "joins straight away"; { "id" => "bot_9" } }) do
      post "/api/v1/meetings/#{m.id}/notetaker", headers: auth_headers(@owner)
    end
    assert_response :ok
    assert_equal "scheduled", json["notetakerStatus"]

    ENV.delete("RECALL_API_KEY")
    post "/api/v1/meetings/#{meeting.id}/notetaker", headers: auth_headers(@owner)
    assert_response :unprocessable_entity
  end

  test "other companies can't read the minutes" do
    m = meeting(minutes: MINUTES)
    other = create_user(email: "boss@globex.test")
    Organization.create!(name: "Globex").memberships.create!(user: other, role: "owner")
    get "/api/v1/meetings/#{m.id}", headers: auth_headers(other)
    assert_response :not_found
  end

  private

  def audio_file(name = "interview.m4a")
    path = Rails.root.join("tmp", name)
    File.binwrite(path, "fake audio bytes")
    path
  end
end
