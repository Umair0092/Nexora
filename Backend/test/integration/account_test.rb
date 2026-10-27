require "test_helper"

class AccountTest < ActionDispatch::IntegrationTest
  setup do
    @user = create_user(email: "ada@example.com")
  end

  def link_token(mail)
    CGI.unescape(mail.text_part.decoded[/token=([^\s]+)/, 1])
  end

  # ── Password reset ──────────────────────────────────────────────────────────

  test "forgot password emails a reset link without revealing which emails exist" do
    post "/api/v1/password/forgot", params: { email: " ADA@example.com " }, as: :json
    assert_response :ok
    known = json["message"]
    assert_equal 1, ActionMailer::Base.deliveries.size
    mail = ActionMailer::Base.deliveries.last
    assert_equal [ "ada@example.com" ], mail.to
    assert_match %r{/reset-password\?token=}, mail.text_part.decoded
    assert_match "expires in 30 minutes", mail.html_part.decoded

    post "/api/v1/password/forgot", params: { email: "nobody@example.com" }, as: :json
    assert_response :ok
    assert_equal known, json["message"]
    assert_equal 1, ActionMailer::Base.deliveries.size
  end

  test "reset changes the password once, signs in and confirms the email" do
    post "/api/v1/password/forgot", params: { email: "ada@example.com" }, as: :json
    token = link_token(ActionMailer::Base.deliveries.last)

    post "/api/v1/password/reset", params: { token: token, password: "short" }, as: :json
    assert_response :unprocessable_entity
    assert json["errors"].any? { |e| e.include?("Password") }

    post "/api/v1/password/reset", params: { token: token, password: "brand-new-pass" }, as: :json
    assert_response :ok
    assert json["token"].present?
    assert_equal true, json["user"]["emailVerified"]
    assert @user.reload.authenticate("brand-new-pass")

    post "/api/v1/password/reset", params: { token: token, password: "another-pass-1" }, as: :json
    assert_response :unprocessable_entity
    assert_match "expired or was already used", json["error"]
  end

  test "reset rejects tampered and expired tokens" do
    post "/api/v1/password/reset", params: { token: "garbage", password: "brand-new-pass" }, as: :json
    assert_response :unprocessable_entity

    token = @user.generate_token_for(:password_reset)
    travel 31.minutes do
      post "/api/v1/password/reset", params: { token: token, password: "brand-new-pass" }, as: :json
      assert_response :unprocessable_entity
    end
    assert @user.reload.authenticate("password123")
  end

  test "forgot password is rate limited" do
    5.times { post "/api/v1/password/forgot", params: { email: "x@example.com" }, as: :json }
    post "/api/v1/password/forgot", params: { email: "x@example.com" }, as: :json
    assert_response :too_many_requests
  end

  # ── Email verification ──────────────────────────────────────────────────────

  test "sign-up sends a confirmation link that verifies the email once" do
    post "/api/v1/register", params: { email: "new@example.com", password: "password123", first_name: "New", last_name: "Person" }, as: :json
    assert_response :created
    assert_equal false, json["user"]["emailVerified"]
    mail = ActionMailer::Base.deliveries.last
    assert_equal [ "new@example.com" ], mail.to
    assert_match "Hi New", mail.text_part.decoded

    token = link_token(mail)
    post "/api/v1/email/verify", params: { token: token }, as: :json
    assert_response :ok
    assert_equal true, json["user"]["emailVerified"]
    assert User.find_by(email: "new@example.com").email_verified?

    post "/api/v1/email/verify", params: { token: token }, as: :json
    assert_response :unprocessable_entity
  end

  test "sign-up still succeeds when the confirmation email can't be sent" do
    UserMailer.stub(:email_verification, ->(*) { raise Net::SMTPFatalError.new("boom") }) do
      post "/api/v1/register", params: { email: "x2@example.com", password: "password123" }, as: :json
    end
    assert_response :created
  end

  test "resend needs auth, sends a new link, and is limited" do
    post "/api/v1/email/resend", as: :json
    assert_response :unauthorized

    post "/api/v1/email/resend", headers: auth_headers(@user), as: :json
    assert_response :ok
    assert_equal 1, ActionMailer::Base.deliveries.size

    2.times { post "/api/v1/email/resend", headers: auth_headers(@user), as: :json }
    post "/api/v1/email/resend", headers: auth_headers(@user), as: :json
    assert_response :too_many_requests

    @user.verify_email!
    Api::V1::AuthController::RATE_LIMIT_STORE.clear
    post "/api/v1/email/resend", headers: auth_headers(@user), as: :json
    assert_equal "Your email is already confirmed.", json["message"]
  end

  # ── Reminder settings and unsubscribe ───────────────────────────────────────

  test "reminder settings are saved and validated" do
    put "/api/v1/profile", params: { user: { remindersEnabled: true, weeklyGoal: 5 } }, headers: auth_headers(@user), as: :json
    assert_response :ok
    assert_equal [ true, 5 ], [ json["remindersEnabled"], json["weeklyGoal"] ]

    put "/api/v1/profile", params: { user: { weeklyGoal: 99 } }, headers: auth_headers(@user), as: :json
    assert_response :unprocessable_entity
    assert_equal 5, @user.reload.weekly_goal
  end

  test "unsubscribe link turns reminders off without signing in" do
    @user.update!(reminders_enabled: true)
    post "/api/v1/reminders/unsubscribe", params: { token: @user.generate_token_for(:unsubscribe) }, as: :json
    assert_response :ok
    assert_not @user.reload.reminders_enabled

    post "/api/v1/reminders/unsubscribe", params: { token: "nope" }, as: :json
    assert_response :unprocessable_entity
  end

  # ── Export and deletion ─────────────────────────────────────────────────────

  test "export downloads everything as JSON" do
    session = sync_interview(@user, evaluation: ai_evaluation, title: "Backend Engineer")
    session.answers.first.attempts.create!(transcript: "Second go", score: 80)

    get "/api/v1/profile/export", headers: auth_headers(@user)
    assert_response :ok
    assert_match "attachment", response.headers["Content-Disposition"]
    data = JSON.parse(response.body)
    assert_equal "ada@example.com", data["profile"]["email"]
    assert_equal "Backend Engineer", data["interviews"].first["title"]
    assert_equal "I build things", data["interviews"].first["answers"].first["transcript"]
    assert_equal "Second go", data["interviews"].first["answers"].first["attempts"].first["transcript"]
    assert_equal 70.0, data["interviews"].first["report"]["overallScore"]
  end

  test "delete needs the password and removes every row the user owned" do
    session = sync_interview(@user)
    session.answers.first.attempts.create!(transcript: "Again", score: 50)
    session.report.share!
    other = create_user(email: "other@example.com")
    sync_interview(other)
    question_ids = session.answers.pluck(:question_id)

    delete "/api/v1/profile", params: { password: "wrong-password" }, headers: auth_headers(@user), as: :json
    assert_response :unprocessable_entity
    assert User.exists?(@user.id)

    delete "/api/v1/profile", params: { password: "password123" }, headers: auth_headers(@user), as: :json
    assert_response :no_content
    assert_not User.exists?(@user.id)
    assert_equal 0, InterviewSession.where(user_id: @user.id).count
    assert_equal 0, Report.where(user_id: @user.id).count
    assert_equal 0, Answer.where(session_id: session.id).count
    assert_equal 0, AnswerAttempt.count
    assert_equal 0, Question.where(id: question_ids).count
    assert_equal 1, InterviewSession.where(user_id: other.id).count

    get "/api/v1/me", headers: auth_headers(@user)
    assert_response :unauthorized
  end

  test "delete also removes the user's in-progress interviews" do
    live_interview(@user)
    other = create_user(email: "keeper@example.com")
    kept = live_interview(other)

    delete "/api/v1/profile", params: { password: "password123" }, headers: auth_headers(@user), as: :json
    assert_response :no_content
    assert_equal [ kept.id ], LiveInterview.pluck(:id)
  end
end
