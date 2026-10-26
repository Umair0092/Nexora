class JsonWebToken
  ALGORITHM = "HS256".freeze

  def self.secret_key
    ENV["JWT_SECRET"].presence || Rails.application.secret_key_base
  end

  def self.encode(payload, exp = 24.hours.from_now)
    payload = payload.dup
    payload[:exp] = exp.to_i
    JWT.encode(payload, secret_key, ALGORITHM)
  end

  def self.decode(token)
    return nil if token.blank?

    body = JWT.decode(token, secret_key, true, algorithm: ALGORITHM)[0]
    HashWithIndifferentAccess.new body
  rescue JWT::ExpiredSignature, JWT::DecodeError
    nil
  end
end
