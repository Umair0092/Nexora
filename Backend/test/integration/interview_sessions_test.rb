require "test_helper"
require "minitest/mock"

class InterviewSessionsTest < ActionDispatch::IntegrationTest
  setup do
    @user = create_user
    @public_domain = Domain.create!(name: "Software Engineering", description: "Public")
  end

  def payload(overrides = {})
    {
      interviewType: "role",
      title: "  Senior Backend Engineer  ",
      startedAt: 20.minutes.ago.iso8601,
      evaluation: {
        target_role: "Software Engineer",
        overall_score: 9999,
        communication_score: -5,
        technical_score: "7",
        hire_recommendation: "Yes",
        top_strengths: Array.new(15) { |i| "Strength #{i}" },
        areas_to_improve: [ "Depth" ],
        improvement_points: [ "Practice" ],
        summary: "x" * 5000,
        per_question: [
          { question: "Tell me about yourself", answer: "I build things", score: 500, strengths: [ "Clear" ], improvements: [ "Detail" ], feedback: "Good" },
          { question: "Why us?", answer: "Mission", score: 6, strengths: [], improvements: [], feedback: "Ok" }
        ]
      },
      nonverbalReport: {
        attentionSummary: {
          averageScore: 250,
          stateDistribution: {
            "ATTENTIVE" => { percentage: 80 },
            "PARTIALLY ATTENTIVE" => { percentage: 150 },
            "DISENGAGED" => { percentage: -3 }
          }
        },
        disengagementReasons: [ { reason: "Looking away", count: 3 } ],
        handActivitySummary: { calm: { percentage: 70 }, moderate: { percentage: 20 }, excessive: { percentage: 10 } }
      }
    }.merge(overrides)
  end

  test "sync_ai_session requires auth" do
    post "/api/v1/sessions/sync_ai_session", params: payload, as: :json

    assert_response :unauthorized
    assert_equal 0, InterviewSession.count
  end

  test "sync_ai_session clamps scores and sanitizes payload" do
    post "/api/v1/sessions/sync_ai_session", params: payload, headers: auth_headers(@user), as: :json

    assert_response :ok
    assert json["success"]
    session = InterviewSession.find(json["session_id"])
    report = Report.find(json["report_id"])

    assert_equal 100.0, session.overall_score
    assert_equal "Senior Backend Engineer", session.title
    assert_equal "role", session.interview_type
    assert_equal 2, session.total_questions
    assert_equal 2, session.completed_questions
    assert_operator session.started_at, :>, 21.minutes.ago
    assert_equal [ 100.0, 60.0 ], session.answers.order(:id).pluck(:score)

    assert_equal 100.0, report.overall_score
    assert_equal 0.0, report.verbal_score
    assert_equal 100.0, report.non_verbal_score
    assert_equal 10, report.overall_strengths.size

    nv = report.behavioral_summary["nonVerbalData"]
    assert_equal 1.0, nv["attention_distribution"]["partially_attentive"]
    assert_equal 0.0, nv["attention_distribution"]["disengaged"]
    assert_equal({ "Looking away" => 3 }, nv["disengagement_reasons"])

    evaluation = report.behavioral_summary["evaluation"]
    assert_equal 10.0, evaluation["overall_score"]
    assert_equal 7.0, evaluation["technical_score"]
    assert_operator evaluation["summary"].length, :<=, 2000
  end

  test "sync_ai_session does not create public domains" do
    get "/api/v1/domains"
    before = json

    post "/api/v1/sessions/sync_ai_session", params: payload, headers: auth_headers(@user), as: :json
    assert_response :ok
    post "/api/v1/sessions/sync_ai_session", params: payload(interviewType: "nonsense"), headers: auth_headers(@user), as: :json
    assert_response :ok

    get "/api/v1/domains"
    assert_equal before, json
    assert_nil Domain.find_by(name: "Software Engineer")
    assert Domain.find_by(name: "Role-based Interview").internal?
    assert_equal "cv", InterviewSession.order(:id).last.interview_type
  end

  test "sync_ai_session clamps startedAt to the last 3 hours" do
    post "/api/v1/sessions/sync_ai_session", params: payload(startedAt: 2.days.ago.iso8601), headers: auth_headers(@user), as: :json

    assert_response :ok
    assert_operator InterviewSession.last.started_at, :>=, 3.hours.ago - 1.minute
  end

  test "sync_ai_session rejects garbage or empty evaluations without saving" do
    post "/api/v1/sessions/sync_ai_session", params: { evaluation: "nope", nonverbalReport: [ 1, 2 ] }, headers: auth_headers(@user), as: :json
    assert_response :unprocessable_entity
    assert_equal({ "error" => "There are no answers to save for this interview." }, json)

    post "/api/v1/sessions/sync_ai_session", params: payload(evaluation: { overall_score: 10, per_question: [] }), headers: auth_headers(@user), as: :json
    assert_response :unprocessable_entity
    assert_equal 0, InterviewSession.count
  end

  test "sync_ai_session failure returns generic error and rolls back" do
    Report.stub(:create!, ->(*) { raise ActiveRecord::RecordInvalid }) do
      post "/api/v1/sessions/sync_ai_session", params: payload, headers: auth_headers(@user), as: :json
    end

    assert_response :unprocessable_entity
    assert_equal({ "error" => "Could not save interview results" }, json)
    assert_equal 0, InterviewSession.count
    assert_equal 0, Answer.count
  end

  test "index, show and report include title and interviewType" do
    post "/api/v1/sessions/sync_ai_session", params: payload, headers: auth_headers(@user), as: :json
    session_id = json["session_id"]

    get "/api/v1/sessions", headers: auth_headers(@user)
    assert_response :ok
    assert_equal "Senior Backend Engineer", json.first["title"]
    assert_equal "role", json.first["interviewType"]

    get "/api/v1/sessions/#{session_id}/report", headers: auth_headers(@user)
    assert_response :ok
    assert_equal "Senior Backend Engineer", json["session"]["title"]
    assert_equal "role", json["session"]["interviewType"]
    assert_equal 100.0, json["overallScore"]
    assert json["nonVerbalData"]["attentionDistribution"].key?("partiallyAttentive")
    assert_equal 2, json["answers"].size
  end

  test "report is scoped to the current user" do
    post "/api/v1/sessions/sync_ai_session", params: payload, headers: auth_headers(@user), as: :json
    session_id = json["session_id"]
    other = create_user(email: "other@example.com")

    get "/api/v1/sessions/#{session_id}/report", headers: auth_headers(other)
    assert_response :not_found
  end

  test "stats averages completed sessions" do
    post "/api/v1/sessions/sync_ai_session", params: payload, headers: auth_headers(@user), as: :json
    eval2 = payload[:evaluation].merge(overall_score: 5)
    post "/api/v1/sessions/sync_ai_session", params: payload(evaluation: eval2), headers: auth_headers(@user), as: :json

    get "/api/v1/sessions/stats", headers: auth_headers(@user)
    assert_response :ok
    assert_equal({ "totalSessions" => 2, "completedSessions" => 2, "averageScore" => 75 }, json)
  end

  test "removed mock endpoints are gone" do
    post "/api/v1/sessions", params: { domainId: @public_domain.id }, headers: auth_headers(@user), as: :json
    assert_response :not_found
  end

  test "report answers keep the order they were asked in" do
    questions = (1..6).map { |n| { question: "Question #{n}", answer: "A#{n}", score: 5 } }
    post "/api/v1/sessions/sync_ai_session", params: payload(evaluation: { overall_score: 5, per_question: questions }), headers: auth_headers(@user), as: :json
    id = json["session_id"]

    get "/api/v1/sessions/#{id}/report", headers: auth_headers(@user)
    assert_equal (1..6).map { |n| "Question #{n}" }, json["answers"].map { |a| a["question"]["text"] }
  end
end
