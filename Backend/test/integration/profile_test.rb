require "test_helper"

class ProfileTest < ActionDispatch::IntegrationTest
  setup do
    @user = create_user
  end

  test "show returns camelCase user" do
    get "/api/v1/profile", headers: auth_headers(@user)

    assert_response :ok
    assert_equal "Test", json["firstName"]
    assert json.key?("resumeUrl")
  end

  test "update accepts snake_case and camelCase names, skills and experience" do
    put "/api/v1/profile", headers: auth_headers(@user), as: :json, params: {
      user: {
        firstName: "Grace",
        last_name: "Hopper",
        bio: "Compiler pioneer",
        skills: [ "COBOL", "Leadership" ],
        experience: [ { title: "Rear Admiral", company: "US Navy", duration: "1943 - 1986", description: "Lots" } ]
      }
    }

    assert_response :ok
    assert_equal "Grace", json["firstName"]
    assert_equal "Hopper", json["lastName"]
    assert_equal [ "COBOL", "Leadership" ], json["skills"]
    assert_equal "US Navy", json["experience"].first["company"]
    assert_equal "Grace", @user.reload.first_name
  end

  test "update rejects too many experience entries" do
    entries = Array.new(21) { |i| { title: "Job #{i}", company: "Co", duration: "1y", description: "" } }
    put "/api/v1/profile", headers: auth_headers(@user), as: :json, params: { user: { experience: entries } }

    assert_response :unprocessable_entity
  end

  test "update rejects non-string experience fields" do
    put "/api/v1/profile", headers: auth_headers(@user), as: :json, params: { user: { experience: [ { title: 123 } ] } }

    assert_response :unprocessable_entity
  end

  test "update rejects overlong names" do
    put "/api/v1/profile", headers: auth_headers(@user), as: :json, params: { user: { firstName: "a" * 51 } }

    assert_response :unprocessable_entity
  end

  test "upload_resume mock is gone" do
    post "/api/v1/profile/upload_resume", headers: auth_headers(@user)

    assert_response :not_found
  end
end
