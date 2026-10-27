require "net/http"

# Chat and speech-to-text calls to an OpenAI-compatible API. The defaults point
# at Groq's free tier, so GROQ_API_KEY alone is enough; LLM_BASE_URL,
# LLM_API_KEY and LLM_MODEL switch to another provider (OpenRouter, a local
# Ollama, ...). Transcription always uses Whisper on Groq unless WHISPER_BASE_URL
# says otherwise.
#
#   Llm.chat([ { role: "user", content: "Hi" } ], max_tokens: 500)  # => "Hello!"
#   Llm.json("Extract...", schema: SCHEMA, name: "Candidate")        # => Hash
#   Llm.transcribe(bytes, filename: "answer.webm", language: "en")   # => Hash (verbose_json)
#   Llm.speak("Tell me about a time...")                             # => WAV bytes
#
# Free tiers limit tokens per minute (Groq: 8k/min for gpt-oss-120b), so 429s
# and 5xx responses are retried after the provider's Retry-After. Anything that
# still fails raises Llm::Error with a message that is safe to show the user.
module Llm
  DEFAULT_BASE_URL = "https://api.groq.com/openai/v1".freeze
  DEFAULT_MODEL = "openai/gpt-oss-120b".freeze
  DEFAULT_WHISPER_MODEL = "whisper-large-v3".freeze
  DEFAULT_TTS_MODEL = "canopylabs/orpheus-v1-english".freeze
  DEFAULT_TTS_VOICE = "hannah".freeze

  BUSY = "The AI service is busy right now. Try again in a minute.".freeze
  QUOTA = "The AI service has reached its usage limit for now. Try again in a few minutes.".freeze
  NOT_CONFIGURED = "The AI service isn't set up on this server yet.".freeze

  class Error < StandardError
    attr_reader :status

    def initialize(message = BUSY, status: :service_unavailable, quota: false)
      super(message)
      @status = status
      @quota = quota
    end

    # True when the provider kept rate-limiting after every retry. Interviews
    # then stop instead of falling back to a canned question.
    def quota?
      @quota
    end
  end

  RETRYABLE = [ 408, 409, 429, 500, 502, 503, 504 ].freeze
  NETWORK_ERRORS = [ SocketError, SystemCallError, IOError, Net::OpenTimeout, Net::ReadTimeout, OpenSSL::SSL::SSLError ].freeze

  module_function

  # Plain chat completion; returns the assistant's text.
  def chat(messages, max_tokens:, temperature: nil)
    body = { model: model, messages: messages, max_tokens: max_tokens }
    body[:temperature] = temperature unless temperature.nil?
    content_of(post_json("chat/completions", body))
  end

  # Chat completion constrained to a JSON schema; returns the parsed object.
  # `prompt` is a string (sent as one user message) or a list of messages.
  def json(prompt, schema:, name:, max_tokens:, temperature: nil)
    messages = prompt.is_a?(String) ? [ { role: "user", content: prompt } ] : prompt
    body = {
      model: model,
      messages: messages,
      max_tokens: max_tokens,
      response_format: { type: "json_schema", json_schema: { name: name, schema: schema } }
    }
    body[:temperature] = temperature unless temperature.nil?
    parse_object(content_of(post_json("chat/completions", body)))
  end

  # Whisper transcription with word timestamps (for pace, fillers and pauses).
  def transcribe(audio, filename:, language:, prompt: nil)
    key = ENV["GROQ_API_KEY"].presence || ENV["LLM_API_KEY"].presence
    raise Error.new(NOT_CONFIGURED) unless key

    uri = URI("#{ENV.fetch('WHISPER_BASE_URL', DEFAULT_BASE_URL).chomp('/')}/audio/transcriptions")
    fields = [
      [ "file", audio, { filename: filename, content_type: "application/octet-stream" } ],
      [ "model", ENV.fetch("WHISPER_MODEL", DEFAULT_WHISPER_MODEL) ],
      [ "language", language ],
      [ "response_format", "verbose_json" ],
      [ "timestamp_granularities[]", "word" ]
    ]
    fields << [ "prompt", prompt ] if prompt
    response = perform(uri, timeout: 120) do
      Net::HTTP::Post.new(uri).tap do |req|
        req["Authorization"] = "Bearer #{key}"
        req.set_form(fields, "multipart/form-data")
      end
    end
    parse_object(response.body)
  end

  # Natural-sounding speech for the interviewer (Groq Orpheus by default).
  # Long text is sent in sentence-sized pieces and joined into one WAV.
  def speak(text)
    key = ENV["GROQ_API_KEY"].presence || ENV["LLM_API_KEY"].presence
    raise Error.new(NOT_CONFIGURED) unless key

    uri = URI("#{ENV.fetch('TTS_BASE_URL', DEFAULT_BASE_URL).chomp('/')}/audio/speech")
    pieces = Wav.sentences(text, Integer(ENV.fetch("TTS_MAX_CHARS", 200), exception: false) || 200).map do |piece|
      payload = { model: ENV.fetch("TTS_MODEL", DEFAULT_TTS_MODEL), voice: ENV.fetch("TTS_VOICE", DEFAULT_TTS_VOICE),
                  input: piece, response_format: "wav" }.to_json
      response = perform(uri, timeout: 60) do
        Net::HTTP::Post.new(uri).tap do |req|
          req["Authorization"] = "Bearer #{key}"
          req["Content-Type"] = "application/json"
          req.body = payload
        end
      end
      response.body.to_s.b
    end
    Wav.join(pieces)
  end

  def model
    ENV.fetch("LLM_MODEL", DEFAULT_MODEL)
  end

  def max_retries
    Integer(ENV.fetch("LLM_MAX_RETRIES", 6), exception: false) || 6
  end

  def post_json(path, body)
    key = ENV["LLM_API_KEY"].presence || ENV["GROQ_API_KEY"].presence
    raise Error.new(NOT_CONFIGURED) unless key

    uri = URI("#{ENV.fetch('LLM_BASE_URL', DEFAULT_BASE_URL).chomp('/')}/#{path}")
    payload = body.to_json
    response = perform(uri, timeout: 180) do
      Net::HTTP::Post.new(uri).tap do |req|
        req["Authorization"] = "Bearer #{key}"
        req["Content-Type"] = "application/json"
        req.body = payload
      end
    end
    parse_object(response.body)
  end

  # Sends the request built by the block, retrying rate limits, server errors
  # and network failures. Logs status codes only: bodies carry candidates' answers.
  def perform(uri, timeout:)
    attempt = 0
    loop do
      begin
        response = Net::HTTP.start(uri.host, uri.port, use_ssl: uri.scheme == "https",
                                   open_timeout: 10, read_timeout: timeout) { |http| http.request(yield) }
      rescue *NETWORK_ERRORS => e
        raise Error.new(BUSY) if attempt >= max_retries

        Rails.logger.warn("LLM #{uri.path}: #{e.class}, retrying")
        attempt += 1
        pause(backoff(attempt))
        next
      end

      return response if response.is_a?(Net::HTTPSuccess)

      code = response.code.to_i
      if RETRYABLE.include?(code) && attempt < max_retries
        attempt += 1
        pause(retry_after(response) || backoff(attempt))
        next
      end

      Rails.logger.error("LLM #{uri.path} -> #{code}: #{provider_message(response)}")
      raise Error.new(QUOTA, quota: true) if code == 429
      raise Error.new(BUSY)
    end
  end

  def retry_after(response)
    ms = Float(response["retry-after-ms"].to_s, exception: false)
    return (ms / 1000.0).clamp(0, 60) if ms

    seconds = Float(response["retry-after"].to_s, exception: false)
    seconds&.clamp(0, 60)
  end

  def backoff(attempt)
    [ 0.5 * (2**(attempt - 1)), 20 ].min + rand * 0.25
  end

  # Separate so tests can skip the waiting.
  def pause(seconds)
    sleep(seconds)
  end

  def provider_message(response)
    data = JSON.parse(response.body.to_s)
    (data.dig("error", "message") || data["error"] || data["detail"]).to_s.truncate(200)
  rescue JSON::ParserError
    ""
  end

  def content_of(data)
    content = data.dig("choices", 0, "message", "content")
    raise Error.new(BUSY) unless content.is_a?(String) && content.strip.present?

    content.strip
  end

  # Models sometimes wrap JSON in a ```json fence.
  def parse_object(text)
    text = text.to_s.strip.sub(/\A```(?:json)?\s*/i, "").sub(/\s*```\z/, "")
    data = JSON.parse(text)
    raise Error.new(BUSY) unless data.is_a?(Hash)

    data
  rescue JSON::ParserError
    Rails.logger.error("LLM returned malformed JSON")
    raise Error.new(BUSY)
  end
end
