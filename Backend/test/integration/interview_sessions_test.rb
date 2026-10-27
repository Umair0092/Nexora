require "test_helper"

class InterviewSessionsTest < ActionDispatch::IntegrationTest
  setup do
    @user = create_user
    @public_domain = Domain.create!(name: "Software Engineering", description: "Public")
  end

  # What a misbehaving AI service could return: out-of-range scores, too many
  # list items, oversized text, wrong types.
  def hostile_evaluation
    ai_evaluation(
      "overall_score" => 9999,
      "communication_score" => -5,
      "technical_score" => "7",
      "top_strengths" => Array.new(15) { |i| "Strength #{i}" },
      "summary" => "x" * 5000,
      "per_question" => [
        { "question" => "Tell me about yourself", "answer" => "I build things", "score" => 500,
          "strengths" => [ "Clear" ], "improvements" => [ "Detail" ], "feedback" => "Good",
          "star" => { "situation" => "yes", "task" => true, "action" => false, "result" => nil, "note" => "n" * 900 },
          "speech" => { "duration_seconds" => 99_999, "word_count" => 120, "words_per_minute" => 140, "filler_count" => 3,
                        "fillers" => { "um" => 3, "<b>" => "9" }, "long_pauses" => 1, "longest_pause_seconds" => 2.5 } },
        { "question" => "Why us?", "answer" => "Mission", "score" => 6, "strengths" => [], "improvements" => [], "feedback" => "Ok",
          "ideal_answer" => "Because of the mission and team." }
      ]
    )
  end

  def nonverbal
    {
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
  end

  def sync(params, cv: hostile_evaluation, quiz: hostile_evaluation, user: @user)
    calls = stub_ai(cv: cv, quiz: quiz) do
      post "/api/v1/sessions/sync_ai_session", params: params, headers: auth_headers(user), as: :json
    end
    calls
  end

  test "sync_ai_session requires auth" do
    post "/api/v1/sessions/sync_ai_session", params: { interviewType: "cv", cvSessionId: "cv-1" }, as: :json

    assert_response :unauthorized
    assert_equal 0, InterviewSession.count
  end

  test "sync_ai_session takes scores from the AI service, not the request, and sanitizes them" do
    calls = sync({ interviewType: "cv", cvSessionId: "cv-1", title: "  Senior Backend Engineer  ",
                   startedAt: 20.minutes.ago.iso8601, nonverbalReport: nonverbal,
                   evaluation: { overall_score: 10, per_question: [ { question: "forged", score: 10 } ] } })

    assert_response :ok
    assert_equal [ [ "cv-1", @user ] ], calls[:evaluate_interview]
    assert_empty calls[:evaluate_quiz]
    assert_equal [ [ "cv-1", @user ] ], calls[:delete_interview]

    session = InterviewSession.find(json["session_id"])
    report = Report.find(json["report_id"])
    assert_equal "Senior Backend Engineer", session.title
    assert_equal "cv", session.interview_type
    assert_equal 100.0, session.overall_score
    assert_equal 2, session.total_questions
    assert_operator session.started_at, :>, 21.minutes.ago
    assert_equal [ "Tell me about yourself", "Why us?" ], session.answers.map { |a| a.question.text }
    assert_equal [ 100.0, 60.0 ], session.answers.pluck(:score)

    first, second = session.answers.to_a
    assert_equal({ "situation" => true, "task" => true, "action" => false, "result" => false, "note" => "n" * 497 + "..." }, first.star)
    assert_equal 3600.0, first.speech_metrics["duration_seconds"]
    assert_equal({ "um" => 3, "<b>" => 9 }, first.speech_metrics["fillers"])
    assert_equal 3600, first.duration
    assert_nil second.star
    assert_nil second.speech_metrics
    assert_equal "Because of the mission and team.", second.ideal_answer

    assert_equal 100.0, report.overall_score
    assert_equal 0.0, report.verbal_score
    assert_equal 100.0, report.non_verbal_score
    assert_equal 10, report.overall_strengths.size
    nv = report.behavioral_summary["nonVerbalData"]
    assert_equal 1.0, nv["attention_distribution"]["partially_attentive"]
    assert_equal({ "Looking away" => 3 }, nv["disengagement_reasons"])
    evaluation = report.behavioral_summary["evaluation"]
    assert_equal 7.0, evaluation["technical_score"]
    assert_operator evaluation["summary"].length, :<=, 2000
  end

  test "a technical quiz only asks the quiz service" do
    calls = sync({ interviewType: "role", quizSessionId: "quiz-9", cvSessionId: "ignored" })

    assert_response :ok
    assert_empty calls[:evaluate_interview]
    assert_equal [ [ "quiz-9", @user ] ], calls[:evaluate_quiz]
    assert_equal "role", InterviewSession.last.interview_type
  end

  test "a full interview combines both halves" do
    cv = ai_evaluation("overall_score" => 8, "communication_score" => 6, "technical_score" => 4, "job_fit" => "Good fit",
                       "job_description" => "Kafka role")
    quiz = ai_evaluation("overall_score" => 4, "communication_score" => 6, "technical_score" => 8,
                         "per_question" => [ { "question" => "What is SQL?", "answer" => "A language", "score" => 4, "ideal_answer" => "Structured Query Language" } ])
    sync({ interviewType: "complete", cvSessionId: "cv-1", quizSessionId: "quiz-1" }, cv: cv, quiz: quiz)

    assert_response :ok
    session = InterviewSession.last
    assert_equal 60.0, session.overall_score
    assert_equal [ "Tell me about yourself", "What is SQL?" ], session.answers.map { |a| a.question.text }
    assert_equal "Kafka role", session.job_description
    evaluation = session.report.behavioral_summary["evaluation"]
    assert_equal [ 6.0, 6.0 ], [ evaluation["communication_score"], evaluation["technical_score"] ]
    assert_equal "Good fit", evaluation["job_fit"]
  end

  test "a full interview ended during the CV half saves just that half" do
    no_answers = AiServices::Error.new("No answers submitted yet.", :unprocessable_entity)
    sync({ interviewType: "complete", cvSessionId: "cv-1", quizSessionId: "quiz-1" }, cv: ai_evaluation, quiz: no_answers)

    assert_response :ok
    assert_equal 1, InterviewSession.last.answers.count
  end

  test "sync_ai_session needs an AI session id and at least one answer" do
    sync({ interviewType: "cv" })
    assert_response :unprocessable_entity
    assert_equal({ "error" => "There are no answers to save for this interview." }, json)

    sync({ interviewType: "cv", cvSessionId: "cv-1" }, cv: ai_evaluation("per_question" => []))
    assert_response :unprocessable_entity
    assert_equal 0, InterviewSession.count
  end

  test "an expired or unavailable AI session is reported clearly" do
    sync({ interviewType: "cv", cvSessionId: "cv-1" }, cv: AiServices::Error.new(AiServices::EXPIRED, :not_found))
    assert_response :not_found
    assert_equal AiServices::EXPIRED, json["error"]

    sync({ interviewType: "cv", cvSessionId: "cv-1" }, cv: AiServices::Error.new(AiServices::BUSY))
    assert_response :service_unavailable
    assert_equal 0, InterviewSession.count
  end

  test "sync_ai_session does not create public domains" do
    get "/api/v1/domains"
    before = json

    sync({ interviewType: "role", quizSessionId: "q" })
    assert_response :ok
    sync({ interviewType: "nonsense", cvSessionId: "c" })
    assert_response :ok

    get "/api/v1/domains"
    assert_equal before, json
    assert Domain.find_by(name: "Role-based Interview").internal?
    assert_equal "cv", InterviewSession.order(:id).last.interview_type
  end

  test "sync_ai_session clamps startedAt to the last 3 hours" do
    sync({ interviewType: "cv", cvSessionId: "c", startedAt: 2.days.ago.iso8601 })

    assert_response :ok
    assert_operator InterviewSession.last.started_at, :>=, 3.hours.ago - 1.minute
  end

  test "sync_ai_session failure returns generic error and rolls back" do
    Report.stub(:create!, ->(*) { raise ActiveRecord::RecordInvalid }) do
      sync({ interviewType: "cv", cvSessionId: "c" })
    end

    assert_response :unprocessable_entity
    assert_equal({ "error" => "Could not save interview results" }, json)
    assert_equal 0, InterviewSession.count
    assert_equal 0, Answer.count
  end

  test "index, show and report include the new answer fields" do
    session = sync_interview(@user, evaluation: hostile_evaluation, title: "Senior Backend Engineer", nonverbalReport: nonverbal)

    get "/api/v1/sessions", headers: auth_headers(@user)
    assert_response :ok
    assert_equal "Senior Backend Engineer", json.first["title"]
    assert_equal "cv", json.first["interviewType"]

    get "/api/v1/sessions/#{session.id}/report", headers: auth_headers(@user)
    assert_response :ok
    assert_equal "Senior Backend Engineer", json["session"]["title"]
    assert_equal 100.0, json["overallScore"]
    assert json["nonVerbalData"]["attentionDistribution"].key?("partiallyAttentive")
    assert_equal 2, json["answers"].size
    first = json["answers"].first
    assert_equal 140, first["speechMetrics"]["wordsPerMinute"]
    assert_equal true, first["star"]["situation"]
    assert_equal [], first["attempts"]
    assert_equal "Because of the mission and team.", json["answers"].last["idealAnswer"]
    assert_equal false, json["shared"]
    assert_nil json["shareUrl"]
  end

  test "report is scoped to the current user" do
    session = sync_interview(@user)
    other = create_user(email: "other@example.com")

    get "/api/v1/sessions/#{session.id}/report", headers: auth_headers(other)
    assert_response :not_found
  end

  test "stats averages completed sessions and reports streaks" do
    sync_interview(@user, evaluation: ai_evaluation("overall_score" => 10))
    sync_interview(@user, evaluation: ai_evaluation("overall_score" => 5))
    @user.update!(weekly_goal: 4)

    get "/api/v1/sessions/stats", params: { tz: "Asia/Karachi" }, headers: auth_headers(@user)
    assert_response :ok
    assert_equal 2, json["completedSessions"]
    assert_equal 75, json["averageScore"]
    assert_equal 1, json["currentStreak"]
    assert_equal true, json["practicedToday"]
    assert_equal 2, json["thisWeek"]
    assert_equal 4, json["weeklyGoal"]

    get "/api/v1/sessions/stats", params: { tz: "Not/AZone" }, headers: auth_headers(@user)
    assert_response :ok
  end

  test "progress lists the user's finished interviews oldest first" do
    older = sync_interview(@user, evaluation: ai_evaluation("overall_score" => 4, "communication_score" => 5, "technical_score" => 3))
    older.update!(completed_at: 3.days.ago)
    sync_interview(@user, evaluation: ai_evaluation("overall_score" => 8), nonverbalReport: nonverbal)
    sync_interview(create_user(email: "someone@example.com"))

    get "/api/v1/sessions/progress", headers: auth_headers(@user)
    assert_response :ok
    assert_equal 2, json.size
    assert_equal [ 40.0, 80.0 ], json.map { |p| p["overall"] }
    assert_equal({ "communication" => 50.0, "technical" => 30.0, "presence" => nil },
                 json.first.slice("communication", "technical", "presence"))
    assert_equal 100.0, json.last["presence"]
    assert_equal %w[communication date interviewType overall presence sessionId technical title], json.first.keys.sort
  end

  test "an all-zero camera summary from older reports counts as not analysed" do
    session = sync_interview(@user)
    session.report.update!(non_verbal_score: 0.0, behavioral_summary: session.report.behavioral_summary.merge(
      "nonVerbalData" => { "average_attention_score" => 0.0, "attention_distribution" => { "attentive" => 0.0, "partially_attentive" => 0.0, "disengaged" => 0.0 } }
    ))

    get "/api/v1/sessions/#{session.id}/report", headers: auth_headers(@user)
    assert_nil json["nonVerbalData"]
    get "/api/v1/sessions/progress", headers: auth_headers(@user)
    assert_nil json.first["presence"]
  end

  test "removed mock endpoints are gone" do
    post "/api/v1/sessions", params: { domainId: @public_domain.id }, headers: auth_headers(@user), as: :json
    assert_response :not_found
  end

  test "report answers keep the order they were asked in" do
    questions = (1..6).map { |n| { "question" => "Question #{n}", "answer" => "A#{n}", "score" => 5 } }
    session = sync_interview(@user, evaluation: ai_evaluation("per_question" => questions))

    get "/api/v1/sessions/#{session.id}/report", headers: auth_headers(@user)
    assert_equal (1..6).map { |n| "Question #{n}" }, json["answers"].map { |a| a["question"]["text"] }
  end
end
