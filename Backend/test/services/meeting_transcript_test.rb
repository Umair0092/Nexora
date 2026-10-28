require "test_helper"

class MeetingTranscriptTest < ActiveSupport::TestCase
  def word(text, start, finish = start + 0.3)
    { "word" => text, "start" => start, "end" => finish }
  end

  test "uses Whisper's segments when there are any" do
    result = { "segments" => [ { "start" => 1.24, "text" => " Hello there. " }, { "start" => 3, "text" => " " } ] }
    assert_equal [ { "speaker" => nil, "start" => 1.2, "text" => "Hello there." } ], MeetingTranscript.from_whisper(result)
  end

  test "otherwise starts a new line at a pause after a sentence" do
    words = [ word("Can", 0), word("you?", 0.4), word("Sure.", 1.6), word("I'd", 2.0), word("start", 2.3) ]
    lines = MeetingTranscript.from_whisper("words" => words)
    assert_equal [ "Can you?", "Sure. I'd start" ], lines.map { |l| l["text"] }
    assert_equal [ 0.0, 1.6 ], lines.map { |l| l["start"] }
  end

  test "no words, no segments: the whole text, or nothing" do
    assert_equal [ "Hi." ], MeetingTranscript.from_whisper("text" => "Hi.").map { |l| l["text"] }
    assert_empty MeetingTranscript.from_whisper("text" => "  ")
  end
end
