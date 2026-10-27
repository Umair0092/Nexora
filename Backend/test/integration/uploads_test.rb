require "test_helper"

class UploadsTest < ActionDispatch::IntegrationTest
  setup do
    @user = create_user
  end

  # A one-page PDF containing `text`, built by hand so the test needs no fixtures.
  def pdf_with(text)
    stream = "BT /F1 12 Tf 72 720 Td (#{text}) Tj ET"
    objects = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
      "<< /Length #{stream.bytesize} >>\nstream\n#{stream}\nendstream",
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
    ]
    pdf = +"%PDF-1.4\n"
    offsets = objects.each_with_index.map do |body, i|
      offset = pdf.bytesize
      pdf << "#{i + 1} 0 obj\n#{body}\nendobj\n"
      offset
    end
    xref = pdf.bytesize
    pdf << "xref\n0 #{objects.size + 1}\n0000000000 65535 f \n"
    offsets.each { |o| pdf << format("%010d 00000 n \n", o) }
    pdf << "trailer\n<< /Size #{objects.size + 1} /Root 1 0 R >>\nstartxref\n#{xref}\n%%EOF\n"
  end

  def upload(path, bytes, filename, **fields)
    file = Rack::Test::UploadedFile.new(StringIO.new(bytes), "application/octet-stream", original_filename: filename)
    post path, params: { file: file, **fields }, headers: auth_headers(@user)
  end

  test "a CV is read and structured by the model" do
    candidate = { "name" => "Ali Hassan", "degree" => "BS CS", "skills" => [ "Ruby" ] * 40,
                  "work_experience" => [ { "company" => "TechCorp", "role" => "Engineer", "extra" => "dropped" } ] }
    calls = stub_llm(json: ->(*, **) { candidate }) do
      upload("/api/v1/resume/parse", pdf_with("Ali Hassan, Ruby engineer at TechCorp"), "cv.pdf")
    end

    assert_response :ok
    assert_includes calls[:json].first.first, "Ali Hassan, Ruby engineer at TechCorp"
    data = json["candidate_data"]
    assert_equal "Ali Hassan", data["name"]
    assert_equal 30, data["skills"].size
    assert_equal({ "company" => "TechCorp", "role" => "Engineer", "duration" => nil, "description" => nil }, data["work_experience"].first)
  end

  test "CV uploads are checked before the model is called" do
    stub_llm do
      upload("/api/v1/resume/parse", "GIF89a not a pdf", "cv.pdf")
      assert_response :unsupported_media_type

      upload("/api/v1/resume/parse", "%PDF-1.4 broken", "cv.pdf")
      assert_response :unprocessable_entity
      assert_equal ResumeParser::INVALID, json["error"]

      upload("/api/v1/resume/parse", pdf_with(""), "cv.pdf")
      assert_response :unprocessable_entity
      assert_equal ResumeParser::NO_TEXT, json["error"]

      upload("/api/v1/resume/parse", "%PDF-" + ("x" * 10.megabytes), "cv.pdf")
      assert_response :content_too_large

      post "/api/v1/resume/parse", headers: auth_headers(@user)
      assert_response :unprocessable_entity
    end
  end

  test "a model failure while reading a CV is a 503, not a bad PDF" do
    stub_llm(json: ->(*, **) { raise Llm::Error }) do
      upload("/api/v1/resume/parse", pdf_with("Some CV text"), "cv.pdf")
    end
    assert_response :service_unavailable
    assert_match(/couldn't read your CV/, json["error"])
  end

  test "transcription returns the text with speech metrics and a safe file name" do
    received = nil
    whisper = lambda do |audio, filename:, language:, prompt:|
      received = { bytes: audio.bytesize, filename: filename, language: language, prompt: prompt }
      { "text" => "Um, I built it.", "duration" => 3.0,
        "words" => [ { "word" => "Um,", "start" => 0.0, "end" => 0.3 }, { "word" => "I", "start" => 0.4, "end" => 0.5 },
                     { "word" => "built", "start" => 2.8, "end" => 3.0 }, { "word" => "it.", "start" => 3.1, "end" => 3.3 } ] }
    end
    Llm.stub(:transcribe, whisper) do
      upload("/api/v1/transcriptions", "audio-bytes", "../../etc/passwd.exe", language: "en")
    end

    assert_response :ok
    assert_equal "Um, I built it.", json["text"]
    assert_equal({ "um" => 1 }, json["speech"]["fillers"])
    assert_equal 1, json["speech"]["long_pauses"]
    assert_equal({ bytes: 11, filename: "answer.webm", language: "en", prompt: SpeechMetrics::WHISPER_PROMPT }, received)

    Llm.stub(:transcribe, whisper) { upload("/api/v1/transcriptions", "audio", "a.ogg", language: "ur") }
    assert_equal({ filename: "answer.ogg", language: "ur", prompt: nil }, received.slice(:filename, :language, :prompt))
  end

  test "transcription limits size and reports failures generically" do
    upload("/api/v1/transcriptions", "x" * (15.megabytes + 1), "a.webm")
    assert_response :content_too_large

    Llm.stub(:transcribe, ->(*, **) { raise Llm::Error }) { upload("/api/v1/transcriptions", "audio", "a.webm") }
    assert_response :service_unavailable
    assert_equal Llm::BUSY, json["error"]

    Llm.stub(:transcribe, ->(*, **) { { "text" => "  " } }) { upload("/api/v1/transcriptions", "audio", "a.webm") }
    assert_equal({ "text" => "", "speech" => nil }, json)
  end

  test "uploads need a signed-in user" do
    post "/api/v1/transcriptions"
    assert_response :unauthorized
  end
end
