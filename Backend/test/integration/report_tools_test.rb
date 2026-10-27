require "test_helper"

class ReportToolsTest < ActionDispatch::IntegrationTest
  setup do
    @user = create_user
    @session = sync_interview(@user, evaluation: ai_evaluation(
      "per_question" => [
        { "question" => "What is an index?", "answer" => "It makes reads fast", "score" => 4, "ideal_answer" => "A B-tree that..." }
      ]
    ), title: "Backend Engineer", language: "fr")
    @answer = @session.answers.first
    @other = create_user(email: "other@example.com")
  end

  def attempts_path(answer = @answer, session = @session)
    "/api/v1/sessions/#{session.id}/answers/#{answer.id}/attempts"
  end

  # ── Retry an answer ─────────────────────────────────────────────────────────

  test "a retry is scored by the AI service with the question's context" do
    score = { "score" => 8, "strengths" => [ "Accurate" ], "improvements" => [ "Example" ], "feedback" => "Better.",
              "recommendation" => "Add an example.", "star" => nil }
    speech = { duration_seconds: 20, word_count: 50, words_per_minute: 150, filler_count: 1, fillers: { um: 1 }, long_pauses: 0, longest_pause_seconds: 1 }
    calls = stub_coach(score: score) do
      post attempts_path, params: { transcript: " An index is a B-tree ", score: 100, speech: speech }, headers: auth_headers(@user), as: :json
    end

    assert_response :created
    assert_equal 80.0, json["score"]
    assert_equal "An index is a B-tree", json["transcript"]
    assert_equal 150, json["speechMetrics"]["wordsPerMinute"]
    payload = calls[:score].first
    assert_equal({ question: "What is an index?", answer: "An index is a B-tree", target_role: "Backend Engineer",
                   interview_style: "standard", ideal_answer: "A B-tree that...", job_description: nil, language: "en" }, payload)

    get "/api/v1/sessions/#{@session.id}/report", headers: auth_headers(@user)
    assert_equal [ 80.0 ], json["answers"].first["attempts"].map { |a| a["score"] }
  end

  test "behavioral retries ask for STAR scoring" do
    @session.update!(interview_type: "behavioral")
    calls = stub_coach(score: { "score" => 6, "star" => { "situation" => true, "task" => false, "action" => true, "result" => false, "note" => "n" } }) do
      post attempts_path, params: { transcript: "Once I..." }, headers: auth_headers(@user), as: :json
    end
    assert_response :created
    assert_equal "behavioral", calls[:score].first[:interview_style]
    assert_equal false, json["star"]["task"]
  end

  test "retries are owner-only and need a transcript" do
    stub_coach(score: { "score" => 5 }) do
      post attempts_path, params: { transcript: "x" }, headers: auth_headers(@other), as: :json
      assert_response :not_found

      post attempts_path, params: { transcript: "   " }, headers: auth_headers(@user), as: :json
      assert_response :unprocessable_entity

      post attempts_path, params: { transcript: "x" * 10_001 }, headers: auth_headers(@user), as: :json
      assert_response :unprocessable_entity
    end
    assert_equal 0, AnswerAttempt.count
  end

  test "an AI failure during a retry is a readable 503" do
    stub_coach(score: Llm::Error.new) do
      post attempts_path, params: { transcript: "x" }, headers: auth_headers(@user), as: :json
    end
    assert_response :service_unavailable
    assert_equal Llm::BUSY, json["error"]
    assert_equal 0, AnswerAttempt.count
  end

  # ── Stronger version ────────────────────────────────────────────────────────

  test "the rewrite is generated once and then served from the cache" do
    improve = { "improved_answer" => "An index is a B-tree [example].", "changes" => [ "Led with the definition" ] }
    calls = stub_coach(improve: improve) do
      2.times do
        post "/api/v1/sessions/#{@session.id}/answers/#{@answer.id}/improve", headers: auth_headers(@user), as: :json
        assert_response :ok
      end
    end
    assert_equal 1, calls[:improve].size
    assert_equal "It makes reads fast", calls[:improve].first[:answer]
    assert_equal({ "improvedAnswer" => "An index is a B-tree [example].", "improvementNotes" => [ "Led with the definition" ] }, json)
  end

  test "rewrites are owner-only and report AI failures" do
    stub_coach(improve: Llm::Error.new) do
      post "/api/v1/sessions/#{@session.id}/answers/#{@answer.id}/improve", headers: auth_headers(@other), as: :json
      assert_response :not_found
      post "/api/v1/sessions/#{@session.id}/answers/#{@answer.id}/improve", headers: auth_headers(@user), as: :json
      assert_response :service_unavailable
    end
    assert_nil @answer.reload.improved_answer
  end

  # ── Share links ─────────────────────────────────────────────────────────────

  test "owner can share, anyone can read the link, and revoking breaks it" do
    @session.update!(job_description: "Secret JD")
    post "/api/v1/sessions/#{@session.id}/share", headers: auth_headers(@user), as: :json
    assert_response :ok
    url = json["shareUrl"]
    token = url.split("/shared/").last
    assert_operator token.length, :>=, 30

    post "/api/v1/sessions/#{@session.id}/share", headers: auth_headers(@user), as: :json
    assert_equal url, json["shareUrl"], "sharing twice keeps the same link"

    get "/api/v1/shared/#{token}"
    assert_response :ok
    assert_equal "noindex, nofollow", response.headers["X-Robots-Tag"]
    assert_equal "Backend Engineer", json["session"]["title"]
    assert_equal 1, json["answers"].size
    body = response.body
    assert_not_includes body, @user.email
    assert_not_includes body, token
    assert_not_includes body, "Secret JD"
    assert_nil json["id"]
    assert_nil json["userId"]
    assert_nil json["shareUrl"]

    delete "/api/v1/sessions/#{@session.id}/share", headers: auth_headers(@user), as: :json
    assert_response :ok
    get "/api/v1/shared/#{token}"
    assert_response :not_found
  end

  test "only the owner can share or revoke" do
    post "/api/v1/sessions/#{@session.id}/share", headers: auth_headers(@other), as: :json
    assert_response :not_found
    post "/api/v1/sessions/#{@session.id}/share", as: :json
    assert_response :unauthorized
    get "/api/v1/shared/short"
    assert_response :not_found
  end
end
