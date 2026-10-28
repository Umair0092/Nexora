require "net/http"

# The notetaker that joins a video call, through Recall.ai (one API for Google
# Meet, Zoom and Microsoft Teams). It joins as "Nexora Notetaker", records the
# platform's own captions with speaker names, and leaves when the call ends.
#
#   MeetingBot.configured?                       # RECALL_API_KEY is set
#   MeetingBot.create(meeting)                   # => bot id; joins at meeting.starts_at
#   MeetingBot.status(bot_id)                    # => { state: "recording", transcript_url: nil }
#   MeetingBot.transcript(url)                   # => [{ "speaker", "start", "text" }]
#   MeetingBot.cancel(bot_id)                    # before it joins; afterwards it's told to leave
#
# RECALL_REGION picks the API region (us-west-2 by default; also us-east-1,
# eu-central-1, ap-northeast-1). Failures raise MeetingBot::Error.
module MeetingBot
  NAME = "Nexora Notetaker".freeze
  # Recall needs scheduled bots booked at least 10 minutes ahead; closer than
  # that, the bot is sent straight away and waits in the call.
  SCHEDULE_AHEAD = 10.minutes

  # Recall's status codes -> ours. Anything unknown keeps the previous state.
  STATES = {
    "ready" => "scheduled",
    "joining_call" => "joining",
    "in_waiting_room" => "waiting_room",
    "in_call_not_recording" => "joining",
    "recording_permission_allowed" => "recording",
    "in_call_recording" => "recording",
    "call_ended" => "processing",
    "recording_done" => "processing",
    "done" => "done",
    "analysis_done" => "done",
    "fatal" => "failed",
    "recording_permission_denied" => "failed"
  }.freeze

  class Error < StandardError; end

  module_function

  def configured?
    ENV["RECALL_API_KEY"].present?
  end

  def base_url
    "https://#{ENV.fetch('RECALL_REGION', 'us-west-2')}.recall.ai/api/v1"
  end

  def create(meeting)
    body = {
      meeting_url: meeting.meeting_url,
      bot_name: NAME,
      recording_config: { transcript: { provider: { meeting_captions: {} } } },
      metadata: { nexora_meeting: meeting.uid }
    }
    body[:join_at] = meeting.starts_at.utc.iso8601 if meeting.starts_at > SCHEDULE_AHEAD.from_now
    request(:post, "/bot/", body)["id"] || raise(Error, "The notetaker service didn't return a bot.")
  end

  def status(bot_id)
    bot = request(:get, "/bot/#{bot_id}/")
    code = Array(bot["status_changes"]).last&.dig("code")
    recording = Array(bot["recordings"]).last || {}
    url = recording.dig("media_shortcuts", "transcript", "data", "download_url")
    { state: STATES[code], code: code, transcript_url: url, sub_code: Array(bot["status_changes"]).last&.dig("sub_code") }
  end

  # Recall's transcript is a list of turns: a participant and the words they said.
  def transcript(url)
    turns = fetch_json(url)
    Array(turns).filter_map do |turn|
      words = Array(turn["words"])
      text = words.map { |w| w["text"] }.join(" ").squish
      next if text.blank?

      { "speaker" => turn.dig("participant", "name").presence, "start" => words.first&.dig("start_timestamp", "relative").to_f.round(1), "text" => text }
    end
  end

  def cancel(bot_id)
    request(:delete, "/bot/#{bot_id}/")
  rescue Error
    # Already in the call: ask it to leave instead.
    request(:post, "/bot/#{bot_id}/leave_call/")
  end

  # Separate so tests can stand in for Recall.
  def request(method, path, body = nil)
    uri = URI("#{base_url}#{path}")
    req = { get: Net::HTTP::Get, post: Net::HTTP::Post, delete: Net::HTTP::Delete }.fetch(method).new(uri)
    req["Authorization"] = "Token #{ENV.fetch('RECALL_API_KEY')}"
    req["Accept"] = "application/json"
    if body
      req["Content-Type"] = "application/json"
      req.body = body.to_json
    end
    response = Net::HTTP.start(uri.host, uri.port, use_ssl: true, open_timeout: 10, read_timeout: 30) { |http| http.request(req) }
    return {} if response.body.blank?
    raise Error, "The notetaker service said #{response.code}." unless response.is_a?(Net::HTTPSuccess)

    JSON.parse(response.body)
  rescue SocketError, SystemCallError, IOError, Net::OpenTimeout, Net::ReadTimeout, OpenSSL::SSL::SSLError, JSON::ParserError, KeyError => e
    raise Error, "Couldn't reach the notetaker service (#{e.class.name.demodulize})."
  end

  def fetch_json(url)
    uri = URI(url)
    response = Net::HTTP.get_response(uri)
    raise Error, "The transcript couldn't be downloaded (#{response.code})." unless response.is_a?(Net::HTTPSuccess)

    JSON.parse(response.body)
  rescue SocketError, SystemCallError, IOError, Net::OpenTimeout, Net::ReadTimeout, OpenSSL::SSL::SSLError, JSON::ParserError, URI::InvalidURIError => e
    raise Error, "The transcript couldn't be downloaded (#{e.class.name.demodulize})."
  end
end
