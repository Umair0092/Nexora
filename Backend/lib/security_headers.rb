# Security headers on every response, including static files from public/.
# The CSP allows MediaPipe's WebAssembly (camera analysis runs in the browser)
# and the Google Fonts stylesheet. HTML is never cached, so a deploy reaches
# browsers straight away; hashed assets keep their long cache.
class SecurityHeaders
  CSP = [
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join("; ").freeze

  HEADERS = {
    "x-content-type-options" => "nosniff",
    "x-frame-options" => "DENY",
    "referrer-policy" => "strict-origin-when-cross-origin",
    "permissions-policy" => "camera=(self), microphone=(self), geolocation=()",
    "content-security-policy" => CSP
  }.freeze

  def initialize(app)
    @app = app
  end

  def call(env)
    status, headers, body = @app.call(env)
    HEADERS.each { |name, value| headers[name] = value }
    headers["cache-control"] = "no-cache" if headers["content-type"].to_s.start_with?("text/html")
    [ status, headers, body ]
  end
end
