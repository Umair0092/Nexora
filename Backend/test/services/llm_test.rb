require "test_helper"
require "net/http"

class LlmTest < ActiveSupport::TestCase
  setup do
    @env = ENV.to_h.slice("GROQ_API_KEY", "LLM_API_KEY", "LLM_MAX_RETRIES")
    ENV["GROQ_API_KEY"] = "test-key"
    ENV.delete("LLM_API_KEY")
    ENV["LLM_MAX_RETRIES"] = "2"
  end

  teardown do
    %w[GROQ_API_KEY LLM_API_KEY LLM_MAX_RETRIES].each { |k| @env.key?(k) ? ENV[k] = @env[k] : ENV.delete(k) }
  end

  def response(code, body, headers = {})
    klass = Net::HTTPResponse::CODE_TO_OBJ.fetch(code.to_s)
    klass.new("1.1", code.to_s, "").tap do |res|
      headers.each { |k, v| res[k] = v }
      res.instance_variable_set(:@body, body)
      res.instance_variable_set(:@read, true)
    end
  end

  def completion(content)
    { choices: [ { message: { content: content } } ] }.to_json
  end

  # Replays `responses` (or raises exceptions) for successive HTTP requests.
  def with_responses(*responses)
    queue = responses.dup
    sent = []
    pauses = []
    start = lambda do |*_args, **_kwargs, &block|
      http = Object.new
      http.define_singleton_method(:request) do |req|
        sent << req
        next_up = queue.shift
        raise next_up if next_up.is_a?(Exception)

        next_up
      end
      block.call(http)
    end
    Net::HTTP.stub(:start, start) do
      Llm.stub(:pause, ->(s) { pauses << s }) { yield sent, pauses }
    end
  end

  test "json sends the schema and parses fenced output" do
    with_responses(response(200, completion("```json\n{\"name\": \"Ali\"}\n```"))) do |sent|
      assert_equal({ "name" => "Ali" }, Llm.json("Extract", schema: { type: "object" }, name: "Candidate", max_tokens: 100))
      body = JSON.parse(sent.first.body)
      assert_equal "Candidate", body.dig("response_format", "json_schema", "name")
      assert_equal "Bearer test-key", sent.first["Authorization"]
    end
  end

  test "rate limits are retried after the provider's Retry-After" do
    with_responses(response(429, "{}", "retry-after" => "3"), response(503, "{}"), response(200, completion("Hi"))) do |sent, pauses|
      assert_equal "Hi", Llm.chat([ { role: "user", content: "x" } ], max_tokens: 10)
      assert_equal 3, sent.size
      assert_equal 3.0, pauses.first
    end
  end

  test "a rate limit that outlasts the retries is a quota error" do
    with_responses(*Array.new(3) { response(429, '{"error":{"message":"slow down"}}') }) do
      error = assert_raises(Llm::Error) { Llm.chat([], max_tokens: 10) }
      assert error.quota?
      assert_equal Llm::QUOTA, error.message
    end
  end

  test "network errors are retried, then reported as busy" do
    with_responses(Errno::ECONNRESET.new, Net::ReadTimeout.new, Errno::ECONNREFUSED.new) do |sent|
      error = assert_raises(Llm::Error) { Llm.chat([], max_tokens: 10) }
      assert_equal Llm::BUSY, error.message
      assert_equal 3, sent.size
    end
  end

  test "client errors and malformed output are not retried" do
    with_responses(response(400, "{}"), response(200, completion("not json"))) do |sent|
      assert_raises(Llm::Error) { Llm.chat([], max_tokens: 10) }
      assert_equal 1, sent.size
      assert_raises(Llm::Error) { Llm.json("x", schema: {}, name: "X", max_tokens: 10) }
    end
  end

  test "a missing key is reported, not sent" do
    ENV.delete("GROQ_API_KEY")
    error = assert_raises(Llm::Error) { Llm.chat([], max_tokens: 10) }
    assert_equal Llm::NOT_CONFIGURED, error.message
  end

  test "speak sends sentence-sized pieces and joins the audio" do
    clip = ->(n) { "RIFF".b + [ 36 + 2 ].pack("V") + "WAVEfmt ".b + [ 16 ].pack("V") + [ 1, 1, 24_000, 48_000, 2, 16 ].pack("vvVVvv") + "data".b + [ 2 ].pack("V") + [ n ].pack("s<") }
    ENV["TTS_MAX_CHARS"] = "20"
    with_responses(response(200, clip.call(1)), response(200, clip.call(2))) do |sent|
      audio = Llm.speak("First sentence. Second sentence.")
      assert_equal [ "First sentence.", "Second sentence." ], sent.map { |r| JSON.parse(r.body)["input"] }
      assert_equal "canopylabs/orpheus-v1-english", JSON.parse(sent.first.body)["model"]
      assert_equal [ 1, 2 ], Wav.parse(audio)[:data].unpack("s<*")
    end
  ensure
    ENV.delete("TTS_MAX_CHARS")
  end
end
