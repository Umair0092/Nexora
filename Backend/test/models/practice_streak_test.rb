require "test_helper"

class PracticeStreakTest < ActiveSupport::TestCase
  KARACHI = ActiveSupport::TimeZone["Asia/Karachi"] # UTC+5

  def streak(times, now: KARACHI.parse("2026-10-28 10:00"), zone: KARACHI)
    PracticeStreak.new(times, zone, now: now)
  end

  test "empty history" do
    s = streak([])
    assert_equal [ 0, 0, 0, false ], [ s.current, s.longest, s.this_week, s.practiced_today? ]
  end

  test "counts consecutive days ending today" do
    s = streak([ "2026-10-28 09:00", "2026-10-27 22:00", "2026-10-27 08:00", "2026-10-26 12:00", "2026-10-24 12:00" ].map { KARACHI.parse(_1) })
    assert_equal 3, s.current
    assert_equal 3, s.longest
    assert s.practiced_today?
  end

  test "a streak survives until a whole day is missed" do
    yesterday = [ KARACHI.parse("2026-10-27 20:00"), KARACHI.parse("2026-10-26 20:00") ]
    assert_equal 2, streak(yesterday).current
    assert_equal 0, streak(yesterday, now: KARACHI.parse("2026-10-29 00:30")).current
    assert_equal 2, streak(yesterday, now: KARACHI.parse("2026-10-29 00:30")).longest
  end

  test "days follow the user's timezone, not UTC" do
    # 20:30 UTC on the 27th is already the 28th in Karachi.
    times = [ Time.utc(2026, 10, 27, 20, 30), Time.utc(2026, 10, 27, 5, 0) ]
    assert_equal 2, streak(times, now: Time.utc(2026, 10, 28, 6)).current
    assert_equal 1, streak(times, now: Time.utc(2026, 10, 28, 6), zone: ActiveSupport::TimeZone["UTC"]).current
  end

  test "this week counts interviews since Monday" do
    # 2026-10-26 is a Monday.
    times = [ "2026-10-25 12:00", "2026-10-26 09:00", "2026-10-26 18:00", "2026-10-28 08:00" ].map { KARACHI.parse(_1) }
    assert_equal 3, streak(times).this_week
  end

  test "longest finds the best run in the past" do
    days = %w[2026-10-01 2026-10-02 2026-10-03 2026-10-04 2026-10-10 2026-10-27].map { KARACHI.parse("#{_1} 12:00") }
    s = streak(days)
    assert_equal 4, s.longest
    assert_equal 1, s.current
  end
end
