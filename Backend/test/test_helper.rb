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

  # Replaces the server-to-server AI calls. Each value is the evaluation hash the
  # service would return, or an exception to raise. Returns the calls made.
  def stub_ai(cv: nil, quiz: nil, score: nil, improve: nil)
    calls = Hash.new { |h, k| h[k] = [] }
    respond = lambda do |name, value|
      lambda do |*args, **kwargs|
        calls[name] << (kwargs.any? ? args + [ kwargs ] : args)
        raise value if value.is_a?(Exception)

        value
      end
    end
    AiServices.stub(:evaluate_interview, respond.call(:evaluate_interview, cv)) do
      AiServices.stub(:evaluate_quiz, respond.call(:evaluate_quiz, quiz)) do
        AiServices.stub(:delete_interview, respond.call(:delete_interview, {})) do
          AiServices.stub(:delete_quiz, respond.call(:delete_quiz, {})) do
            AiServices.stub(:score_answer, respond.call(:score_answer, score)) do
              AiServices.stub(:improve_answer, respond.call(:improve_answer, improve)) do
                yield calls
              end
            end
          end
        end
      end
    end
    calls
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
    ids = type == "role" ? { quizSessionId: "quiz-1" } : { cvSessionId: "cv-1" }
    stub_ai(cv: evaluation, quiz: evaluation) do
      post "/api/v1/sessions/sync_ai_session", params: { interviewType: type, **ids, **params },
                                               headers: auth_headers(user), as: :json
    end
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
