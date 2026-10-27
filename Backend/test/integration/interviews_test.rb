require "test_helper"

class InterviewsTest < ActionDispatch::IntegrationTest
  CANDIDATE = { name: "Ali Hassan", degree: "BS CS", skills: [ "Ruby", "Postgres" ],
                work_experience: [ { company: "TechCorp", role: "Engineer", description: "Built billing" } ] }.freeze

  setup do
    @user = create_user
    @asked = 0
  end

  # The model asks numbered questions and scores every answer 12 (clamped to 10).
  def fake_chat
    ->(_messages, **) { "Question #{@asked += 1}: tell me about your work on billing?" }
  end

  def fake_evaluation(answers: 1, behavioral: false)
    lambda do |_prompt, **|
      {
        "per_question" => Array.new(answers + 2) do
          { "question" => "made up", "answer" => "made up", "score" => 12, "strengths" => [ "Clear" ], "improvements" => [],
            "feedback" => "Good", "recommendation" => "More numbers",
            "star" => { "situation" => true, "task" => false, "action" => true, "result" => true, "note" => "Say what you did" } }
        end,
        "overall_score" => 0, "communication_score" => "8", "technical_score" => 7, "top_strengths" => [ "Clear" ],
        "areas_to_improve" => [ "Depth" ], "summary" => "Solid.", "hire_recommendation" => "Yes",
        "recommendation_summary" => "Practise.", "improvement_points" => [ "Quantify" ], "job_fit" => "Shows Kafka"
      }
    end
  end

  def start(**body)
    post "/api/v1/interviews", params: { candidate_data: CANDIDATE, target_role: "Backend Engineer", num_questions: 5, **body },
                               headers: auth_headers(@user), as: :json
  end

  def answer(id, text = "I rebuilt the billing service", user: @user, **extra)
    post "/api/v1/interviews/#{id}/answer", params: { answer: text, **extra }, headers: auth_headers(user), as: :json
  end

  test "needs auth and validates the request" do
    post "/api/v1/interviews", params: { candidate_data: CANDIDATE }, as: :json
    assert_response :unauthorized

    stub_llm(chat: fake_chat) do
      start(job_description: "x" * 6001)
      assert_response :unprocessable_entity
      start(num_questions: 30)
      assert_response :unprocessable_entity
      start(interview_style: "panel")
      assert_response :unprocessable_entity
      start(candidate_data: nil)
      assert_response :unprocessable_entity
    end
    assert_equal 0, LiveInterview.count
  end

  test "an interview runs to completion and is stored between requests" do
    calls = stub_llm(chat: fake_chat) do
      start
      assert_response :created
      assert_equal "Question 1: tell me about your work on billing?", json["opening_question"]
      id = json["session_id"]

      4.times do |i|
        answer(id, "Answer #{i + 1}")
        assert_response :ok
        assert_equal false, json["is_complete"]
        assert_equal i + 2, json["questions_asked"]
      end
      answer(id, "Answer 5")
      assert_equal true, json["is_complete"]
      answer(id, "One more")
      assert_response :gone

      get "/api/v1/interviews/#{id}", headers: auth_headers(@user)
      assert_response :ok
      assert_equal 11, json["conversation"].size
      assert_equal %w[interviewer candidate], json["conversation"].first(2).map { |m| m["role"] }
      assert_equal true, json["is_complete"]
    end

    # Each question call sees the system prompt, the CV and the conversation so far.
    messages = calls[:chat].last.first
    assert_equal "system", messages.first[:role]
    assert_includes messages.first[:content], "TechCorp"
    assert_includes messages.map { |m| m[:content] }, "Answer 3"
  end

  test "a job description reaches the prompts and the evaluation" do
    calls = stub_llm(chat: fake_chat, json: fake_evaluation) do
      start(job_description: "We need Kafka and Kubernetes experience.")
      id = json["session_id"]
      answer(id)
      post "/api/v1/sessions/sync_ai_session", params: { interviewType: "cv", cvSessionId: id }, headers: auth_headers(@user), as: :json
      assert_response :ok
    end

    assert_includes calls[:chat].first.first.first[:content], "We need Kafka and Kubernetes experience."
    assert_includes calls[:json].first.first, "JOB DESCRIPTION"
    session = InterviewSession.last
    assert_equal "We need Kafka and Kubernetes experience.", session.job_description
    assert_equal "Shows Kafka", session.report.behavioral_summary.dig("evaluation", "job_fit")
  end

  test "behavioral interviews use the STAR prompt and keep STAR scores; standard ones drop them" do
    calls = stub_llm(chat: fake_chat, json: fake_evaluation) do
      start(interview_style: "behavioral")
      id = json["session_id"]
      answer(id)
      post "/api/v1/sessions/sync_ai_session", params: { interviewType: "behavioral", cvSessionId: id }, headers: auth_headers(@user), as: :json
      assert_response :ok

      start
      id = json["session_id"]
      answer(id)
      post "/api/v1/sessions/sync_ai_session", params: { interviewType: "cv", cvSessionId: id }, headers: auth_headers(@user), as: :json
      assert_response :ok
    end

    assert_includes calls[:chat].first.first.first[:content], "behavioral interview"
    assert_includes calls[:json].first.first, "STAR coverage"
    behavioral, standard = InterviewSession.order(:id).map { |s| s.answers.first }
    assert_equal({ "situation" => true, "task" => false, "action" => true, "result" => true, "note" => "Say what you did" }, behavioral.star)
    assert_nil standard.star
  end

  test "the evaluation keeps one entry per answer, clamps scores, restores text and attaches speech" do
    speech = { duration_seconds: 30, word_count: 75, words_per_minute: 150, filler_count: 2, fillers: { um: 2 },
               long_pauses: 0, longest_pause_seconds: 1.2 }
    stub_llm(chat: fake_chat, json: fake_evaluation(answers: 2)) do
      start
      id = json["session_id"]
      answer(id, "First answer", speech: speech)
      answer(id, "Second answer")
      post "/api/v1/sessions/sync_ai_session", params: { interviewType: "cv", cvSessionId: id }, headers: auth_headers(@user), as: :json
      assert_response :ok
    end

    session = InterviewSession.last
    assert_equal 10.0, session.overall_score, "0 is clamped up to 1, then shown as a percentage"
    first, second = session.answers.to_a
    assert_equal [ "First answer", "Second answer" ], [ first.transcript, second.transcript ]
    assert_equal "Question 1: tell me about your work on billing?", first.question.text
    assert_equal [ 100.0, 100.0 ], [ first.score, second.score ]
    assert_equal 150, first.speech_metrics["words_per_minute"]
    assert_nil second.speech_metrics
    assert_equal 2, session.answers.count
  end

  test "the evaluation is cached until another answer arrives" do
    calls = stub_llm(chat: fake_chat, json: fake_evaluation) do
      start
      id = json["session_id"]
      answer(id)
      live = LiveInterview.find(id)
      2.times { LiveInterview.open!(@user, id, "cv", &:evaluate!) }
      answer(id, "Another")
      LiveInterview.open!(@user, id, "cv", &:evaluate!)
      assert_equal 2, live.reload.state["evaluated_answers"]
    end
    assert_equal 2, calls[:json].size
  end

  test "a rate-limited model stops the interview without losing the answer" do
    quota = true
    chat = lambda do |*|
      raise Llm::Error.new(Llm::QUOTA, quota: true) if quota

      "Question 2: and then what happened next?"
    end
    stub_llm(chat: chat) do
      quota = false
      start
      id = json["session_id"]

      quota = true
      answer(id, "My answer")
      assert_response :service_unavailable
      assert_equal Llm::QUOTA, json["error"]
      assert_equal 1, LiveInterview.find(id).state["history"].size, "the answer wasn't recorded"

      quota = false
      answer(id, "My answer")
      assert_response :ok
      assert_equal "Question 2: and then what happened next?", json["next_question"]
    end
  end

  test "other model failures fall back to a stock question" do
    stub_llm(chat: ->(*) { raise Llm::Error }) do
      start
      assert_response :created
      assert_match(/\AHello! Welcome to this Backend Engineer interview\./, json["opening_question"])
    end
  end

  test "interviews are private to their owner and can be deleted" do
    other = create_user(email: "other@example.com")
    stub_llm(chat: fake_chat) do
      start
      id = json["session_id"]

      get "/api/v1/interviews/#{id}", headers: auth_headers(other)
      assert_response :not_found
      answer(id, user: other)
      assert_response :not_found
      get "/api/v1/interviews/not-a-uuid", headers: auth_headers(@user)
      assert_response :not_found

      delete "/api/v1/interviews/#{id}", headers: auth_headers(other)
      assert LiveInterview.exists?(id)
      delete "/api/v1/interviews/#{id}", headers: auth_headers(@user)
      assert_response :no_content
      assert_empty response.body
      assert_not LiveInterview.exists?(id)
    end
  end

  test "starting a sixth interview evicts the oldest" do
    stub_llm(chat: fake_chat) do
      ids = Array.new(6) do
        start
        json["session_id"]
      end
      assert_equal 5, @user.live_interviews.count
      assert_not LiveInterview.exists?(ids.first)
    end
  end
end
