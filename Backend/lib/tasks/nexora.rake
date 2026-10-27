namespace :nexora do
  desc "Send practice reminder emails now (normally run daily by Solid Queue)"
  task send_reminders: :environment do
    puts "Sent #{SendPracticeRemindersJob.perform_now} reminder(s)"
  end
end
