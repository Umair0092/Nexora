# Single-answer tools for past reports: score a retry of one question, or
# rewrite an answer into a stronger version. Both take the same context:
#
#   AnswerCoach.score(question: "...", answer: "...", target_role: "Backend Engineer",
#                     interview_style: "behavioral", ideal_answer: nil, job_description: nil, language: "en")
#   # => { "score" => 7, "strengths" => [...], ..., "star" => {...} }
#   AnswerCoach.improve(**same)  # => { "improved_answer" => "...", "changes" => [...] }
module AnswerCoach
  SCORE_SCHEMA = {
    type: "object",
    properties: {
      score: { type: "integer" }, strengths: Interviewing::STRINGS, improvements: Interviewing::STRINGS,
      feedback: { type: "string" }, recommendation: { type: "string" }, star: Interviewing::OPTIONAL_STAR
    },
    required: %w[score strengths improvements feedback recommendation]
  }.freeze

  IMPROVE_SCHEMA = {
    type: "object",
    properties: { improved_answer: { type: "string" }, changes: Interviewing::STRINGS },
    required: %w[improved_answer changes]
  }.freeze

  module_function

  def score(question:, answer:, target_role:, interview_style: "standard", ideal_answer: nil, job_description: nil, language: "en")
    behavioral = interview_style == "behavioral"
    prompt = context(question, answer, target_role, interview_style, ideal_answer, job_description, language) + <<~TEXT

      Score this answer on its own, as a fair but demanding interviewer would:
      - score (1-10)#{ideal_answer ? ' — compare against the model answer for accuracy and completeness' : ''}
      - strengths (1-3), improvements (1-3)
      - feedback (1-2 sentences), recommendation (one specific, actionable change)
      #{behavioral ? Interviewing::STAR_CRITERIA : '- star: null'}
    TEXT

    raw = Llm.json(prompt, schema: SCORE_SCHEMA, name: "AnswerScore", max_tokens: 3000)
    {
      "score" => Interviewing.clamp_score(raw["score"]),
      "strengths" => Interviewing.strings(raw["strengths"]),
      "improvements" => Interviewing.strings(raw["improvements"]),
      "feedback" => Interviewing.text(raw["feedback"]),
      "recommendation" => Interviewing.text(raw["recommendation"]),
      "star" => behavioral ? Interviewing.star(raw["star"]) : nil
    }
  rescue Llm::Error => e
    Interviewing.model_failure!(e, "Scoring failed. Please try again later.")
  end

  def improve(question:, answer:, target_role:, interview_style: "standard", ideal_answer: nil, job_description: nil, language: "en")
    structure =
      if interview_style == "behavioral"
        "Restructure it as STAR: one or two sentences each for Situation and Task, most of the length on the " \
          "candidate's own Actions in first person, then a concrete Result and what they learned."
      else
        "Lead with a direct answer, then support it with the candidate's own specific example, and close with the outcome."
      end
    prompt = context(question, answer, target_role, interview_style, ideal_answer, job_description, language) + <<~TEXT

      Rewrite the candidate's answer into a stronger version they could say out loud in about 60-90 seconds.

      RULES:
      - Keep the candidate's real facts, projects, numbers and voice. Do NOT invent employers, metrics or achievements.
        Where a number or detail would help but wasn't given, write a short placeholder in square brackets, e.g. [cut load time by X%].
      - #{structure}
      #{ideal_answer ? '- Fill technical gaps using the model answer, phrased as the candidate would say it.' : ''}
      - Plain spoken language, first person, no headings or bullet points.
      - changes: 2-4 short notes on what you changed and why.
    TEXT

    raw = Llm.json(prompt, schema: IMPROVE_SCHEMA, name: "ImprovedAnswer", max_tokens: 3000, temperature: 0.4)
    { "improved_answer" => Interviewing.text(raw["improved_answer"]), "changes" => Interviewing.strings(raw["changes"]) }
  rescue Llm::Error => e
    Interviewing.model_failure!(e, "Rewrite failed. Please try again later.")
  end

  def context(question, answer, target_role, style, ideal_answer, job_description, language)
    kind = style == "behavioral" ? "behavioral interview" : "interview"
    ideal = ideal_answer ? "\nMODEL ANSWER (what a strong answer covers):\n#{ideal_answer}\n" : ""
    <<~TEXT
      This is one question from a #{target_role} #{kind}. Write every text field in #{Interviewing.language_name(language)}.
      #{Interviewing.job_section(job_description)}
      QUESTION:
      #{question}
      #{ideal}
      CANDIDATE'S ANSWER:
      #{answer}
    TEXT
  end
end
