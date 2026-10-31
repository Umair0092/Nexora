require "test_helper"
require "net/http"

class IntegrationsTest < ActionDispatch::IntegrationTest
  include ActiveJob::TestHelper

  # Stands in for Net::HTTP so we can see exactly what a webhook sends.
  class FakeHttp
    attr_accessor :ipaddr, :use_ssl, :open_timeout, :read_timeout
    attr_reader :sent

    def initialize(code)
      @code = code
    end

    def request(req)
      @sent = req
      Struct.new(:code).new(@code.to_s)
    end
  end

  setup do
    @owner = create_user(email: "owner@acme.test", first_name: "Ada", last_name: "Park")
    @recruiter = create_user(email: "riya@acme.test")
    @org = Organization.create!(name: "Acme")
    @org.memberships.create!(user: @owner, role: "owner")
    @org.memberships.create!(user: @recruiter, role: "recruiter")
    @job = @org.jobs.create!(title: "Backend Engineer", questions: %w[Q1 Q2 Q3], criteria: %w[Design Ownership])
    @candidate = @job.candidates.create!(name: "Sam Lee", email: "sam@example.com", status: "completed", completed_at: 1.day.ago, ai_score: 81)
    @candidate.answers.create!(position: 0, question: "Q1", transcript: "SECRET ANSWER TEXT")
  end

  def public_dns(&)
    SafeUrl.stub(:addresses, ->(host) { host == "hooks.example.com" ? [ "93.184.216.34" ] : [ "10.0.0.5" ] }, &)
  end

  def add_webhook(events: %w[candidate.stage_changed])
    public_dns { post "/api/v1/webhooks", params: { url: "https://hooks.example.com/nexora", events: events }, headers: auth_headers(@owner), as: :json }
    WebhookEndpoint.last
  end

  test "the owner adds a webhook and sees its secret once" do
    endpoint = add_webhook
    assert_response :created
    assert_match(/\Awhsec_/, json["secret"])

    get "/api/v1/webhooks", headers: auth_headers(@owner)
    assert_nil json["endpoints"].first["secret"]
    assert_equal "…#{endpoint.secret.last(4)}", json["endpoints"].first["secretHint"]
    assert_includes json["events"], "meeting.minutes_ready"

    get "/api/v1/webhooks", headers: auth_headers(@recruiter)
    assert_response :forbidden
  end

  test "private, local and plain-http addresses are refused" do
    public_dns do
      [ "https://127.0.0.1/x", "https://10.1.2.3/x", "https://[::1]/x", "https://169.254.169.254/latest", "https://internal.corp/x", "http://hooks.example.com/x" ].each do |url|
        post "/api/v1/webhooks", params: { url: url, events: %w[candidate.invited] }, headers: auth_headers(@owner), as: :json
        assert_response :unprocessable_entity, url
      end
    end
    assert_equal 0, WebhookEndpoint.count
  end

  test "a stage change posts a signed event without the candidate's answers" do
    endpoint = add_webhook
    http = FakeHttp.new(200)
    public_dns do
      Net::HTTP.stub(:new, ->(*) { http }) do
        perform_enqueued_jobs do
          post "/api/v1/candidates/#{@candidate.id}/stage", params: { stage: "shortlisted" }, headers: auth_headers(@recruiter), as: :json
        end
      end
    end
    assert_response :ok
    req = http.sent
    assert_equal "93.184.216.34", http.ipaddr, "connects to the address that was checked"
    assert_equal "candidate.stage_changed", req["Nexora-Event"]

    body = JSON.parse(req.body)
    assert_equal({ "from" => nil, "to" => "shortlisted" }, body.dig("data", "change"))
    assert_equal "sam@example.com", body.dig("data", "candidate", "email")
    assert_not_includes req.body, "SECRET ANSWER TEXT"

    stamp, signature = req["Nexora-Signature"].scan(/t=(\d+),v1=(\h+)/).first
    assert_equal OpenSSL::HMAC.hexdigest("SHA256", endpoint.secret, "#{stamp}.#{req.body}"), signature
    delivery = endpoint.deliveries.first
    assert [ delivery.succeeded?, delivery.attempts ] == [ true, 1 ]
  end

  test "events nobody subscribed to aren't sent, and failures are retried" do
    endpoint = add_webhook(events: %w[candidate.invited])
    post "/api/v1/candidates/#{@candidate.id}/stage", params: { stage: "shortlisted" }, headers: auth_headers(@owner), as: :json
    assert_equal 0, endpoint.deliveries.count

    post "/api/v1/webhooks/#{endpoint.id}/test", headers: auth_headers(@owner)
    assert_response :accepted
    delivery = endpoint.deliveries.first
    assert_equal "test.ping", delivery.event

    # The first attempt gets a 500; retry_on puts another attempt in the queue.
    http = FakeHttp.new(500)
    public_dns do
      Net::HTTP.stub(:new, ->(*) { http }) do
        clear_enqueued_jobs
        WebhookDeliveryJob.perform_now(delivery.id)
      end
    end
    assert_equal [ 500, 1 ], [ delivery.reload.status_code, delivery.attempts ]
    assert_enqueued_jobs 1, only: WebhookDeliveryJob
  end

  test "an address that later resolves privately isn't called" do
    endpoint = add_webhook(events: %w[candidate.invited])
    delivery = WebhookDispatcher.deliver(endpoint, "test.ping", WebhookDispatcher.sample(@org))
    SafeUrl.stub(:addresses, ->(_) { [ "127.0.0.1" ] }) do
      Net::HTTP.stub(:new, ->(*) { flunk "should not connect" }) do
        assert_raises(WebhookDeliveryJob::Failed) { WebhookDeliveryJob.new.perform(delivery.id) }
      end
    end
    assert_equal "The address isn't public.", delivery.reload.error
  end

  test "candidates export as CSV, with spreadsheet formulas defused" do
    @job.candidates.create!(name: "=HYPERLINK(evil) Person", email: "x@example.com")
    get "/api/v1/candidates/export", headers: auth_headers(@recruiter)
    assert_response :ok
    assert_equal "text/csv; charset=utf-8", response.media_type + "; charset=utf-8"
    rows = CSV.parse(response.body, headers: true)
    assert_equal Api::V1::CandidateExportsController::HEADERS, rows.headers
    sam = rows.find { |r| r["Email"] == "sam@example.com" }
    assert_equal [ "Sam", "Lee", "To review", "81" ], [ sam["First name"], sam["Last name"], sam["Stage"], sam["AI screening score"] ]
    assert rows.find { |r| r["Email"] == "x@example.com" }["First name"].start_with?("'=")
    assert_not_includes response.body, "SECRET ANSWER TEXT"
    assert_equal "candidates_exported", @org.hiring_events.last.action
  end

  test "another company's job can't be exported" do
    other = Organization.create!(name: "Globex").jobs.create!(title: "Spy", questions: %w[Q1 Q2 Q3], criteria: %w[A B])
    get "/api/v1/candidates/export", params: { jobId: other.id }, headers: auth_headers(@owner)
    assert_response :not_found
  end

  def id_token(claims)
    [ "x", Base64.urlsafe_encode64(claims.to_json, padding: false), "sig" ].join(".")
  end

  def with_google(&)
    ENV["GOOGLE_CLIENT_ID"], ENV["GOOGLE_CLIENT_SECRET"] = "client-123", "secret"
    yield
  ensure
    ENV.delete("GOOGLE_CLIENT_ID")
    ENV.delete("GOOGLE_CLIENT_SECRET")
  end

  test "signing in with Google creates a verified account and hands back a session" do
    with_google do
      get "/api/v1/auth/providers"
      assert json["google"]

      post "/api/v1/auth/google", params: { next: "/hiring", accountType: "employer" }, as: :json
      state = Rack::Utils.parse_query(URI(json["url"]).query)["state"]
      tokens = { "id_token" => id_token(email: "New.Person@Gmail.com", email_verified: true, aud: "client-123", given_name: "New", family_name: "Person") }
      GoogleCalendar.stub(:request, ->(*, **) { tokens }) do
        get "/api/v1/auth/google/callback", params: { state: state, code: "abc" }
      end
      assert_match %r{\A/auth/google#code=}, URI(response.location).path + "#" + URI(response.location).fragment.to_s
      fragment = Rack::Utils.parse_query(URI(response.location).fragment)
      assert_equal "/hiring", fragment["next"]

      post "/api/v1/auth/google/exchange", params: { code: fragment["code"] }, as: :json
      assert_response :ok
      user = User.find_by(email: "new.person@gmail.com")
      assert user.email_verified_at
      assert user.employer?, "a new account takes the type chosen on the sign-up page"
      assert_equal user.id, JsonWebToken.decode(json["token"])[:user_id]
    end
  end

  test "Google sign-in refuses unverified emails, other apps' tokens and other browsers" do
    with_google do
      post "/api/v1/auth/google", as: :json
      state = Rack::Utils.parse_query(URI(json["url"]).query)["state"]
      [ { email: "a@b.com", email_verified: false, aud: "client-123" }, { email: "a@b.com", email_verified: true, aud: "someone-else" } ].each do |claims|
        GoogleCalendar.stub(:request, ->(*, **) { { "id_token" => id_token(claims) } }) do
          post "/api/v1/auth/google", as: :json
          fresh = Rack::Utils.parse_query(URI(json["url"]).query)["state"]
          get "/api/v1/auth/google/callback", params: { state: fresh, code: "abc" }
        end
        assert_redirected_to "/auth?error=google"
      end

      cookies.delete(:nexora_google_nonce)
      get "/api/v1/auth/google/callback", params: { state: state, code: "abc" }
      assert_redirected_to "/auth?error=google"
      assert_nil User.find_by(email: "a@b.com")
    end

    post "/api/v1/auth/google/exchange", params: { code: "forged" }, as: :json
    assert_response :unauthorized
  end
end
