require "resolv"
require "ipaddr"

# Webhook addresses are chosen by customers, so the server must never be tricked
# into calling itself or a private network (SSRF). An address is allowed only if
# every IP its host resolves to is public; callers connect to that checked IP.
module SafeUrl
  BLOCKED = %w[
    0.0.0.0/8 10.0.0.0/8 100.64.0.0/10 127.0.0.0/8 169.254.0.0/16 172.16.0.0/12 192.0.0.0/24
    192.168.0.0/16 198.18.0.0/15 224.0.0.0/4 240.0.0.0/4 ::/128 ::1/128 fc00::/7 fe80::/10 ff00::/8
  ].map { |cidr| IPAddr.new(cidr) }.freeze

  module_function

  def public?(url)
    resolve(url).present?
  end

  # => the public IPs for the URL's host, or [] when any of them is private.
  def resolve(url)
    uri = URI.parse(url.to_s)
    return [] unless uri.is_a?(URI::HTTPS) && uri.host.present?

    ips = addresses(uri.host)
    ips.any? && ips.none? { |ip| blocked?(ip) } ? ips : []
  rescue URI::InvalidURIError, IPAddr::InvalidAddressError
    []
  end

  def addresses(host)
    host = host.delete_prefix("[").delete_suffix("]")
    return [ host ] if host.match?(Resolv::IPv4::Regex) || host.match?(Resolv::IPv6::Regex)

    Resolv.getaddresses(host)
  end

  def blocked?(ip)
    addr = IPAddr.new(ip)
    addr = addr.native if addr.ipv4_mapped?
    BLOCKED.any? { |range| range.include?(addr) }
  end
end
