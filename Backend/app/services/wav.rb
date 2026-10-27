# Just enough WAV handling to join several speech clips into one file.
#
#   Wav.sentences("First one. Second one.", 12) # => ["First one.", "Second one."]
#   Wav.join([wav_a, wav_b])                    # => one WAV with both clips' audio
module Wav
  class Invalid < StandardError; end

  module_function

  # Splits text into pieces of at most `max` characters, at sentence ends where
  # possible, then at spaces.
  def sentences(text, max)
    text.to_s.squish.split(/(?<=[.?!])\s+/).flat_map do |sentence|
      sentence.length <= max ? [ sentence ] : sentence.scan(/.{1,#{max}}(?:\s+|\z)/).map(&:strip)
    end.each_with_object([]) do |sentence, pieces|
      if pieces.last && pieces.last.length + 1 + sentence.length <= max
        pieces.last << " " << sentence
      else
        pieces << +sentence
      end
    end.reject(&:empty?)
  end

  # Concatenates the audio of WAV files that share one format.
  def join(files)
    return files.first if files.size == 1

    parsed = files.map { |f| parse(f) }
    format = parsed.first[:fmt]
    raise Invalid, "clips have different formats" unless parsed.all? { |p| p[:fmt] == format }

    data = parsed.map { |p| p[:data] }.join
    "RIFF".b + [ 4 + 8 + format.bytesize + 8 + data.bytesize ].pack("V") + "WAVE".b +
      "fmt ".b + [ format.bytesize ].pack("V") + format + "data".b + [ data.bytesize ].pack("V") + data
  end

  def parse(bytes)
    bytes = bytes.b
    raise Invalid, "not a WAV file" unless bytes[0, 4] == "RIFF" && bytes[8, 4] == "WAVE"

    chunks = {}
    offset = 12
    while offset + 8 <= bytes.bytesize
      id = bytes[offset, 4]
      size = bytes[offset + 4, 4].unpack1("V")
      # Streamed WAVs may leave the data size unset; take the rest of the file.
      size = bytes.bytesize - offset - 8 if id == "data" && (size.zero? || size == 0xFFFFFFFF || offset + 8 + size > bytes.bytesize)
      chunks[id] ||= bytes[offset + 8, size]
      offset += 8 + size + (size.odd? ? 1 : 0)
    end
    raise Invalid, "missing fmt or data" unless chunks["fmt "] && chunks["data"]

    { fmt: chunks["fmt "], data: chunks["data"] }
  end
end
