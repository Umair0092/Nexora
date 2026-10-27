require "test_helper"

class QuizzesTest < ActionDispatch::IntegrationTest
  setup do
    @user = create_user
  end

  def start(user: @user, **body)
    post "/api/v1/quizzes", params: { target_role: "SQL", num_questions: 3, difficulty: "medium", language: "en", **body },
                            headers: auth_headers(user), as: :json
  end

  def answer(id, text, **extra)
    post "/api/v1/quizzes/#{id}/answer", params: { answer: text, **extra }, headers: auth_headers(@user), as: :json
  end

  def transcript(id)
    get "/api/v1/quizzes/#{id}", headers: auth_headers(@user)
    json
  end

  test "categories and difficulties come from the question bank" do
    get "/api/v1/quizzes/categories", headers: auth_headers(@user)
    assert_response :ok
    assert_includes json["categories"], "SQL"
    assert_equal 5, json["categories"].size
    assert_equal %w[easy medium hard], json["difficulties"]
  end

  test "validates the category, size, difficulty and language" do
    start(target_role: "Astrology")
    assert_response :unprocessable_entity
    start(num_questions: 21)
    assert_response :unprocessable_entity
    start(difficulty: "brutal")
    assert_response :unprocessable_entity
    start(language: "de")
    assert_response :unprocessable_entity
    assert_equal 0, LiveInterview.count
  end

  test "each answer is stored against the question that was shown" do
    start(num_questions: 3)
    assert_response :created
    id = json["session_id"]
    assert_equal 3, json["num_questions"]
    shown = [ json["first_question"] ]

    answer(id, "first")
    shown << json["next_question"]
    answer(id, "second")
    shown << json["next_question"]
    answer(id, "third")
    assert_equal true, json["is_complete"]
    assert_nil json["next_question"]
    answer(id, "fourth")
    assert_response :gone

    data = transcript(id)
    assert_equal shown, data["transcript"].map { |t| t["question"] }
    assert_equal %w[first second third], data["transcript"].map { |t| t["answer"] }
    assert_equal 3, data["questions_answered"]
  end

  test "model answers stay hidden until the quiz is complete" do
    start(num_questions: 2)
    id = json["session_id"]
    answer(id, "first")
    assert_nil transcript(id)["transcript"].first["ideal_answer"]
    assert_not_nil transcript(id)["current_question"]

    answer(id, "second")
    data = transcript(id)
    assert data["transcript"].all? { |t| t["ideal_answer"].present? }
    assert_not data["transcript"].first["ideal_answer"].start_with?("Answer:"), "the bank's prefix is dropped"
    assert_nil data["current_question"]
  end

  test "selection follows the difficulty mix and changes between quizzes" do
    picks = Array.new(4) { QuestionBank.pick("SQL", 10, "hard").map { |q| q["question"] } }
    assert picks.all? { |p| p.size == 10 && p.uniq.size == 10 }
    assert_operator picks.uniq.size, :>, 1

    hard = QuestionBank.rows.select { |r| r["category"] == "SQL" && r["difficulty"] == "Hard" }.map { |r| r["question"] }
    assert_operator (picks.first & hard).size, :>=, 6
  end

  test "non-English quizzes are translated once, at the start" do
    translate = ->(messages, **) { JSON.parse(messages.first[:content][/\[.*\]\z/m]).map { |q| "FR: #{q}" }.to_json }
    calls = stub_llm(chat: translate) do
      start(language: "fr", num_questions: 2)
      id = json["session_id"]
      assert json["first_question"].start_with?("FR: ")
      answer(id, "réponse")
      assert json["next_question"].start_with?("FR: ")
    end
    assert_equal 1, calls[:chat].size
    assert_includes calls[:chat].first.first.first[:content], "into French"
  end

  test "a failed or garbled translation falls back to English" do
    [ ->(*, **) { raise Llm::Error }, ->(*, **) { "Sure! Here you go: not json" }, ->(*, **) { '{"a": 1}' } ].each do |reply|
      stub_llm(chat: reply) do
        start(language: "es", num_questions: 2)
        assert_response :created
        assert_not json["first_question"].start_with?("FR: ")
        assert QuestionBank.rows.any? { |r| r["question"] == json["first_question"] }
      end
    end
  end

  test "evaluation covers answered questions only, clamps scores and keeps speech per answer" do
    evaluation = lambda do |*, **|
      { "per_question" => Array.new(4) { { "question" => "x", "answer" => "x", "ideal_answer" => "x", "score" => 99, "strengths" => [], "improvements" => [], "feedback" => "Ok" } },
        "overall_score" => -3, "communication_score" => 5, "technical_score" => 6, "top_strengths" => [],
        "areas_to_improve" => [], "summary" => "Fine", "hire_recommendation" => "Maybe" }
    end
    speech = { duration_seconds: 20, word_count: 40, words_per_minute: 120, filler_count: 0, long_pauses: 0, longest_pause_seconds: 0 }
    calls = stub_llm(json: evaluation) do
      start(num_questions: 3)
      id = json["session_id"]
      answer(id, "first", speech: speech)
      answer(id, "second", speech: { duration_seconds: 99_999, word_count: -5, filler_count: "lots" })
      post "/api/v1/sessions/sync_ai_session", params: { interviewType: "role", quizSessionId: id }, headers: auth_headers(@user), as: :json
      assert_response :ok
    end

    assert_equal 1, calls[:json].size
    assert_not_includes calls[:json].first.first, "Q3:"
    session = InterviewSession.last
    assert_equal 10.0, session.overall_score
    first, second = session.answers.to_a
    assert_equal [ 100.0, 100.0 ], [ first.score, second.score ]
    assert_equal 120, first.speech_metrics["words_per_minute"]
    assert_equal [ 3600.0, 0, nil ], second.speech_metrics.values_at("duration_seconds", "word_count", "filler_count")
    assert first.ideal_answer.present?
  end

  test "quizzes are private to their owner" do
    start
    id = json["session_id"]
    other = create_user(email: "other@example.com")

    get "/api/v1/quizzes/#{id}", headers: auth_headers(other)
    assert_response :not_found
    get "/api/v1/quizzes/#{SecureRandom.uuid}", headers: auth_headers(@user)
    assert_response :not_found
    get "/api/v1/interviews/#{id}", headers: auth_headers(@user)
    assert_response :not_found, "a quiz id isn't a CV interview id"
  end
end
