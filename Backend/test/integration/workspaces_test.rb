require "test_helper"

# Candidates and employers get separate workspaces, chosen at sign-up.
class WorkspacesTest < ActionDispatch::IntegrationTest
  test "sign-up makes a candidate account unless you say you're hiring" do
    post "/api/v1/register", params: { email: "ada@example.com", password: "password123" }, as: :json
    assert_equal "candidate", json["user"]["accountType"]

    post "/api/v1/register", params: { email: "grace@example.com", password: "password123", accountType: "employer" }, as: :json
    assert_response :created
    assert_equal "employer", json["user"]["accountType"]

    post "/api/v1/register", params: { email: "x@example.com", password: "password123", accountType: "admin" }, as: :json
    assert_response :unprocessable_entity
    assert_match(/candidate or employer/, json["errors"].join)
  end

  test "founding or joining a company makes the account an employer" do
    founder = create_user(email: "founder@example.com")
    post "/api/v1/organization", params: { name: "Acme" }, headers: auth_headers(founder), as: :json
    assert_response :created
    assert founder.reload.employer?

    joiner = create_user(email: "joiner@example.com")
    invitation = founder.organization.team_invitations.create!(email: joiner.email, role: "recruiter", invited_by: founder)
    post "/api/v1/team_invitations/accept", params: { token: invitation.generate_token_for(:accept) }, headers: auth_headers(joiner), as: :json
    assert_response :ok
    assert joiner.reload.employer?
  end

  test "an account switches workspace from settings, but not while on a hiring team" do
    user = create_user
    put "/api/v1/profile", params: { user: { accountType: "employer" } }, headers: auth_headers(user), as: :json
    assert_equal "employer", json["accountType"]
    put "/api/v1/profile", params: { user: { accountType: "candidate" } }, headers: auth_headers(user), as: :json
    assert_equal "candidate", json["accountType"]

    post "/api/v1/organization", params: { name: "Acme" }, headers: auth_headers(user), as: :json
    put "/api/v1/profile", params: { user: { accountType: "candidate" } }, headers: auth_headers(user), as: :json
    assert_response :unprocessable_entity
    assert_match(/hiring team/, json["errors"].join)
    assert user.reload.employer?
  end
end
