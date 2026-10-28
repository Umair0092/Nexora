require "test_helper"

class UserMailerTest < ActionMailer::TestCase
  include ApiTestHelpers
  setup do
    @user = create_user(email: "sam@example.com", first_name: "Sam")
  end

  test "email verification links to a token that verifies this user" do
    mail = UserMailer.email_verification(@user)
    assert_equal [ "sam@example.com" ], mail.to
    assert_equal "Confirm your email for Nexora", mail.subject

    token = CGI.unescape(mail.text_part.body.to_s[%r{/verify-email\?token=(\S+)}, 1])
    assert_equal @user, User.find_by_token_for(:email_verification, token)
    assert_includes mail.html_part.body.to_s, "/verify-email?token="
  end

  test "password reset links to a token that stops working once the password changes" do
    mail = UserMailer.password_reset(@user)
    token = CGI.unescape(mail.text_part.body.to_s[%r{/reset-password\?token=(\S+)}, 1])
    assert_equal @user, User.find_by_token_for(:password_reset, token)

    @user.update!(password: "a-new-password-1")
    assert_nil User.find_by_token_for(:password_reset, token)
  end

  test "practice reminder carries a one-click unsubscribe header" do
    mail = UserMailer.practice_reminder(@user)
    assert_match %r{\A<http.+/unsubscribe\?token=.+>\z}, mail["List-Unsubscribe"].to_s
    assert_includes mail.text_part.body.to_s, "/interview/setup"
  end
end
