class UserMailer < ApplicationMailer
  def email_verification(user)
    @user = user
    @url = app_url("/verify-email?token=#{CGI.escape(user.generate_token_for(:email_verification))}")
    mail(to: user.email, subject: "Confirm your email for Nexora")
  end

  def password_reset(user)
    @user = user
    @url = app_url("/reset-password?token=#{CGI.escape(user.generate_token_for(:password_reset))}")
    mail(to: user.email, subject: "Reset your Nexora password")
  end

  def practice_reminder(user)
    @user = user
    @last_practiced_at = user.last_practiced_at
    @url = app_url("/interview/setup")
    @unsubscribe_url = app_url("/unsubscribe?token=#{CGI.escape(user.generate_token_for(:unsubscribe))}")
    headers["List-Unsubscribe"] = "<#{@unsubscribe_url}>"
    mail(to: user.email, subject: "A 10-minute interview to keep your streak going")
  end
end
