# Turns speech-to-text output into transcript entries: [{ "speaker", "start", "text" }].
module MeetingTranscript
  # Without segments, words are grouped into lines: a new line starts after a
  # pause (often a new speaker), or at the end of a sentence once a line is long.
  PAUSE_SECONDS = 0.3
  LONG_LINE_WORDS = 40
  MAX_LINE_SECONDS = 45

  module_function

  # Whisper's verbose_json has segments (sentences with times); recordings have
  # no speaker names, so `speaker` is nil and the minutes infer who's talking.
  def from_whisper(result)
    segments = Array(result["segments"]).select { |s| s.is_a?(Hash) && s["text"].to_s.strip.present? }
    return segments.map { |s| entry(s["start"], s["text"]) } if segments.any?

    words = Array(result["words"]).select { |w| w.is_a?(Hash) && w["word"].present? }
    return [ entry(0, result["text"]) ].reject { |e| e["text"].blank? } if words.empty?

    lines = words.each_with_object([ [] ]) do |word, out|
      line = out.last
      if line.any? && break_before?(line, word)
        out << [ word ]
      else
        line << word
      end
    end
    lines.map { |line| entry(line.first["start"], line.map { |w| w["word"] }.join(" ")) }
  end

  def break_before?(line, word)
    previous = line.last
    pause = word["start"].to_f - previous["end"].to_f
    sentence_end = previous["word"].to_s.match?(/[.?!]\z/)
    (pause >= PAUSE_SECONDS && sentence_end) || (sentence_end && line.size >= LONG_LINE_WORDS) ||
      word["start"].to_f - line.first["start"].to_f > MAX_LINE_SECONDS
  end

  def entry(start, text)
    { "speaker" => nil, "start" => start.to_f.round(1), "text" => text.to_s.squish }
  end
end
