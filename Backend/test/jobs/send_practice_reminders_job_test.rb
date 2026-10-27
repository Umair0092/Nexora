require "test_helper"

class SendPracticeRemindersJobTest < ActiveJob::TestCase
  include ActionMailer::TestHelper
  include ApiTestHelpers

  setup do
    ActionMailer::Base.deliveries.clear
    @domain = Domain.for_interview_type!("cv")
  end

  def user(email, verified: true, reminders: true, **attrs)
    create_user(email: email, reminders_enabled: reminders, email_verified_at: verified ? 1.week.ago : nil, **attrs)
  end

  def practised(user, at)
    user.interview_sessions.create!(domain: @domain, status: "completed", started_at: at, completed_at: at)
  end

  test "reminds only opted-in, verified users who haven't practised lately" do
    due = user("due@example.com")
    practised(due, 5.days.ago)
    never = user("never@example.com")
    recent = user("recent@example.com")
    practised(recent, 1.day.ago)
    user("unverified@example.com", verified: false)
    user("off@example.com", reminders: false)
    user("reminded@example.com", last_reminded_at: 1.day.ago)

    assert_equal 2, SendPracticeRemindersJob.perform_now
    assert_equal %w[due@example.com never@example.com], ActionMailer::Base.deliveries.flat_map(&:to).sort

    mail = ActionMailer::Base.deliveries.find { |m| m.to == [ "due@example.com" ] }
    assert_match "5 days ago", mail.text_part.decoded
    assert_match %r{/unsubscribe\?token=}, mail.text_part.decoded
    assert mail.header["List-Unsubscribe"].present?
    assert_in_delta Time.current, due.reload.last_reminded_at, 5
  end

  test "does not remind again within three days" do
    user("due@example.com")
    assert_equal 1, SendPracticeRemindersJob.perform_now
    assert_equal 0, SendPracticeRemindersJob.perform_now
    travel 3.days + 1.minute do
      assert_equal 1, SendPracticeRemindersJob.perform_now
    end
  end

  test "one failing email doesn't stop the rest" do
    user("a@example.com")
    user("b@example.com")
    calls = 0
    real = UserMailer.method(:practice_reminder)
    UserMailer.stub(:practice_reminder, ->(u) { (calls += 1) == 1 ? raise("smtp down") : real.call(u) }) do
      assert_equal 1, SendPracticeRemindersJob.perform_now
    end
  end
end
