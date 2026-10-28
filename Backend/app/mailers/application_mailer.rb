class ApplicationMailer < ActionMailer::Base
  default from: -> { ENV.fetch("MAIL_FROM", "Nexora <no-reply@nexora.local>") }
  layout "mailer"

  # Links in emails point at the public address of the app.
  def self.app_url(path)
    "#{ENV.fetch('APP_URL', 'http://127.0.0.1:5001').chomp('/')}#{path}"
  end

  private

  def app_url(path)
    self.class.app_url(path)
  end
end
