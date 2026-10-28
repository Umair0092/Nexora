require "test_helper"

class CalendarInviteTest < ActiveSupport::TestCase
  test "escapes text and folds long lines as RFC 5545 asks" do
    assert_equal "a\\, b\; c\\\\ d\\ne", CalendarInvite.escape("a, b; c\\ d\ne")

    folded = CalendarInvite.fold("DESCRIPTION:" + "x" * 200)
    lines = folded.split("\r\n")
    assert lines.all? { |l| l.bytesize <= 75 }
    assert lines.drop(1).all? { |l| l.start_with?(" ") }
    assert_equal "DESCRIPTION:" + "x" * 200, lines.first + lines.drop(1).map { |l| l[1..] }.join
  end

  test "folding never splits a multi-byte character" do
    folded = CalendarInvite.fold("SUMMARY:" + "é" * 60)
    assert folded.split("\r\n").all?(&:valid_encoding?)
  end
end
