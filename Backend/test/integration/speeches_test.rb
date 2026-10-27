require "test_helper"

class SpeechesTest < ActionDispatch::IntegrationTest
  setup do
    @user = create_user
  end

  test "reads text aloud as WAV, once per text" do
    calls = []
    Rails.stub(:cache, ActiveSupport::Cache::MemoryStore.new) do
      Llm.stub(:speak, ->(text) { calls << text; "RIFF-audio" }) do
        2.times do
          post "/api/v1/speech", params: { text: "  Tell me about   a time. " }, headers: auth_headers(@user), as: :json
          assert_response :ok
          assert_equal "audio/wav", response.media_type
          assert_equal "RIFF-audio", response.body
        end
      end
    end
    assert_equal [ "Tell me about a time." ], calls
  end

  test "needs a signed-in user and sensible text" do
    post "/api/v1/speech", params: { text: "Hi" }, as: :json
    assert_response :unauthorized

    post "/api/v1/speech", params: { text: "" }, headers: auth_headers(@user), as: :json
    assert_response :unprocessable_entity
    post "/api/v1/speech", params: { text: "x" * 1001 }, headers: auth_headers(@user), as: :json
    assert_response :unprocessable_entity
  end

  test "an unavailable voice service is a 503 so the browser falls back" do
    Llm.stub(:speak, ->(*) { raise Llm::Error }) do
      post "/api/v1/speech", params: { text: "Hello" }, headers: auth_headers(@user), as: :json
    end
    assert_response :service_unavailable
  end
end
