class ApplicationMailer < ActionMailer::Base
  default from: -> { ENV.fetch("MAIL_FROM", "Nexora <no-reply@nexora.local>") }
  layout "mailer"

  private

  # Links point at the web app (the gateway), not at Rails.
  def app_url(path)
    "#{ENV.fetch('APP_URL', 'http://127.0.0.1:5001').chomp('/')}#{path}"
  end
end
