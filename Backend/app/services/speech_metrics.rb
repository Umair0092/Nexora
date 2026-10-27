# Delivery metrics for one spoken answer, computed from Whisper word timestamps.
#
#   SpeechMetrics.compute(words, duration, text) # => {
#     "duration_seconds" => 41.2,     # first word start to last word end
#     "word_count" => 96,
#     "words_per_minute" => 140,
#     "filler_count" => 5,
#     "fillers" => { "um" => 3, "you know" => 2 },
#     "long_pauses" => 1,             # silences of LONG_PAUSE_SECONDS or more
#     "longest_pause_seconds" => 2.8
#   }
module SpeechMetrics
  LONG_PAUSE_SECONDS = 2.0

  # Hesitation sounds plus the verbal tics interviewers notice most. Ambiguous
  # words ("like", "so") only count where Whisper marks them as asides with a
  # following comma, e.g. "we had to, like, rebuild it".
  FILLER_WORDS = {
    "um" => "um", "umm" => "um", "uh" => "uh", "uhh" => "uh", "uhm" => "um", "er" => "er", "erm" => "um",
    "ah" => "ah", "hmm" => "hmm", "mm" => "hmm", "basically" => "basically", "literally" => "literally",
    "actually" => "actually"
  }.freeze
  COMMA_FILLERS = { "like" => "like", "so" => "so" }.freeze
  FILLER_PHRASES = { %w[you know] => "you know", %w[i mean] => "i mean" }.freeze

  INT_KEYS = %w[word_count words_per_minute filler_count long_pauses].freeze
  FLOAT_KEYS = %w[duration_seconds longest_pause_seconds].freeze

  # Whisper keeps disfluencies when its prompt contains them (English only).
  WHISPER_PROMPT = "Umm, let me think like, hmm... Okay, here's what I'm, like, thinking. Uh, so, you know.".freeze

  module_function

  # `words` are hashes with "word", "start" and "end" (seconds).
  def compute(words, duration, text)
    timed = Array(words).filter_map do |w|
      next unless w.is_a?(Hash)

      token, start, finish = w.values_at("word", "start", "end")
      start = Float(start.to_s, exception: false)
      finish = Float(finish.to_s, exception: false)
      [ token.to_s.strip, start, finish ] if token.present? && start && finish
    end

    if timed.any?
      tokens = timed.map(&:first)
      span = [ timed.last[2] - timed.first[1], 0.0 ].max
      gaps = timed.each_cons(2).map { |cur, nxt| nxt[1] - cur[2] }
    else
      tokens = text.to_s.split
      span = Float(duration.to_s, exception: false) || 0.0
      gaps = []
    end

    fillers = count_fillers(tokens)
    minutes = span.positive? ? span / 60 : 0
    {
      "duration_seconds" => span.round(1, half: :even),
      "word_count" => tokens.size,
      "words_per_minute" => minutes >= 0.05 ? (tokens.size / minutes).round(half: :even) : nil,
      "filler_count" => fillers.values.sum,
      "fillers" => fillers,
      "long_pauses" => gaps.count { |g| g >= LONG_PAUSE_SECONDS },
      "longest_pause_seconds" => gaps.any? ? gaps.max.round(1, half: :even) : 0.0
    }
  end

  # Metrics sent back by the browser, clamped to sane ranges; nil if not a hash.
  def sanitize(raw)
    raw = raw.to_unsafe_h if raw.respond_to?(:to_unsafe_h)
    return nil unless raw.is_a?(Hash)

    raw = raw.stringify_keys
    fillers = (raw["fillers"].is_a?(Hash) ? raw["fillers"] : {}).first(10).each_with_object({}) do |(word, count), h|
      word = word.to_s.strip.truncate(30)
      h[word] = number(count)&.round&.clamp(0, 5000) || 0 if word.present?
    end
    INT_KEYS.index_with { |k| number(raw[k])&.round&.clamp(0, 20_000) }
            .merge(FLOAT_KEYS.index_with { |k| (number(raw[k]) || 0.0).clamp(0, 3600).round(1) })
            .merge("fillers" => fillers)
  end

  def number(value)
    n = Float(value.to_s, exception: false)
    n if n&.finite?
  end

  def count_fillers(tokens)
    cleaned = tokens.map { |t| clean(t) }
    counts = Hash.new(0)
    i = 0
    while i < tokens.size
      word = cleaned[i]
      label = FILLER_PHRASES[[ word, cleaned[i + 1] ]] if i + 1 < tokens.size
      if label && tokens[i + 1].rstrip.end_with?(",", ".", "?", "!")
        counts[label] += 1
        i += 2
        next
      end

      if FILLER_WORDS.key?(word)
        counts[FILLER_WORDS[word]] += 1
      elsif COMMA_FILLERS.key?(word) && tokens[i].rstrip.end_with?(",")
        counts[COMMA_FILLERS[word]] += 1
      end
      i += 1
    end
    counts.to_h
  end

  def clean(token)
    token.downcase.gsub(/[^\p{Word}']/, "")
  end
end
