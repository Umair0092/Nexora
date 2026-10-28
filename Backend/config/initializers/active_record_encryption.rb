# Keys for `encrypts` (calendar tokens). Set the ACTIVE_RECORD_ENCRYPTION_* variables to manage
# them yourself; otherwise they're derived from SECRET_KEY_BASE, so rotating that secret makes
# stored tokens unreadable and people reconnect their calendars.
Rails.application.config.to_prepare do
  generator = ActiveSupport::KeyGenerator.new(Rails.application.secret_key_base, iterations: 1000)
  derive = ->(name) { generator.generate_key("active_record_encryption.#{name}", 32).unpack1("H*") }

  ActiveRecord::Encryption.configure(
    primary_key: ENV["ACTIVE_RECORD_ENCRYPTION_PRIMARY_KEY"].presence || derive.call("primary_key"),
    deterministic_key: ENV["ACTIVE_RECORD_ENCRYPTION_DETERMINISTIC_KEY"].presence || derive.call("deterministic_key"),
    key_derivation_salt: ENV["ACTIVE_RECORD_ENCRYPTION_KEY_DERIVATION_SALT"].presence || derive.call("key_derivation_salt")
  )
end
