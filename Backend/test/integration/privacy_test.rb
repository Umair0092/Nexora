require "test_helper"

class PrivacyTest < ActionDispatch::IntegrationTest
  include ActiveJob::TestHelper

  setup do
    @owner = create_user(email: "owner@acme.test", first_name: "Ada", last_name: "Park")
    @recruiter = create_user(email: "riya@acme.test", first_name: "Riya", last_name: "Shah")
    @org = Organization.create!(name: "Acme")
    @org.memberships.create!(user: @owner, role: "owner")
    @org.memberships.create!(user: @recruiter, role: "recruiter")
    @job = @org.jobs.create!(title: "Backend Engineer", questions: %w[Q1 Q2 Q3], criteria: %w[Design Ownership])
  end

  def old_candidate(name, months_ago:, **attrs)
    at = months_ago.months.ago
    c = @job.candidates.create!(name: name, email: "#{name.parameterize}@example.com", status: "completed", completed_at: at,
                                ai_score: 77, resume_data: { "skills" => [ "Ruby" ] }, ai_evaluation: { "summary" => "Strong" }, **attrs)
    c.answers.create!(position: 0, question: "Q1", transcript: "My private answer")
    c.notes.create!(user: @owner, body: "Lives near the office")
    c.scorecards.create!(user: @owner, ratings: { "Design" => 4 })
    @org.log!("email_sent", user: @owner, candidate: c, subject: "Hi #{name}")
    @org.log!("stage_changed", user: @owner, candidate: c, from: nil, to: "rejected")
    c.update_columns(created_at: at, updated_at: at)
    c
  end

  test "only the owner sets the retention period, to a supported value" do
    patch "/api/v1/organization", params: { retentionMonths: 12 }, headers: auth_headers(@recruiter), as: :json
    assert_response :forbidden

    patch "/api/v1/organization", params: { retentionMonths: 7 }, headers: auth_headers(@owner), as: :json
    assert_response :unprocessable_entity

    patch "/api/v1/organization", params: { retentionMonths: 12 }, headers: auth_headers(@owner), as: :json
    assert_response :ok
    assert_equal 12, json["retentionMonths"]
    patch "/api/v1/organization", params: { retentionMonths: nil }, headers: auth_headers(@owner), as: :json
    assert_nil json["retentionMonths"]
  end

  test "retention anonymises old candidates but keeps the numbers" do
    @org.update!(retention_months: 12)
    old = old_candidate("Sam Lee", months_ago: 14)
    recent = old_candidate("Kim Ng", months_ago: 3)
    booked = old_candidate("Pat Doe", months_ago: 14)
    @org.meetings.create!(candidate: booked, created_by: @owner, title: "Interview", starts_at: 2.days.from_now, meeting_url: "https://meet.google.com/a-b-c")
    booked.update_columns(updated_at: 14.months.ago)
    token = old.access_token

    ApplyRetentionJob.perform_now

    old.reload
    assert_equal [ "Deleted candidate", "deleted-#{old.id}@deleted.invalid" ], [ old.name, old.email ]
    assert old.anonymized_at
    assert_empty old.answers
    assert_empty old.notes
    assert_empty old.scorecards
    assert_nil old.resume_data
    assert_nil old.ai_evaluation
    assert_equal 77.0, old.ai_score, "scores stay for analytics"
    assert_equal [ {} ], old.hiring_events.where(action: "email_sent").pluck(:details)
    assert_equal "rejected", old.hiring_events.find_by(action: "stage_changed").details["to"]
    assert_not_equal token, old.access_token
    get "/api/v1/apply/#{token}"
    assert_response :not_found

    assert_equal "Kim Ng", recent.reload.name
    assert_equal "Pat Doe", booked.reload.name, "an upcoming interview keeps the details"
    assert_equal 1, @org.hiring_events.find_by(action: "retention_applied").details["anonymized"]
  end

  test "without a retention period nothing is removed" do
    c = old_candidate("Sam Lee", months_ago: 40)
    ApplyRetentionJob.perform_now
    assert_equal "Sam Lee", c.reload.name
  end

  test "the audit log pages, filters and exports" do
    c = old_candidate("Sam Lee", months_ago: 1)
    @org.log!("candidate_viewed", user: @recruiter, candidate: c)

    get "/api/v1/hiring/activity", headers: auth_headers(@recruiter)
    assert_response :ok
    assert_equal %w[candidate_viewed stage_changed email_sent], json["events"].map { |e| e["action"] }
    assert_equal "Riya Shah", json["events"].first["by"]
    assert_includes json["actions"], "email_sent"

    get "/api/v1/hiring/activity", params: { userId: @recruiter.id }, headers: auth_headers(@owner)
    assert_equal 1, json["total"]
    get "/api/v1/hiring/activity", params: { action_name: "stage_changed" }, headers: auth_headers(@owner)
    assert_equal 1, json["total"]
    get "/api/v1/hiring/activity", params: { q: "sam" }, headers: auth_headers(@owner)
    assert_equal 3, json["total"]

    get "/api/v1/hiring/activity.csv", headers: auth_headers(@owner)
    assert_response :ok
    rows = CSV.parse(response.body)
    assert_equal [ "When", "Who", "Action", "Candidate", "Job", "Details" ], rows.first
    assert_equal %w[audit_log_exported candidate_viewed], rows[1..2].map { |r| r[2] }, "newest first, including this export"
    assert_equal "audit_log_exported", @org.hiring_events.order(:id).last.action
  end

  test "another company's log stays private" do
    other = create_user(email: "boss@globex.test")
    Organization.create!(name: "Globex").memberships.create!(user: other, role: "owner")
    old_candidate("Sam Lee", months_ago: 1)
    get "/api/v1/hiring/activity", headers: auth_headers(other)
    assert_equal 0, json["total"]
  end
end
