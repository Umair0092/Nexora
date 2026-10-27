require "test_helper"

class SpeechMetricsTest < ActiveSupport::TestCase
  def words(*tokens, gap: 0.2)
    t = 0.0
    tokens.map do |token|
      w = { "word" => token, "start" => t, "end" => t + 0.3 }
      t += 0.3 + (token.end_with?("…") ? 2.5 : gap)
      w
    end
  end

  test "counts hesitations always, and like/so/you know only as asides" do
    result = SpeechMetrics.compute(words("Um,", "I", "like", "Rails,", "so", "I", "mean,", "like,", "you", "know,", "it", "works.", "So,", "basically", "yes."), nil, "")
    assert_equal({ "um" => 1, "i mean" => 1, "like" => 1, "you know" => 1, "so" => 1, "basically" => 1 }, result["fillers"])
    assert_equal 6, result["filler_count"]
  end

  test "pace and pauses come from word timestamps" do
    result = SpeechMetrics.compute(words("I", "rebuilt…", "the", "queue."), nil, "")
    assert_equal 4, result["word_count"]
    assert_equal 1, result["long_pauses"]
    assert_equal 2.5, result["longest_pause_seconds"]
    assert_equal 4.1, result["duration_seconds"]
    assert_equal 59, result["words_per_minute"]
  end

  test "without timestamps it falls back to the text and duration" do
    result = SpeechMetrics.compute(nil, 30, "um I think so")
    assert_equal({ "duration_seconds" => 30.0, "word_count" => 4, "words_per_minute" => 8, "filler_count" => 1,
                   "fillers" => { "um" => 1 }, "long_pauses" => 0, "longest_pause_seconds" => 0.0 }, result)
    assert_nil SpeechMetrics.compute(nil, 1, "too short")["words_per_minute"]
  end

  test "sanitize clamps browser-supplied metrics" do
    clean = SpeechMetrics.sanitize("duration_seconds" => "Infinity", "word_count" => 1e9, "fillers" => { "um" => "3", "" => 5 })
    assert_equal 0.0, clean["duration_seconds"]
    assert_equal 20_000, clean["word_count"]
    assert_equal({ "um" => 3 }, clean["fillers"])
    assert_nil SpeechMetrics.sanitize("not a hash")
  end
end
