require "test_helper"

class HiringAnalyticsTest < ActionDispatch::IntegrationTest
  setup do
    @owner = create_user(email: "owner@acme.test")
    @org = Organization.create!(name: "Acme")
    @org.memberships.create!(user: @owner, role: "owner")
    @job = @org.jobs.create!(title: "Backend Engineer", questions: %w[Q1 Q2 Q3], criteria: %w[Design Ownership])
    @other_job = @org.jobs.create!(title: "Designer", questions: %w[Q1 Q2 Q3], criteria: %w[Craft Research])
  end

  def candidate(name, job: @job, invited: 10.days.ago, finished: nil, stage: nil, moves: [], ai: nil, status: nil)
    c = job.candidates.create!(name: name, email: "#{name.parameterize}@example.com", created_at: invited, stage: stage, ai_score: ai,
                               status: status || (finished ? "completed" : "invited"), consented_at: finished && finished - 20.minutes,
                               completed_at: finished)
    moves.each { |to, at| @org.log!("stage_changed", user: @owner, candidate: c, to: to).update!(created_at: at) }
    c
  end

  def analytics(**params)
    get "/api/v1/hiring/analytics", params: params, headers: auth_headers(@owner)
    assert_response :ok
    json
  end

  test "the funnel counts every stage a candidate passed, even if they were rejected later" do
    candidate("Hired", invited: 20.days.ago, finished: 18.days.ago, stage: "hired", ai: 88,
                       moves: [ [ "shortlisted", 15.days.ago ], [ "interviewing", 12.days.ago ], [ "offer", 8.days.ago ], [ "hired", 5.days.ago ] ])
    candidate("Late reject", finished: 8.days.ago, stage: "rejected", ai: 61,
                             moves: [ [ "shortlisted", 6.days.ago ], [ "interviewing", 4.days.ago ], [ "rejected", 2.days.ago ] ])
    candidate("Waiting", finished: 3.days.ago, ai: 72)
    candidate("Invited")

    data = analytics
    assert_equal [ 4, 3, 3, 2, 2, 1, 1 ], data["funnel"].map { |s| s["count"] }
    assert_equal [ nil, 75, 100, 67, 100, 50, 100 ], data["funnel"].map { |s| s["ofPrevious"] }
    assert_equal 75, data["rates"]["completion"]
    assert_equal 1, data["rates"]["hired"]
    assert_equal 15.0, data["timing"]["inviteToHire"]
    assert_equal 12.0, data["timing"]["inviteToOffer"]
    assert_equal 2.5, data["timing"]["finishToFirstDecision"], "median of 3 and 2 days"
    assert_equal 72, data["scores"]["medianAi"]
    assert_equal [ 0, 0, 0, 0, 0, 0, 1, 1, 1, 0 ], data["scores"]["bins"].map { |b| b["count"] }
  end

  test "filters by period and job" do
    candidate("Recent", finished: 2.days.ago)
    candidate("Old", invited: 200.days.ago, finished: 199.days.ago)
    candidate("Elsewhere", job: @other_job)

    assert_equal 2, analytics(days: 30)["funnel"].first["count"]
    assert_equal 3, analytics(days: "all")["funnel"].first["count"]
    assert_equal 1, analytics(days: 30, jobId: @job.id)["funnel"].first["count"]
    assert_equal [ "Backend Engineer", "Designer" ], analytics(days: 30)["jobs"].map { |j| j["title"] }
  end

  test "weekly activity covers the period and counts invites and finishes in their own weeks" do
    candidate("A", invited: 9.days.ago, finished: 2.days.ago)
    weeks = analytics(days: 30)["weekly"]
    assert_equal 5, weeks.size
    assert_equal 1, weeks.sum { |w| w["invited"] }
    assert_equal 1, weeks.sum { |w| w["completed"] }
  end

  test "another company's job is a 404 and its candidates never count" do
    globex = Organization.create!(name: "Globex")
    their_job = globex.jobs.create!(title: "Spy", questions: %w[Q1 Q2 Q3], criteria: %w[A B])
    their_job.candidates.create!(name: "Theirs", email: "t@example.com")

    get "/api/v1/hiring/analytics", params: { jobId: their_job.id }, headers: auth_headers(@owner)
    assert_response :not_found
    assert_equal 0, analytics["funnel"].first["count"]
  end
end
