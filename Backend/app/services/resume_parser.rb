# Reads a CV PDF and asks the model for structured candidate data, in the
# shape interviews take as candidate_data.
#
#   ResumeParser.call(pdf_bytes)
#   # => { "name" => "Ali Hassan", "degree" => "BS Computer Science", "skills" => [...], ... }
#
# Raises ResumeParser::Unreadable (with a message for the user) when the file
# has no extractable text, and Llm::Error when the model call fails.
module ResumeParser
  class Unreadable < StandardError; end

  NO_TEXT = "No readable text found in this PDF".freeze
  INVALID = "Failed to parse resume. Make sure the file is a valid PDF with readable text.".freeze
  # Roughly 5k tokens: plenty for a CV, and well under free-tier per-minute limits.
  MAX_TEXT = 20_000
  MAX_ITEMS = 30
  MAX_FIELD = 1000

  OPTIONAL_STRING = { anyOf: [ { type: "string" }, { type: "null" } ] }.freeze
  SCHEMA = {
    type: "object",
    properties: {
      name: { type: "string", description: "Name of the candidate" },
      degree: { type: "string", description: "Degree done by the candidate or currently doing" },
      summary: OPTIONAL_STRING,
      work_experience: {
        type: "array",
        items: {
          type: "object",
          properties: { company: { type: "string" }, role: { type: "string" }, duration: OPTIONAL_STRING, description: OPTIONAL_STRING },
          required: %w[company role]
        }
      },
      projects_done: Interviewing::STRINGS,
      education: {
        type: "array",
        items: {
          type: "object",
          properties: { institution: { type: "string" }, course: { type: "string" }, duration: OPTIONAL_STRING, score: OPTIONAL_STRING },
          required: %w[institution course]
        }
      },
      skills: Interviewing::STRINGS,
      achievements: Interviewing::STRINGS
    },
    required: %w[name degree skills]
  }.freeze

  module_function

  def call(bytes)
    text = extract_text(bytes)
    raise Unreadable, NO_TEXT if text.blank?

    raw = Llm.json("Extract structured information from this resume:\n\n#{text.truncate(MAX_TEXT)}",
                   schema: SCHEMA, name: "Candidate", max_tokens: 4000, temperature: 0.1)
    normalize(raw)
  end

  def extract_text(bytes)
    PDF::Reader.new(StringIO.new(bytes)).pages.map(&:text).join("\n\n").strip
  rescue StandardError => e
    Rails.logger.warn("CV PDF unreadable: #{e.class}")
    raise Unreadable, INVALID
  end

  # Candidate data from the model or from the browser, trimmed to a safe size.
  def normalize(raw)
    raw = raw.is_a?(Hash) ? raw.stringify_keys : {}
    {
      "name" => field(raw["name"]).presence || "Candidate",
      "degree" => field(raw["degree"]),
      "summary" => field(raw["summary"]).presence,
      "skills" => list(raw["skills"]),
      "work_experience" => records(raw["work_experience"], %w[company role], %w[duration description]),
      "projects_done" => list(raw["projects_done"]),
      "education" => records(raw["education"], %w[institution course], %w[duration score]),
      "achievements" => list(raw["achievements"])
    }
  end

  def field(value)
    Interviewing.text(value).truncate(MAX_FIELD)
  end

  def list(value)
    Interviewing.strings(value).first(MAX_ITEMS).map { |s| s.truncate(MAX_FIELD) }
  end

  def records(value, required, optional)
    Array(value).first(MAX_ITEMS).filter_map do |item|
      item = item.to_unsafe_h if item.respond_to?(:to_unsafe_h)
      next unless item.is_a?(Hash)

      item = item.stringify_keys
      required.index_with { |k| field(item[k]) }.merge(optional.index_with { |k| field(item[k]).presence })
    end
  end
end
