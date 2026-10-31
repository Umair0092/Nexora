module Api
  module V1
    # Sign in with Google.
    #
    #   GET  /api/v1/auth/providers         -> { google: true|false }
    #   POST /api/v1/auth/google            { next, accountType } -> { url }; sets a short-lived browser cookie
    #   GET  /api/v1/auth/google/callback   (Google redirects here) -> /auth/google#code=...
    #   POST /api/v1/auth/google/exchange   { code } -> { token, user }
    #
    # The state is signed and tied to the cookie from the browser that started, so
    # nobody can log someone else into their own account (login CSRF). The code
    # handed back lasts two minutes and travels in the URL fragment, which isn't
    # sent to servers or written to logs.
    class GoogleAuthController < ApplicationController
      include ActionController::Cookies

      skip_before_action :authenticate_request
      rate_limit to: 20, within: 10.minutes, only: [ :start, :exchange ], name: "google-auth",
                 store: AuthController::RATE_LIMIT_STORE, with: AuthController::RATE_LIMIT_RESPONSE

      COOKIE = :nexora_google_nonce
      CODE_TTL = 2.minutes

      def providers
        render json: { google: GoogleSignIn.configured? }
      end

      def start
        return render(json: { error: "Google sign-in isn't set up on this server." }, status: :unprocessable_entity) unless GoogleSignIn.configured?

        nonce = SecureRandom.hex(16)
        cookies.encrypted[COOKIE] = { value: nonce, expires: 10.minutes, httponly: true, same_site: :lax, secure: request.ssl? }
        account_type = User::ACCOUNT_TYPES.include?(params[:accountType]) ? params[:accountType] : "candidate"
        state = verifier.generate({ "nonce" => nonce, "next" => safe_next(params[:next]), "account_type" => account_type },
                                  expires_in: 10.minutes, purpose: :google_sign_in)
        render json: { url: GoogleSignIn.authorize_url(state: state) }
      end

      def callback
        state = verifier.verified(params[:state].to_s, purpose: :google_sign_in)
        nonce = cookies.encrypted[COOKIE]
        cookies.delete(COOKIE)
        return redirect_to("/auth?error=google") unless state && nonce.present? && ActiveSupport::SecurityUtils.secure_compare(state["nonce"], nonce)

        user = find_or_create(GoogleSignIn.profile(code: params[:code].to_s), account_type: state["account_type"] || "candidate")
        code = verifier.generate({ "user" => user.id, "jti" => user.jti }, expires_in: CODE_TTL, purpose: :google_code)
        redirect_to "/auth/google##{{ code: code, next: state['next'] }.to_query}"
      rescue GoogleCalendar::Error, ActiveRecord::RecordInvalid
        redirect_to "/auth?error=google"
      end

      def exchange
        data = verifier.verified(params[:code].to_s, purpose: :google_code)
        user = data && User.find_by(id: data["user"], jti: data["jti"])
        return render(json: { error: "That sign-in link has expired. Try again." }, status: :unauthorized) unless user

        render json: { token: JsonWebToken.encode(user_id: user.id), user: UserSerializer.call(user) }
      end

      private

      # Existing accounts are matched by email and keep their type; a new one is
      # verified already, since Google confirmed it.
      def find_or_create(profile, account_type:)
        user = User.find_by(email: profile[:email]) || User.create!(email: profile[:email], password: SecureRandom.base58(32),
                                                                    first_name: profile[:first_name].presence,
                                                                    last_name: profile[:last_name].presence,
                                                                    account_type: account_type,
                                                                    email_verified_at: Time.current)
        user.update!(email_verified_at: Time.current) unless user.email_verified_at
        user.update!(jti: SecureRandom.uuid) if user.jti.blank?
        user
      end

      def safe_next(path)
        path = path.to_s
        path.start_with?("/") && !path.start_with?("//") ? path : "/"
      end

      def verifier
        Rails.application.message_verifier("google-sign-in")
      end
    end
  end
end
