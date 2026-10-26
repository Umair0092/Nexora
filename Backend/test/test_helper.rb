ENV["RAILS_ENV"] ||= "test"
require_relative "../config/environment"
require "rails/test_help"

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
end

class ActionDispatch::IntegrationTest
  include ApiTestHelpers

  setup { Api::V1::AuthController::RATE_LIMIT_STORE.clear }
end
