class ApplicationMailer < ActionMailer::Base
  default from: -> { ENV.fetch("MAIL_FROM", "Nexora <no-reply@nexora.local>") }
  layout "mailer"

  # Links in emails point at the public address of the app. Render sets
  # RENDER_EXTERNAL_URL; APP_URL wins when you add your own domain.
  def self.app_url(path)
    base = ENV["APP_URL"].presence || ENV["RENDER_EXTERNAL_URL"].presence || "http://127.0.0.1:5001"
    "#{base.chomp('/')}#{path}"
  end

  private

  def app_url(path)
    self.class.app_url(path)
  end
end
