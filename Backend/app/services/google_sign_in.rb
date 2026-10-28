# "Continue with Google" for teammates and candidates practising. Uses the same
# OAuth client as Google Calendar (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET), with
# its own redirect URI: APP_URL + /api/v1/auth/google/callback.
#
#   GoogleSignIn.authorize_url(state:)   # where to send the browser
#   GoogleSignIn.profile(code:)          # => { email:, first_name:, last_name: } (verified emails only)
module GoogleSignIn
  module_function

  def configured?
    GoogleCalendar.configured?
  end

  def redirect_uri
    ApplicationMailer.app_url("/api/v1/auth/google/callback")
  end

  def authorize_url(state:)
    query = { client_id: ENV["GOOGLE_CLIENT_ID"], redirect_uri: redirect_uri, response_type: "code", scope: "openid email profile",
              prompt: "select_account", state: state }
    "#{GoogleCalendar::AUTH_URL}?#{query.to_query}"
  end

  def profile(code:)
    tokens = GoogleCalendar.request(:post, GoogleCalendar::TOKEN_URL,
                                    form: { code: code, client_id: ENV["GOOGLE_CLIENT_ID"], client_secret: ENV["GOOGLE_CLIENT_SECRET"],
                                            redirect_uri: redirect_uri, grant_type: "authorization_code" })
    claims = claims(tokens["id_token"])
    raise GoogleCalendar::Error, "Google didn't confirm this email address." unless claims["email"].present? && claims["email_verified"] == true
    raise GoogleCalendar::Error, "This sign-in wasn't meant for Nexora." unless claims["aud"] == ENV["GOOGLE_CLIENT_ID"]

    { email: claims["email"].downcase, first_name: claims["given_name"].to_s.first(50), last_name: claims["family_name"].to_s.first(50) }
  end

  # Read straight from Google's token endpoint over TLS, so the signature needn't be checked.
  def claims(id_token)
    payload = id_token.to_s.split(".")[1].to_s
    JSON.parse(Base64.urlsafe_decode64(payload + "=" * (-payload.length % 4)))
  rescue ArgumentError, JSON::ParserError
    {}
  end
end
