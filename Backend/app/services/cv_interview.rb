# A conversational interview driven by the candidate's CV: "standard" mixes
# technical and situational questions, "behavioral" asks STAR-style "Tell me
# about a time..." questions. Questions are always asked in English; `language`
# sets the language of the evaluation.
#
# All state lives in a plain hash (LiveInterview#state), so an interview
# survives restarts:
#
#   interview = CvInterview.build(candidate_data: {...}, target_role: "Backend Engineer", num_questions: 5)
#   interview.start!                     # => "Hi Ali, ..."
#   interview.answer!("I built...", nil) # => ["How did you...", false]
#   interview.evaluate!                  # => Hash, cached until the next answer
class CvInterview
  include Interviewing

  QUESTION_TOKENS = 1500
  EVALUATION_TOKENS = 8000

  EVALUATION_SCHEMA = {
    type: "object",
    properties: {
      per_question: {
        type: "array",
        items: {
          type: "object",
          properties: {
            question: { type: "string" }, answer: { type: "string" }, score: { type: "integer" },
            strengths: STRINGS, improvements: STRINGS, feedback: { type: "string" },
            recommendation: { type: "string" }, star: OPTIONAL_STAR
          },
          required: %w[question answer score strengths improvements feedback recommendation]
        }
      },
      overall_score: { type: "integer" }, communication_score: { type: "integer" }, technical_score: { type: "integer" },
      top_strengths: STRINGS, areas_to_improve: STRINGS, summary: { type: "string" },
      hire_recommendation: { type: "string", enum: HIRE_RECOMMENDATIONS },
      recommendation_summary: { type: "string" }, improvement_points: STRINGS,
      job_fit: { anyOf: [ { type: "string" }, { type: "null" } ] }
    },
    required: %w[per_question overall_score communication_score technical_score top_strengths areas_to_improve
                 summary hire_recommendation recommendation_summary improvement_points]
  }.freeze

  STANDARD_FALLBACKS = [
    "Can you tell me about a challenging project you've worked on?",
    "What's your experience with machine learning or data analysis?",
    "Describe a time when you had to learn a new technology quickly.",
    "What interests you most about this role?",
    "Can you walk me through your problem-solving approach?",
    "Tell me about a time you worked in a team to solve a difficult problem.",
    "What are your strongest technical skills?",
    "Describe a situation where you had to handle conflicting priorities."
  ].freeze
  BEHAVIORAL_FALLBACKS = [
    "Tell me about a time you disagreed with a teammate. How did you handle it?",
    "Describe a project where something went wrong. What did you do?",
    "Give me an example of a time you took ownership of a problem nobody else wanted.",
    "Tell me about a time you had to deliver under a tight deadline.",
    "Describe a time you changed someone's mind about a decision.",
    "Tell me about a mistake you made and what you learned from it."
  ].freeze

  attr_reader :state

  def self.build(candidate_data:, target_role: DEFAULT_ROLE, num_questions: 5, language: "en",
                 style: "standard", job_description: nil)
    new(
      "candidate_data" => candidate_data,
      "target_role" => target_role,
      "num_questions" => num_questions,
      "language" => Interviewing.language(language),
      "style" => STYLES.include?(style) ? style : "standard",
      "job_description" => job_description.to_s.strip.presence,
      "questions_asked" => 0,
      "is_complete" => false,
      "history" => [],
      "answer_speech" => [],
      "evaluation" => nil,
      "evaluated_answers" => 0
    )
  end

  def initialize(state)
    @state = state
  end

  %w[candidate_data target_role num_questions language style job_description questions_asked history].each do |key|
    define_method(key) { state[key] }
  end

  def complete?
    state["is_complete"] == true
  end

  def behavioral?
    style == "behavioral"
  end

  def answers_given
    history.count { |m| m["role"] == "human" }
  end

  # The conversation as shown to the candidate.
  def conversation
    history.map { |m| { "role" => m["role"] == "ai" ? "interviewer" : "candidate", "content" => m["content"] } }
  end

  def start!
    prompt =
      if behavioral?
        "Start the interview now. Greet the candidate warmly using only their first name, " \
          "then ask your first behavioral question (a specific past situation), ideally tied to " \
          "something in their CV. Output exactly one or two sentences, no line breaks, no labels."
      else
        "Start the interview now. " \
          "Greet the candidate warmly using only their first name (no titles, no 'Mr.', no 'Ms.'). " \
          "Then immediately ask ONE specific question about something concrete in their resume — " \
          "a project they built, a technology they used, a challenge they solved, or a result they achieved. " +
          (job_description ? "If a job description was given, pick the CV detail most relevant to it. " : "") +
          "Do NOT ask them to introduce themselves or walk through their background. " \
          "Do NOT use 'Tell me about yourself' — go straight to a specific resume detail. " \
          "Output exactly ONE sentence that is the greeting + question combined, " \
          "no line breaks, no labels, no extra text."
      end

    opening = ask(prompt) || "Hello! Welcome to this #{target_role} interview. #{fallback_question}"
    history << { "role" => "ai", "content" => opening }
    state["questions_asked"] = 1
    opening
  end

  # Records the answer and returns [next_question, complete?]. On a quota error
  # nothing is recorded, so the same answer can be sent again later.
  def answer!(text, speech)
    text = text.to_s.strip
    return [ "I didn't receive your answer. Could you please share your thoughts?", false ] if text.empty?

    if questions_asked >= num_questions
      record_answer(text, speech)
      closing = "Thank you for your time! That completes our interview. Best of luck!"
      history << { "role" => "ai", "content" => closing }
      state["is_complete"] = true
      return [ closing, true ]
    end

    next_question = ask(next_question_instruction, with_answer: { "role" => "human", "content" => text }) || fallback_question
    record_answer(text, speech)
    history << { "role" => "ai", "content" => next_question }
    state["questions_asked"] = questions_asked + 1
    [ next_question, false ]
  end

  # Scores every answered question. Cached until another answer arrives.
  def evaluate!
    pairs = qa_pairs
    return nil if pairs.empty?
    return state["evaluation"] if state["evaluation"] && state["evaluated_answers"] == pairs.size

    raw = Llm.json(evaluation_prompt(pairs), schema: EVALUATION_SCHEMA, name: "EvaluationResult", max_tokens: EVALUATION_TOKENS)
    state["evaluation"] = clean_evaluation(raw, pairs)
    state["evaluated_answers"] = pairs.size
    state["evaluation"]
  rescue Llm::Error => e
    Rails.logger.error("Interview evaluation failed: #{e.message}")
    Interviewing.model_failure!(e, "Evaluation failed. Please try again later.")
  end

  def summary
    {
      "target_role" => target_role,
      "language" => language,
      "interview_style" => style,
      "job_description" => job_description,
      "questions_asked" => questions_asked,
      "num_questions" => num_questions,
      "is_complete" => complete?
    }
  end

  private

  def record_answer(text, speech)
    history << { "role" => "human", "content" => text }
    state["answer_speech"] = Array(state["answer_speech"]) + [ speech ]
  end

  # One spoken question from the model, or nil to use a fallback. Quota and
  # configuration errors are raised instead: the interview can't really continue.
  def ask(instruction, with_answer: nil)
    messages = [ { role: "system", content: system_prompt } ]
    messages += (history + [ with_answer ].compact).map do |m|
      { role: m["role"] == "ai" ? "assistant" : "user", content: m["content"] }
    end
    messages << { role: "user", content: instruction }

    reply = Llm.chat(messages, max_tokens: QUESTION_TOKENS).lines.map(&:strip).join(" ").strip
    reply.length >= 10 ? reply : nil
  rescue Llm::Error => e
    raise if e.quota? || e.message == Llm::NOT_CONFIGURED

    Rails.logger.warn("Interview question failed, using a fallback: #{e.message}")
    nil
  end

  def fallback_question
    list = behavioral? ? BEHAVIORAL_FALLBACKS : STANDARD_FALLBACKS
    list[[ questions_asked, list.size - 1 ].min]
  end

  def qa_pairs
    conv = conversation
    pairs = []
    i = 0
    while i < conv.size - 1
      if conv[i]["role"] == "interviewer" && conv[i + 1]["role"] == "candidate"
        pairs << { "question" => conv[i]["content"], "answer" => conv[i + 1]["content"] }
        i += 2
      else
        i += 1
      end
    end
    pairs
  end

  def candidate_json
    JSON.pretty_generate(candidate_data || {})
  end

  def system_prompt
    return behavioral_system_prompt if behavioral?

    job = ""
    if job_description
      job = Interviewing.job_section(job_description) + <<~TEXT
        USING THE JOB DESCRIPTION:
        - At least half of your questions must target requirements from the job description.
        - Prioritise requirements the CV covers thinly or not at all, and ask how their experience transfers.
        - Name the requirement you are probing in plain words, e.g. "This role leans on Kubernetes..."
      TEXT
    end

    <<~TEXT
      You are an expert technical interviewer conducting a #{target_role} interview.

      CANDIDATE PROFILE:
      #{candidate_json}
      #{job}
      YOUR INTERVIEWING STYLE:
      - Professional but friendly
      - Ask follow-up questions based on their answers
      - Reference their specific experience/projects/skills from the profile above
      - Mix behavioral, technical, and situational questions
      - Keep questions concise and clear
      - Show genuine interest in their answers
      - Ask #{num_questions} questions total

      IMPORTANT RULES:
      1. Ask ONE question at a time
      2. Wait for their answer before asking next
      3. Sometimes ask follow-ups based on their answer
      4. Reference their resume when relevant
      5. Keep track: you need to ask #{num_questions} total questions
      6. After #{num_questions} questions, say "That completes our interview. Thank you!"

      HANDLING INVALID ANSWERS:
      If the candidate provides a gibberish or clearly invalid response, respond with:
      "I didn't quite understand that response. Let me ask you something else instead."
      Then immediately move to the next question.

      OUTPUT FORMAT:
      - Output ONLY the spoken text — the exact words you would say to the candidate
      - Write in short, clear sentences — one idea per sentence
      - Do NOT include any labels, counts, notes, meta-text, or formatting markers
      - Do NOT include phrases like "(Current question count: ...)" or "Your opening:" or any annotations
      - Do NOT use bullet points, numbered lists, or line breaks within a single question
    TEXT
  end

  def behavioral_system_prompt
    <<~TEXT
      You are an experienced hiring manager running a behavioral interview for a #{target_role} role.

      CANDIDATE PROFILE (use it for context; ask about situations they are likely to have faced):
      #{candidate_json}
      #{Interviewing.job_section(job_description)}
      WHAT A BEHAVIORAL INTERVIEW IS:
      - Every question asks for a specific past situation: "Tell me about a time...", "Describe a situation where...",
        "Give me an example of...". Never ask hypotheticals ("What would you do if...") or technical knowledge questions.
      - Cover different competencies across the interview: teamwork, conflict or disagreement, ownership,
        a failure or mistake and what they learned, working under pressure or ambiguity, influencing others,
        and leadership or mentoring.
      - Tie questions to their CV where natural (a project, team or job they listed), and to the job description if given.
      - If an answer is vague or says "we" throughout, ask one short follow-up that pins down what THEY did
        or what the measurable result was. Otherwise move to a new competency.
      - Ask #{num_questions} questions total, one at a time.

      OUTPUT FORMAT:
      - Output ONLY the spoken words: one question, one or two short sentences, no labels, counts or line breaks.
    TEXT
  end

  def next_question_instruction
    guidance =
      if behavioral?
        <<~TEXT.strip
          - If their last answer was vague or only said "we", ask one short follow-up about what THEY did or the measurable result
          - Otherwise ask about a different competency than any question so far
          - It must ask about a specific past situation, never a hypothetical
        TEXT
      else
        lines = [
          "- If their answer was interesting: ask a follow-up to dig deeper into that specific point",
          "- If their answer was complete: move to a different topic (technical, behavioral, or situational)",
          "- Reference their resume when relevant — mention specific projects, tools, or experiences they listed"
        ]
        lines << "- Make sure the job description's key requirements get covered before the interview ends" if job_description
        lines.join("\n")
      end

    <<~TEXT
      Based on the candidate's last answer and the conversation so far, ask your next interview question.

      RULES:
      - Output ONE question only — a single sentence, no line breaks, no labels, no counts, no extra text
      #{guidance}
      - Keep the question concise and conversational

      You have asked #{questions_asked} of #{num_questions} questions. #{num_questions - questions_asked} remaining.
    TEXT
  end

  def evaluation_prompt(pairs)
    transcript = pairs.each_with_index.map { |p, i| "Q#{i + 1}: #{p['question']}\nA#{i + 1}: #{p['answer']}" }.join("\n\n")
    lang = Interviewing.language_name(language)
    role_line = behavioral? ?
      "an experienced hiring manager evaluating a behavioral interview for a #{target_role} role" :
      "an expert technical interviewer evaluating a #{target_role} interview"

    <<~TEXT
      You are #{role_line}.

      LANGUAGE INSTRUCTION:
      Write ALL text fields in your evaluation in #{lang}.
      This includes: strengths, improvements, feedback, recommendation, top_strengths,
      areas_to_improve, summary, recommendation_summary, improvement_points#{behavioral? ? ', star notes' : ''}#{job_description ? ' and job_fit' : ''}.
      #{Interviewing.job_section(job_description)}
      INTERVIEW TRANSCRIPT:
      #{transcript}

      Evaluate EVERY question-answer pair listed above. For each one provide:
      - score (1-10)
      - strengths (list)
      - improvements (list)
      - feedback (1-2 sentences)
      - recommendation (specific actionable advice for that answer)
      #{behavioral? ? '- star (see STAR coverage below)' : '- star: null'}

      Then provide an overall evaluation with:
      - overall_score, communication_score, technical_score (all 1-10)#{behavioral? ? ' — for a behavioral interview, technical_score rates the substance and specificity of the examples' : ''}
      - top_strengths (2-3 overall)
      - areas_to_improve (2-3 overall)
      - summary (3-5 sentences)
      - hire_recommendation: one of "Strong Yes", "Yes", "Maybe", "No"
      - recommendation_summary (detailed paragraph on what to focus on to improve)
      - improvement_points (4-6 specific actionable bullet points)
      - job_fit: #{job_description ? "2-3 sentences on how well the answers showed the requirements in the job description, naming the requirements that were and weren't demonstrated" : 'null'}

      Scoring criteria per answer:
      - Relevance to the question
      - #{behavioral? ? 'Specificity: a real situation, their own actions, a concrete result' : 'Technical depth and accuracy'}
      - Clarity and communication
      - Use of specific examples and outcomes
      #{behavioral? ? STAR_CRITERIA : ''}
    TEXT
  end

  # Never trust the model's output: one entry per answer with the real question
  # and answer text, scores in 1–10, and the speech metrics sent with each answer.
  def clean_evaluation(raw, pairs)
    speech = Array(state["answer_speech"])
    per_question = Array(raw["per_question"]).select { |q| q.is_a?(Hash) }.first(pairs.size)
    per_question = per_question.each_with_index.map do |q, i|
      {
        "question" => pairs[i]["question"],
        "answer" => pairs[i]["answer"],
        "score" => Interviewing.clamp_score(q["score"]),
        "strengths" => Interviewing.strings(q["strengths"]),
        "improvements" => Interviewing.strings(q["improvements"]),
        "feedback" => Interviewing.text(q["feedback"]),
        "recommendation" => Interviewing.text(q["recommendation"]),
        "star" => behavioral? ? Interviewing.star(q["star"]) : nil,
        "speech" => speech[i]
      }
    end

    {
      "per_question" => per_question,
      "overall_score" => Interviewing.clamp_score(raw["overall_score"]),
      "communication_score" => Interviewing.clamp_score(raw["communication_score"]),
      "technical_score" => Interviewing.clamp_score(raw["technical_score"]),
      "top_strengths" => Interviewing.strings(raw["top_strengths"]),
      "areas_to_improve" => Interviewing.strings(raw["areas_to_improve"]),
      "summary" => Interviewing.text(raw["summary"]),
      "hire_recommendation" => Interviewing.text(raw["hire_recommendation"]),
      "recommendation_summary" => Interviewing.text(raw["recommendation_summary"]),
      "improvement_points" => Interviewing.strings(raw["improvement_points"]),
      "job_fit" => job_description ? Interviewing.text(raw["job_fit"]).presence : nil
    }
  end
end
