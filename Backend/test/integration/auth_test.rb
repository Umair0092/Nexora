require "test_helper"

class AuthTest < ActionDispatch::IntegrationTest
  USER_KEYS = %w[id email firstName lastName profileImageUrl bio skills experience resumeUrl emailVerified remindersEnabled weeklyGoal].freeze

  test "register returns token and camelCase user" do
    post "/api/v1/register", params: { email: "  New@Example.COM ", password: "password123", first_name: "Ada", last_name: "Lovelace" }, as: :json

    assert_response :created
    assert json["token"].present?
    assert_equal USER_KEYS.sort, json["user"].keys.sort
    assert_equal "new@example.com", json["user"]["email"]
    assert_equal "Ada", json["user"]["firstName"]
    assert_nil json["user"]["password_digest"]
  end

  test "register ignores profile_image_url" do
    post "/api/v1/register", params: { email: "a@example.com", password: "password123", profile_image_url: "javascript:alert(1)" }, as: :json

    assert_response :created
    assert_nil User.find_by(email: "a@example.com").profile_image_url
  end

  test "register rejects short password" do
    post "/api/v1/register", params: { email: "short@example.com", password: "short" }, as: :json

    assert_response :unprocessable_entity
    assert json["errors"].any? { |e| e.include?("Password") }
  end

  test "register rejects invalid email" do
    post "/api/v1/register", params: { email: "not-an-email", password: "password123" }, as: :json

    assert_response :unprocessable_entity
  end

  test "register rejects case-insensitive duplicate email" do
    create_user(email: "dup@example.com")
    post "/api/v1/register", params: { email: "DUP@Example.com", password: "password123" }, as: :json

    assert_response :unprocessable_entity
    assert_equal 1, User.count
  end

  test "login succeeds with differently-cased email" do
    create_user(email: "login@example.com")
    post "/api/v1/login", params: { email: "LOGIN@example.com ", password: "password123" }, as: :json

    assert_response :ok
    assert json["token"].present?
    assert_equal USER_KEYS.sort, json["user"].keys.sort
  end

  test "login fails with wrong password" do
    create_user(email: "login@example.com")
    post "/api/v1/login", params: { email: "login@example.com", password: "wrongpassword" }, as: :json

    assert_response :unauthorized
    assert_equal "Invalid email or password", json["error"]
  end

  test "me requires auth" do
    get "/api/v1/me"
    assert_response :unauthorized

    get "/api/v1/me", headers: { "Authorization" => "Bearer garbage" }
    assert_response :unauthorized
  end

  test "me rejects tokens signed with another algorithm or expired" do
    user = create_user
    none_token = JWT.encode({ user_id: user.id, exp: 1.hour.from_now.to_i }, nil, "none")
    get "/api/v1/me", headers: { "Authorization" => "Bearer #{none_token}" }
    assert_response :unauthorized

    expired = JsonWebToken.encode({ user_id: user.id }, 1.minute.ago)
    get "/api/v1/me", headers: { "Authorization" => "Bearer #{expired}" }
    assert_response :unauthorized
  end

  test "me returns camelCase user" do
    user = create_user
    get "/api/v1/me", headers: auth_headers(user)

    assert_response :ok
    assert_equal USER_KEYS.sort, json.keys.sort
    assert_equal user.id, json["id"]
  end

  test "login is rate limited" do
    10.times do
      post "/api/v1/login", params: { email: "x@example.com", password: "wrongpassword" }, as: :json
      assert_response :unauthorized
    end

    post "/api/v1/login", params: { email: "x@example.com", password: "wrongpassword" }, as: :json
    assert_response :too_many_requests
    assert_equal "Too many attempts. Please try again in a few minutes.", json["error"]
  end
end
