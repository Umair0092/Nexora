require "test_helper"

class WavTest < ActiveSupport::TestCase
  def wav(samples, rate: 24_000)
    fmt = [ 1, 1, rate, rate * 2, 2, 16 ].pack("vvVVvv")
    data = samples.pack("s<*")
    "RIFF".b + [ 4 + 8 + fmt.bytesize + 8 + data.bytesize ].pack("V") + "WAVE".b +
      "fmt ".b + [ fmt.bytesize ].pack("V") + fmt + "LIST".b + [ 4 ].pack("V") + "INFO".b + "data".b + [ data.bytesize ].pack("V") + data
  end

  test "splits text at sentence ends, then at spaces, within the limit" do
    assert_equal [ "Hi Ali.", "How are you?" ], Wav.sentences("Hi Ali.   How are you?", 12)
    assert_equal [ "Hi Ali. How are you?" ], Wav.sentences("Hi Ali. How are you?", 200)
    long = Wav.sentences("word " * 30, 40)
    assert long.all? { |p| p.length <= 40 }
    assert_equal ("word " * 30).split, long.join(" ").split
  end

  test "joins clips into one valid WAV, skipping extra chunks" do
    joined = Wav.join([ wav([ 1, 2 ]), wav([ 3 ]) ])
    parsed = Wav.parse(joined)
    assert_equal [ 1, 2, 3 ], parsed[:data].unpack("s<*")
    assert_equal joined.bytesize - 8, joined[4, 4].unpack1("V")
    assert_equal wav([ 9 ]), Wav.join([ wav([ 9 ]) ])
  end

  test "rejects clips it can't join" do
    assert_raises(Wav::Invalid) { Wav.join([ wav([ 1 ]), wav([ 2 ], rate: 16_000) ]) }
    assert_raises(Wav::Invalid) { Wav.join([ "not audio", wav([ 1 ]) ]) }
  end
end
