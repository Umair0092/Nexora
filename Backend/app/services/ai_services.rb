require "net/http"

# Server-to-server client for the FastAPI services. Rails calls them directly
# (not through the gateway) with the signed-in user's id as X-User-Id, so the
# services' ownership checks still apply and scores never pass through the browser.
#
#   AiServices.evaluate_interview(session_id, user)  # => Hash (resume service /evaluate)
#   AiServices.score_answer(user, question:, answer:, ...)
#
# Failures raise AiServices::Error with a message safe to show the user.
module AiServices
  class Error < StandardError
    attr_reader :status

    def initialize(message, status = :service_unavailable)
      super(message)
      @status = status
    end
  end

  EXPIRED = "This interview has expired, so it can't be scored any more. Start a new one to get a report.".freeze
  BUSY = "The AI service is busy right now. Try again in a minute.".freeze

  module_function

  def resume_url
    ENV.fetch("AI_RESUME_URL", "http://127.0.0.1:8000")
  end

  def quiz_url
    ENV.fetch("AI_QUIZ_URL", "http://127.0.0.1:8001")
  end

  def evaluate_interview(session_id, user)
    request(:get, "#{resume_url}/api/v1/interviews/#{escape(session_id)}/evaluate", user)
  end

  def evaluate_quiz(session_id, user)
    request(:get, "#{quiz_url}/api/v1/quiz/#{escape(session_id)}/evaluate", user)
  end

  def delete_interview(session_id, user)
    request(:delete, "#{resume_url}/api/v1/interviews/#{escape(session_id)}", user, timeout: 5)
  rescue Error
    nil
  end

  def delete_quiz(session_id, user)
    request(:delete, "#{quiz_url}/api/v1/quiz/#{escape(session_id)}", user, timeout: 5)
  rescue Error
    nil
  end

  def score_answer(user, **payload)
    request(:post, "#{resume_url}/api/v1/score-answer", user, body: payload)
  end

  def improve_answer(user, **payload)
    request(:post, "#{resume_url}/api/v1/improve-answer", user, body: payload)
  end

  def escape(id)
    ERB::Util.url_encode(id.to_s)
  end

  def request(method, url, user, body: nil, timeout: 120)
    uri = URI(url)
    req = { get: Net::HTTP::Get, post: Net::HTTP::Post, delete: Net::HTTP::Delete }.fetch(method).new(uri)
    req["X-User-Id"] = user.id.to_s
    req["Accept"] = "application/json"
    if body
      req["Content-Type"] = "application/json"
      req.body = body.compact.to_json
    end

    res = Net::HTTP.start(uri.host, uri.port, open_timeout: 5, read_timeout: timeout) { |http| http.request(req) }
    return {} if res.is_a?(Net::HTTPNoContent)

    data = res.body.present? ? JSON.parse(res.body) : {}
    return data if res.is_a?(Net::HTTPSuccess)

    Rails.logger.warn("AI service #{method.upcase} #{uri.path} -> #{res.code}: #{data['detail'].to_s.truncate(200)}")
    case res.code.to_i
    when 404 then raise Error.new(EXPIRED, :not_found)
    when 400 then raise Error.new(data["detail"].is_a?(String) ? data["detail"] : "That request couldn't be processed.", :unprocessable_entity)
    else raise Error.new(BUSY)
    end
  rescue JSON::ParserError, SocketError, SystemCallError, Net::OpenTimeout, Net::ReadTimeout, IOError => e
    Rails.logger.error("AI service #{method.upcase} #{url} failed: #{e.class}: #{e.message}")
    raise Error.new(BUSY)
  end
end
