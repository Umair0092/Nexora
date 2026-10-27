require "test_helper"

class LiveInterviewTest < ActiveSupport::TestCase
  setup do
    @user = User.create!(email: "live@example.com", password: "password123", first_name: "L", last_name: "I")
    @live = LiveInterview.start!(@user, QuizRun.build(category: "SQL", num_questions: 2))
  end

  test "open! saves the state when the block succeeds, and not when it raises" do
    LiveInterview.open!(@user, @live.id, "quiz") { |quiz| quiz.answer!("first", nil) }
    assert_equal 1, @live.reload.state["answered"]

    assert_raises(RuntimeError) do
      LiveInterview.open!(@user, @live.id, "quiz") do |quiz|
        quiz.answer!("second", nil)
        raise "boom"
      end
    end
    assert_equal 1, @live.reload.state["answered"]
  end

  test "open! only finds the owner's active interview of that kind" do
    other = User.create!(email: "other@example.com", password: "password123", first_name: "O", last_name: "U")
    assert_raises(LiveInterview::Expired) { LiveInterview.open!(other, @live.id, "quiz") { } }
    assert_raises(LiveInterview::Expired) { LiveInterview.open!(@user, @live.id, "cv") { } }
    assert_raises(LiveInterview::Expired) { LiveInterview.open!(@user, "1; DROP TABLE users", "quiz") { } }

    @live.update_columns(updated_at: (LiveInterview::TTL + 1.minute).ago)
    assert_raises(LiveInterview::Expired) { LiveInterview.open!(@user, @live.id, "quiz") { } }
  end

  test "using an interview keeps it alive, and the purge job removes idle ones" do
    @live.update_columns(updated_at: (LiveInterview::TTL - 1.minute).ago)
    LiveInterview.open!(@user, @live.id, "quiz") { nil }
    assert_operator @live.reload.updated_at, :>, 1.minute.ago

    idle = LiveInterview.start!(@user, QuizRun.build(category: "SQL", num_questions: 1))
    idle.update_columns(updated_at: (LiveInterview::TTL + 1.minute).ago)
    PurgeLiveInterviewsJob.perform_now
    assert_equal [ @live.id ], LiveInterview.pluck(:id)
  end

  test "each user keeps at most five of each kind" do
    6.times { LiveInterview.start!(@user, QuizRun.build(category: "SQL", num_questions: 1)) }
    assert_equal 5, @user.live_interviews.where(kind: "quiz").count
    assert_not LiveInterview.exists?(@live.id)
  end
end
