# Emails one practice reminder to each user who opted in, has a confirmed email,
# and hasn't practised (or been reminded) for User::REMINDER_GAP.
# Scheduled daily in config/recurring.yml; also runnable with `bin/rails nexora:send_reminders`.
class SendPracticeRemindersJob < ApplicationJob
  queue_as :default

  def perform(now: Time.current)
    sent = 0
    User.due_for_reminder(now).find_each do |user|
      UserMailer.practice_reminder(user).deliver_now
      user.update_column(:last_reminded_at, now)
      sent += 1
    rescue StandardError => e
      Rails.logger.error("Practice reminder to user #{user.id} failed: #{e.class}: #{e.message}")
    end
    Rails.logger.info("[reminders] sent #{sent}")
    sent
  end
end
