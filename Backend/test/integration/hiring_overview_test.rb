require "test_helper"

class HiringOverviewTest < ActionDispatch::IntegrationTest
  setup do
    @owner = create_user(email: "owner@acme.test")
    @org = Organization.create!(name: "Acme")
    @org.memberships.create!(user: @owner, role: "owner")
    @job = @org.jobs.create!(title: "Backend Engineer", questions: %w[Q1 Q2 Q3], criteria: %w[Design Ownership])
  end

  def candidate(name, status: "completed", stage: nil, completed: 2.days.ago)
    @job.candidates.create!(name: name, email: "#{name.downcase}@example.com", status: status, stage: stage,
                            completed_at: status == "completed" ? completed : nil)
  end

  test "counts the pipeline and lists finished interviews nobody has moved on, oldest first" do
    newer = candidate("Newer", completed: 1.day.ago)
    older = candidate("Older", completed: 3.days.ago)
    candidate("Invited", status: "invited")
    candidate("Talking", stage: "interviewing")
    candidate("Offered", stage: "offer")
    candidate("Gone", status: "withdrawn")
    @org.log!("stage_changed", user: @owner, candidate: newer, from: "offer", to: "hired")
    @org.log!("candidate_viewed", user: @owner, candidate: newer)

    get "/api/v1/hiring/overview", headers: auth_headers(@owner)
    assert_response :ok
    assert_equal({ "openJobs" => 1, "toReview" => 2, "interviewing" => 1, "offers" => 1, "hiredRecently" => 1 }, json["stats"])
    assert_equal [ older.id, newer.id ], json["needsReview"].map { |c| c["id"] }
    assert_equal({ "review" => 2, "invited" => 1, "interviewing" => 1, "offer" => 1, "withdrawn" => 1 }, json["columns"][@job.id.to_s])
    assert_equal [ "stage_changed" ], json["activity"].map { |e| e["action"] }, "views are left out of the feed"
  end

  test "only shows the member's own company" do
    other = create_user(email: "other@globex.test")
    globex = Organization.create!(name: "Globex")
    globex.memberships.create!(user: other, role: "owner")
    candidate("Secret")

    get "/api/v1/hiring/overview", headers: auth_headers(other)
    assert_response :ok
    assert_equal 0, json["stats"]["toReview"]
    assert_empty json["needsReview"]

    get "/api/v1/hiring/overview", headers: auth_headers(create_user(email: "nobody@example.com"))
    assert_response :not_found
  end
end
