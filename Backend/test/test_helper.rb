ENV["RAILS_ENV"] ||= "test"
require_relative "../config/environment"
require "rails/test_help"
require "minitest/mock"

module ActiveSupport
  class TestCase
    # Run tests in parallel with specified workers
    parallelize(workers: :number_of_processors)

    # Setup all fixtures in test/fixtures/*.yml for all tests in alphabetical order.
    fixtures :all

    # Add more helper methods to be used by all tests here...
  end
end

module ApiTestHelpers
  def json
    JSON.parse(response.body)
  end

  def create_user(email: "user@example.com", password: "password123", **attrs)
    User.create!(email: email, password: password, first_name: "Test", last_name: "User", **attrs)
  end

  def auth_headers(user)
    { "Authorization" => "Bearer #{JsonWebToken.encode(user_id: user.id)}" }
  end

  # Replaces the model behind Llm.json / Llm.chat. Each handler gets the same
  # arguments as the real method and returns its result (or raises). Returns
  # the calls made, by method.
  def stub_llm(json: nil, chat: nil)
    calls = Hash.new { |h, k| h[k] = [] }
    handler = lambda do |name, fallback|
      lambda do |*args, **kwargs|
        calls[name] << [ *args, kwargs ]
        raise "Unexpected Llm.#{name} call" unless fallback

        fallback.call(*args, **kwargs)
      end
    end
    Llm.stub(:json, handler.call(:json, json)) do
      Llm.stub(:chat, handler.call(:chat, chat)) { yield calls }
    end
    calls
  end

  # Replaces AnswerCoach (retries and rewrites). Values are returned or raised.
  def stub_coach(score: nil, improve: nil)
    calls = Hash.new { |h, k| h[k] = [] }
    respond = lambda do |name, value|
      lambda do |**kwargs|
        calls[name] << kwargs
        raise value if value.is_a?(Exception)

        value
      end
    end
    AnswerCoach.stub(:score, respond.call(:score, score)) do
      AnswerCoach.stub(:improve, respond.call(:improve, improve)) { yield calls }
    end
    calls
  end

  # An interview in progress whose evaluation is already cached, so saving it
  # needs no model call. `evaluation["per_question"]` becomes its answers.
  def live_interview(user, evaluation = ai_evaluation, kind: "cv")
    pairs = Array(evaluation["per_question"])
    state =
      if kind == "cv"
        CvInterview.build(candidate_data: { "name" => "Test" }, target_role: evaluation["target_role"] || "Software Engineer",
                          style: evaluation["interview_style"] || "standard", job_description: evaluation["job_description"]).state.merge(
          "history" => pairs.flat_map { |q| [ { "role" => "ai", "content" => q["question"] }, { "role" => "human", "content" => q["answer"] } ] },
          "questions_asked" => pairs.size
        )
      else
        {
          "target_role" => "SQL", "difficulty" => "medium", "language" => "en", "answered" => pairs.size,
          "questions" => pairs.map { |q| { "question" => q["question"], "ideal_answer" => q["ideal_answer"].to_s } },
          "answers" => pairs.map { |q| q["answer"] }, "speech" => Array.new(pairs.size), "translations" => {}
        }
      end
    user.live_interviews.create!(kind: kind, state: state.merge("evaluation" => evaluation, "evaluated_answers" => pairs.size))
  end

  # A minimal AI evaluation in the shape the services return (scores 0–10).
  def ai_evaluation(overrides = {})
    {
      "target_role" => "Software Engineer",
      "language" => "en",
      "interview_style" => "standard",
      "job_description" => nil,
      "overall_score" => 7,
      "communication_score" => 8,
      "technical_score" => 6,
      "hire_recommendation" => "Yes",
      "top_strengths" => [ "Clear" ],
      "areas_to_improve" => [ "Depth" ],
      "summary" => "Solid.",
      "recommendation_summary" => "Practise.",
      "improvement_points" => [ "Quantify results" ],
      "job_fit" => nil,
      "per_question" => [
        { "question" => "Tell me about yourself", "answer" => "I build things", "score" => 8,
          "strengths" => [ "Clear" ], "improvements" => [ "Detail" ], "feedback" => "Good", "recommendation" => "More numbers" }
      ]
    }.merge(overrides)
  end

  # Saves one interview through sync_ai_session and returns its InterviewSession.
  def sync_interview(user, evaluation: ai_evaluation, type: "cv", **params)
    live = live_interview(user, evaluation, kind: type == "role" ? "quiz" : "cv")
    ids = type == "role" ? { quizSessionId: live.id } : { cvSessionId: live.id }
    post "/api/v1/sessions/sync_ai_session", params: { interviewType: type, **ids, **params },
                                             headers: auth_headers(user), as: :json
    assert_response :ok, response.body
    InterviewSession.find(JSON.parse(response.body)["session_id"])
  end
end

class ActionDispatch::IntegrationTest
  include ApiTestHelpers
  include ActionMailer::TestHelper

  setup do
    Api::V1::AuthController::RATE_LIMIT_STORE.clear
    ActionMailer::Base.deliveries.clear
  end
end
