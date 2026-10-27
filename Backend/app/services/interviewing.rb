# Pieces shared by the CV interview, the quiz and the single-answer coach:
# languages, prompt fragments, JSON schemas for the model's structured output,
# and helpers that coerce whatever the model returns into the expected shape.
module Interviewing
  LANGUAGE_NAMES = { "en" => "English", "ur" => "Urdu", "fr" => "French", "es" => "Spanish" }.freeze
  LANGUAGES = LANGUAGE_NAMES.keys.freeze
  STYLES = %w[standard behavioral].freeze
  DEFAULT_ROLE = "Software Engineer".freeze
  MAX_JOB_DESCRIPTION = 6000
  HIRE_RECOMMENDATIONS = [ "Strong Yes", "Yes", "Maybe", "No" ].freeze

  STAR_CRITERIA = <<~TEXT.freeze
    STAR coverage for each answer:
    - situation: did they set the scene (when, where, who was involved)?
    - task: did they state their own responsibility or goal?
    - action: did they describe what THEY personally did (not "we"), step by step?
    - result: did they give the outcome, ideally measured, and what they learned?
    - note: one sentence on the most important missing or strong STAR element.
  TEXT

  STRINGS = { type: "array", items: { type: "string" } }.freeze
  STAR_SCHEMA = {
    type: "object",
    properties: {
      situation: { type: "boolean" }, task: { type: "boolean" }, action: { type: "boolean" },
      result: { type: "boolean" }, note: { type: "string" }
    },
    required: %w[situation task action result note]
  }.freeze
  OPTIONAL_STAR = { anyOf: [ STAR_SCHEMA, { type: "null" } ] }.freeze

  module_function

  def language(code)
    LANGUAGES.include?(code) ? code : "en"
  end

  def language_name(code)
    LANGUAGE_NAMES.fetch(code, "English")
  end

  def job_section(job_description)
    return "" if job_description.blank?

    <<~TEXT

      JOB DESCRIPTION (the candidate is applying for this job):
      """
      #{job_description}
      """
    TEXT
  end

  # Model scores are 1–10; anything else is pulled into range.
  #   clamp_score(0) # => 1    clamp_score("7") # => 7    clamp_score(nil) # => 1
  def clamp_score(value, low = 1, high = 10)
    n = Float(value.to_s, exception: false)
    return low if n.nil? || !n.finite?

    n.round(half: :even).clamp(low, high)
  end

  def text(value)
    value.is_a?(Hash) || value.is_a?(Array) ? "" : value.to_s.strip
  end

  def strings(value)
    Array(value).filter_map { |v| text(v).presence }
  end

  def star(value)
    return nil unless value.is_a?(Hash)

    %w[situation task action result].index_with { |k| value[k] == true }.merge("note" => text(value["note"]))
  end

  # Raises Llm::Error with the quota message when the provider is rate-limiting,
  # otherwise with `fallback`. Logs the original failure.
  def model_failure!(error, fallback)
    raise Llm::Error.new(Llm::QUOTA, quota: true) if error.quota?
    raise error if error.message == Llm::NOT_CONFIGURED

    raise Llm::Error.new(fallback)
  end
end
