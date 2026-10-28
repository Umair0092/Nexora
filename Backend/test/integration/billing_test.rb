require "test_helper"

class BillingTest < ActionDispatch::IntegrationTest
  setup do
    @owner = create_user(email: "owner@acme.test")
    @recruiter = create_user(email: "riya@acme.test")
    @org = Organization.create!(name: "Acme")
    @org.memberships.create!(user: @owner, role: "owner")
    @org.memberships.create!(user: @recruiter, role: "recruiter")
    @job = @org.jobs.create!(title: "Backend Engineer", questions: %w[Q1 Q2 Q3], criteria: %w[Design Ownership])
  end

  def with_billing(&)
    ENV["STRIPE_SECRET_KEY"], ENV["STRIPE_PRICE_TEAM"], ENV["STRIPE_WEBHOOK_SECRET"] = "sk_test_x", "price_team", "whsec_test"
    yield
  ensure
    %w[STRIPE_SECRET_KEY STRIPE_PRICE_TEAM STRIPE_WEBHOOK_SECRET].each { |k| ENV.delete(k) }
  end

  def new_job
    post "/api/v1/jobs", params: { title: "Designer", questions: %w[Q1 Q2 Q3], criteria: %w[A B], answerSeconds: 120 }, headers: auth_headers(@owner), as: :json
  end

  def stripe_post(event, secret: "whsec_test", at: Time.current.to_i)
    body = event.to_json
    signature = OpenSSL::HMAC.hexdigest("SHA256", secret, "#{at}.#{body}")
    post "/api/v1/billing/webhook", params: body, headers: { "Content-Type" => "application/json", "Stripe-Signature" => "t=#{at},v1=#{signature}" }
  end

  test "without billing switched on there are no limits" do
    new_job
    assert_response :created
    get "/api/v1/billing", headers: auth_headers(@recruiter)
    assert_equal false, json["enabled"]
    assert_nil json["limits"]["openJobs"]
  end

  test "the free plan allows one open job and 25 invitations a month" do
    with_billing do
      new_job
      assert_response :payment_required
      assert json["upgrade"]

      24.times { |i| @job.candidates.create!(name: "C#{i}", email: "c#{i}@example.com") }
      post "/api/v1/jobs/#{@job.id}/candidates", params: { name: "Last", email: "last@example.com" }, headers: auth_headers(@owner), as: :json
      assert_response :created
      post "/api/v1/jobs/#{@job.id}/candidates", params: { name: "Over", email: "over@example.com" }, headers: auth_headers(@owner), as: :json
      assert_response :payment_required

      @job.update!(status: "closed")
      new_job
      assert_response :created
      patch "/api/v1/jobs/#{@job.id}", params: { status: "open" }, headers: auth_headers(@owner), as: :json
      assert_response :payment_required, "reopening counts too"

      get "/api/v1/billing", headers: auth_headers(@owner)
      assert_equal({ "openJobs" => 1, "candidatesThisMonth" => 25 }, json["usage"])
    end
  end

  test "webhooks and the notetaker come with Team" do
    with_billing do
      post "/api/v1/webhooks", params: { url: "https://hooks.example.com/x", events: %w[candidate.invited] }, headers: auth_headers(@owner), as: :json
      assert_response :payment_required
      assert_match "Team plan", json["error"]

      @org.update!(plan: "team")
      SafeUrl.stub(:addresses, ->(_) { [ "93.184.216.34" ] }) do
        post "/api/v1/webhooks", params: { url: "https://hooks.example.com/x", events: %w[candidate.invited] }, headers: auth_headers(@owner), as: :json
      end
      assert_response :created
    end
  end

  test "the owner starts Checkout; recruiters can't" do
    with_billing do
      sent = nil
      StripeBilling.stub(:request, ->(method, path, params = {}) { sent = [ method, path, params ]; { "url" => "https://checkout.stripe.com/c/pay/cs_test" } }) do
        post "/api/v1/billing/checkout", headers: auth_headers(@recruiter)
        assert_response :forbidden

        post "/api/v1/billing/checkout", headers: auth_headers(@owner)
      end
      assert_equal "https://checkout.stripe.com/c/pay/cs_test", json["url"]
      assert_equal [ :post, "/checkout/sessions" ], sent.first(2)
      assert_equal "subscription", sent[2]["mode"]
      assert_equal "price_team", sent[2]["line_items[0][price]"]
      assert_equal @org.id, sent[2]["client_reference_id"]
      assert_equal "owner@acme.test", sent[2]["customer_email"]
    end
  end

  test "Stripe's events move the company between plans" do
    with_billing do
      stripe_post({ type: "checkout.session.completed", data: { object: { client_reference_id: @org.id.to_s, customer: "cus_1", subscription: "sub_1", metadata: {} } } })
      assert_response :ok
      assert_equal [ "team", "active", "cus_1" ], @org.reload.values_at(:plan, :plan_status, :stripe_customer_id)

      stripe_post({ type: "customer.subscription.updated", data: { object: { id: "sub_1", customer: "cus_1", status: "past_due", current_period_end: 30.days.from_now.to_i } } })
      assert_equal [ "team", "past_due" ], @org.reload.values_at(:plan, :plan_status), "keeps Team while Stripe retries the card"
      assert @org.current_period_end > 29.days.from_now

      stripe_post({ type: "customer.subscription.deleted", data: { object: { id: "sub_1", customer: "cus_1", status: "canceled" } } })
      assert_equal [ "free", "canceled", nil ], @org.reload.values_at(:plan, :plan_status, :stripe_subscription_id)
      assert_equal "plan_changed", @org.hiring_events.last.action
    end
  end

  test "webhook events need a valid, fresh signature" do
    with_billing do
      event = { type: "checkout.session.completed", data: { object: { client_reference_id: @org.id.to_s, customer: "cus_1", subscription: "sub_1" } } }
      stripe_post(event, secret: "whsec_wrong")
      assert_response :bad_request
      stripe_post(event, at: 10.minutes.ago.to_i)
      assert_response :bad_request
      assert_equal "free", @org.reload.plan
    end
  end

  test "the portal needs a Stripe customer" do
    with_billing do
      post "/api/v1/billing/portal", headers: auth_headers(@owner)
      assert_response :unprocessable_entity
      @org.update!(stripe_customer_id: "cus_1")
      StripeBilling.stub(:request, ->(*) { { "url" => "https://billing.stripe.com/p/session" } }) do
        post "/api/v1/billing/portal", headers: auth_headers(@owner)
      end
      assert_equal "https://billing.stripe.com/p/session", json["url"]
    end
  end
end
