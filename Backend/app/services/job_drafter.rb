# Drafts screening questions and scoring criteria from a job description. The
# recruiter edits them before any candidate sees them.
#
#   JobDrafter.call(title: "Backend Engineer", description: "...")
#   # => { "questions" => ["Tell me about...", ...], "criteria" => ["System design", ...] }
module JobDrafter
  SCHEMA = {
    type: "object",
    properties: { questions: Interviewing::STRINGS, criteria: Interviewing::STRINGS },
    required: %w[questions criteria]
  }.freeze

  module_function

  def call(title:, description:)
    prompt = <<~TEXT
      You are helping a recruiter set up a one-way screening interview for this job. Candidates will answer
      each question out loud, once, in about two minutes, without follow-ups.

      JOB TITLE: #{title}
      #{Interviewing.job_section(description)}
      Write:
      - questions: 5 questions. Mix 2-3 behavioral questions ("Tell me about a time...") tied to the job's main
        requirements with 2-3 questions about how they would approach the work. Each must be answerable from
        experience in two minutes. Never ask about age, family, health, religion, nationality or other personal
        characteristics, and avoid questions that need a whiteboard or code.
      - criteria: 3-5 job-related skills or behaviours to score answers on, each 2-5 words (e.g. "System design",
        "Ownership", "Stakeholder communication"). Never personality traits, culture fit or communication style.
    TEXT
    raw = Llm.json(prompt, schema: SCHEMA, name: "ScreeningDraft", max_tokens: 3000, temperature: 0.5)
    {
      "questions" => Interviewing.strings(raw["questions"]).first(Job::QUESTIONS.max).map { |q| q.truncate(Job::MAX_ITEM) },
      "criteria" => Interviewing.strings(raw["criteria"]).first(Job::CRITERIA.max).map { |c| c.truncate(100) }
    }
  rescue Llm::Error => e
    Interviewing.model_failure!(e, "Couldn't draft questions right now. Try again in a minute.")
  end
end
