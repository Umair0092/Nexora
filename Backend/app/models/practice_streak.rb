# Streaks and weekly progress from the times a user finished interviews, counted
# in the user's own timezone (sent by the browser).
#
#   streak = PracticeStreak.new(times, ActiveSupport::TimeZone["Asia/Karachi"])
#   streak.current   # consecutive days with practice, ending today or yesterday
#   streak.longest
#   streak.this_week # interviews since Monday
class PracticeStreak
  def initialize(times, zone, now: Time.current)
    @zone = zone
    @today = now.in_time_zone(zone).to_date
    @times = times.compact.map { |t| t.in_time_zone(zone) }
    @days = @times.map(&:to_date).uniq.sort
  end

  def current
    return 0 if @days.empty?

    # A streak is still alive until a whole day passes without practice.
    return 0 if @days.last < @today - 1

    count = 1
    count += 1 while @days.include?(@days.last - count)
    count
  end

  def longest
    best = run = 0
    @days.each_with_index do |day, i|
      run = i.positive? && @days[i - 1] == day - 1 ? run + 1 : 1
      best = [ best, run ].max
    end
    best
  end

  def this_week
    week_start = @today.beginning_of_week(:monday)
    @times.count { |t| t.to_date >= week_start && t.to_date <= @today }
  end

  def practiced_today?
    @days.last == @today
  end
end
