require "test_helper"

class SpaTest < ActionDispatch::IntegrationTest
  INDEX = Rails.public_path.join("index.html")

  setup do
    @created = !INDEX.exist?
    File.write(INDEX, "<!doctype html><div id=\"root\"></div>") if @created
  end

  teardown do
    INDEX.delete if @created && INDEX.exist?
  end

  test "page URLs get the React app with security headers and no caching" do
    [ "/", "/dashboard", "/report/12?x=1" ].each do |path|
      get path, headers: { "Accept" => "text/html" }
      assert_response :ok
      assert_includes response.body, %(id="root")
      assert_equal "text/html", response.media_type
      assert_equal "no-cache", response.headers["cache-control"]
      assert_equal "DENY", response.headers["x-frame-options"]
      assert_includes response.headers["content-security-policy"], "'wasm-unsafe-eval'"
    end
  end

  test "unknown API paths stay JSON 404s" do
    get "/api/v1/nope", headers: { "Accept" => "text/html" }
    assert_response :not_found
    assert_not_includes response.body, %(id="root")
  end
end
