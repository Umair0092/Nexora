# Outgoing mail. Set SMTP_ADDRESS (plus SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD) to
# send real email, e.g. through Brevo, Resend or a Gmail app password. Without it,
# outside tests, each email is written to tmp/mails/<recipient> and its links are
# logged, so password resets still work on a local setup.
unless Rails.env.test?
  Rails.application.configure do
    if ENV["SMTP_ADDRESS"].present?
      config.action_mailer.delivery_method = :smtp
      config.action_mailer.raise_delivery_errors = true
      config.action_mailer.smtp_settings = {
        address: ENV["SMTP_ADDRESS"],
        port: ENV.fetch("SMTP_PORT", 587).to_i,
        user_name: ENV["SMTP_USERNAME"].presence,
        password: ENV["SMTP_PASSWORD"].presence,
        authentication: ENV["SMTP_USERNAME"].present? ? :plain : nil,
        enable_starttls_auto: true
      }.compact
    else
      config.action_mailer.delivery_method = :file
      config.action_mailer.file_settings = { location: Rails.root.join("tmp/mails") }
    end
  end

  ActiveSupport.on_load(:action_mailer) do
    next if ENV["SMTP_ADDRESS"].present?

    ActionMailer::Base.register_observer(Class.new do
      def self.delivered_email(message)
        links = message.text_part&.decoded.to_s.scan(%r{https?://\S+})
        Rails.logger.info("[mail] #{message.subject} -> #{Array(message.to).join(', ')} (SMTP not configured; saved to tmp/mails) #{links.join(' ')}")
      end
    end)
  end
end
