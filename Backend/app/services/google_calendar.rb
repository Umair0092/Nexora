require "net/http"

# Google Calendar for interview scheduling: OAuth for each teammate, then events
# with a Google Meet link. Google emails the invitations itself (sendUpdates=all).
#
#   GoogleCalendar.configured?                        # GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set
#   GoogleCalendar.authorize_url(state:)              # where to send the teammate to connect
#   GoogleCalendar.connect!(user, code:)              # stores a CalendarConnection
#   GoogleCalendar.create_event(connection, meeting)  # => { id:, meet_url: }
#   GoogleCalendar.update_event(connection, meeting)
#   GoogleCalendar.cancel_event(connection, meeting)
#
# Failures raise GoogleCalendar::Error with a message safe to show.
module GoogleCalendar
  AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth".freeze
  TOKEN_URL = "https://oauth2.googleapis.com/token".freeze
  REVOKE_URL = "https://oauth2.googleapis.com/revoke".freeze
  EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events".freeze
  SCOPES = "openid email https://www.googleapis.com/auth/calendar.events".freeze

  class Error < StandardError; end

  module_function

  def configured?
    ENV["GOOGLE_CLIENT_ID"].present? && ENV["GOOGLE_CLIENT_SECRET"].present?
  end

  def redirect_uri
    ApplicationMailer.app_url("/api/v1/calendar/google/callback")
  end

  def authorize_url(state:)
    query = { client_id: ENV["GOOGLE_CLIENT_ID"], redirect_uri: redirect_uri, response_type: "code", scope: SCOPES,
              access_type: "offline", prompt: "consent", include_granted_scopes: "true", state: state }
    "#{AUTH_URL}?#{query.to_query}"
  end

  def connect!(user, code:)
    tokens = request(:post, TOKEN_URL, form: { code: code, client_id: ENV["GOOGLE_CLIENT_ID"], client_secret: ENV["GOOGLE_CLIENT_SECRET"],
                                               redirect_uri: redirect_uri, grant_type: "authorization_code" })
    email = id_token_email(tokens["id_token"])
    raise Error, "Google didn't share the account's email address." if email.blank?

    connection = user.calendar_connection || user.build_calendar_connection
    connection.update!(provider: "google", email: email, access_token: tokens["access_token"],
                       refresh_token: tokens["refresh_token"].presence || connection.refresh_token,
                       expires_at: Time.current + tokens["expires_in"].to_i.seconds)
    connection
  end

  def disconnect!(connection)
    request(:post, REVOKE_URL, form: { token: connection.refresh_token || connection.access_token })
  rescue Error
    # Already revoked on Google's side; forget it here regardless.
  ensure
    connection.destroy!
  end

  def create_event(connection, meeting)
    body = event_body(meeting).merge(conferenceData: { createRequest: { requestId: meeting.uid, conferenceSolutionKey: { type: "hangoutsMeet" } } })
    event = request(:post, "#{EVENTS_URL}?conferenceDataVersion=1&sendUpdates=all", json: body, token: access_token(connection))
    meet = event["hangoutLink"].presence ||
           Array(event.dig("conferenceData", "entryPoints")).find { |e| e["entryPointType"] == "video" }&.dig("uri")
    { id: event["id"], meet_url: meet }
  end

  def update_event(connection, meeting)
    request(:patch, "#{EVENTS_URL}/#{CGI.escape(meeting.google_event_id)}?sendUpdates=all", json: event_body(meeting), token: access_token(connection))
  end

  def cancel_event(connection, meeting)
    request(:delete, "#{EVENTS_URL}/#{CGI.escape(meeting.google_event_id)}?sendUpdates=all", token: access_token(connection))
  end

  def event_body(meeting)
    {
      summary: meeting.title,
      description: meeting.agenda,
      start: { dateTime: meeting.starts_at.in_time_zone(meeting.zone).iso8601, timeZone: meeting.time_zone },
      end: { dateTime: meeting.ends_at.in_time_zone(meeting.zone).iso8601, timeZone: meeting.time_zone },
      attendees: meeting.attendees.map { |email| { email: email } },
      reminders: { useDefault: true }
    }
  end

  # Refreshes the token a minute before it runs out.
  def access_token(connection)
    return connection.access_token if connection.expires_at.present? && connection.expires_at > 1.minute.from_now
    raise Error, "Reconnect Google Calendar on your Account page." if connection.refresh_token.blank?

    tokens = request(:post, TOKEN_URL, form: { refresh_token: connection.refresh_token, client_id: ENV["GOOGLE_CLIENT_ID"],
                                               client_secret: ENV["GOOGLE_CLIENT_SECRET"], grant_type: "refresh_token" })
    connection.update!(access_token: tokens["access_token"], expires_at: Time.current + tokens["expires_in"].to_i.seconds)
    connection.access_token
  end

  # The id_token comes straight from Google's token endpoint over TLS, so its
  # payload can be read without checking the signature (Google's guidance).
  def id_token_email(id_token)
    payload = id_token.to_s.split(".")[1]
    payload && JSON.parse(Base64.urlsafe_decode64(payload + "=" * (-payload.length % 4)))["email"]
  rescue ArgumentError, JSON::ParserError
    nil
  end

  # Separate so tests can stand in for Google.
  def request(method, url, form: nil, json: nil, token: nil)
    uri = URI(url)
    req = { post: Net::HTTP::Post, patch: Net::HTTP::Patch, delete: Net::HTTP::Delete }.fetch(method).new(uri)
    req["Authorization"] = "Bearer #{token}" if token
    if form
      req.set_form_data(form)
    elsif json
      req["Content-Type"] = "application/json"
      req.body = json.to_json
    end
    response = Net::HTTP.start(uri.host, uri.port, use_ssl: true, open_timeout: 10, read_timeout: 20) { |http| http.request(req) }
    return {} if response.is_a?(Net::HTTPNoContent) || response.body.blank?

    data = JSON.parse(response.body)
    return data if response.is_a?(Net::HTTPSuccess)

    Rails.logger.error("Google #{uri.path} -> #{response.code}: #{data.dig('error', 'message') || data['error']}")
    raise Error, response.code.to_i == 401 ? "Google Calendar access has expired. Reconnect it on your Account page." : "Google Calendar didn't accept the request. Try again in a minute."
  rescue SocketError, SystemCallError, IOError, Net::OpenTimeout, Net::ReadTimeout, OpenSSL::SSL::SSLError, JSON::ParserError
    raise Error, "Couldn't reach Google Calendar. Try again in a minute."
  end
end
