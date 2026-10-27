# One technical quiz: questions from the QuestionBank, answered one by one and
# marked against the bank's model answers. For non-English quizzes the
# questions are translated once, when the quiz starts.
#
# Progress is a single counter, "answered": the current question is
# questions[answered], and the quiz is complete once every question has an
# answer. State is a plain hash (LiveInterview#state).
#
#   quiz = QuizRun.build(category: "SQL", num_questions: 5, difficulty: "medium")
#   quiz.current_question               # => "What does GROUP BY do?"
#   quiz.answer!("It groups rows", nil) # => ["What is an index?", false]
#   quiz.evaluate!                      # => Hash, cached until the next answer
class QuizRun
  include Interviewing

  TOKENS = 8000

  EVALUATION_SCHEMA = {
    type: "object",
    properties: {
      per_question: {
        type: "array",
        items: {
          type: "object",
          properties: {
            question: { type: "string" }, answer: { type: "string" }, ideal_answer: { type: "string" },
            score: { type: "integer" }, strengths: STRINGS, improvements: STRINGS, feedback: { type: "string" }
          },
          required: %w[question answer ideal_answer score strengths improvements feedback]
        }
      },
      overall_score: { type: "integer" }, communication_score: { type: "integer" }, technical_score: { type: "integer" },
      top_strengths: STRINGS, areas_to_improve: STRINGS, summary: { type: "string" },
      hire_recommendation: { type: "string", enum: HIRE_RECOMMENDATIONS }
    },
    required: %w[per_question overall_score communication_score technical_score top_strengths areas_to_improve
                 summary hire_recommendation]
  }.freeze

  attr_reader :state

  def self.build(category:, num_questions: 5, difficulty: "medium", language: "en")
    questions = QuestionBank.pick(category, num_questions, difficulty)
    quiz = new(
      "target_role" => category,
      "difficulty" => difficulty,
      "language" => Interviewing.language(language),
      "answered" => 0,
      "questions" => questions,
      "answers" => Array.new(questions.size),
      "speech" => Array.new(questions.size),
      "translations" => {},
      "evaluation" => nil,
      "evaluated_answers" => 0
    )
    quiz.send(:translate_questions) unless quiz.language == "en"
    quiz
  end

  def initialize(state)
    @state = state
  end

  %w[target_role difficulty language answered questions].each do |key|
    define_method(key) { state[key] }
  end

  def num_questions
    questions.size
  end

  def complete?
    answered >= num_questions
  end

  # Questions shown so far, including the current unanswered one.
  def questions_asked
    [ answered + 1, num_questions ].min
  end

  # The current question in the quiz's language, or nil when complete.
  def current_question
    complete? ? nil : translated(questions[answered]["question"])
  end

  def translated(question)
    return question if question.nil? || language == "en"

    state["translations"].fetch(question, question)
  end

  # Records the answer for the current question; returns [next_question, complete?].
  def answer!(text, speech)
    return [ nil, true ] if complete?

    state["answers"][answered] = text.to_s.strip
    state["speech"][answered] = speech
    state["answered"] = answered + 1
    [ current_question, complete? ]
  end

  # Answered questions so far. Model answers are only revealed once the quiz
  # is complete, so they can't be read ahead.
  def transcript
    answered_pairs.map do |p|
      { "question" => translated(p["question"]), "answer" => p["answer"], "ideal_answer" => complete? ? p["ideal_answer"] : nil }
    end
  end

  def evaluate!
    pairs = answered_pairs
    return nil if pairs.empty?
    return state["evaluation"] if state["evaluation"] && state["evaluated_answers"] == pairs.size

    raw = Llm.json(evaluation_prompt(pairs), schema: EVALUATION_SCHEMA, name: "EvaluationResult", max_tokens: TOKENS)
    state["evaluation"] = clean_evaluation(raw, pairs)
    state["evaluated_answers"] = pairs.size
    state["evaluation"]
  rescue Llm::Error => e
    Rails.logger.error("Quiz evaluation failed: #{e.message}")
    Interviewing.model_failure!(e, "Evaluation failed. Please try again later.")
  end

  def summary
    {
      "target_role" => target_role,
      "language" => language,
      "interview_style" => "standard",
      "job_description" => nil,
      "questions_asked" => questions_asked,
      "num_questions" => num_questions,
      "is_complete" => complete?
    }
  end

  private

  def answered_pairs
    questions.first(answered).each_with_index.map do |q, i|
      { "question" => q["question"], "ideal_answer" => q["ideal_answer"], "answer" => state["answers"][i].to_s }
    end
  end

  # One call translates every question. On any failure the quiz stays in English.
  def translate_questions
    originals = questions.map { |q| q["question"] }
    prompt = "Translate each question in the following JSON array into #{Interviewing.language_name(language)}. " \
             "Return ONLY a valid JSON array of the same length in the same order. " \
             "Do not add any explanation, markdown, or extra text — just the JSON array.\n\n#{originals.to_json}"
    raw = Llm.chat([ { role: "user", content: prompt } ], max_tokens: TOKENS)
    list = JSON.parse(raw.sub(/\A```(?:json)?\s*/i, "").sub(/\s*```\z/, ""))
    raise ArgumentError, "translation is not a list" unless list.is_a?(Array)

    originals.zip(list).each do |original, translation|
      state["translations"][original] = translation.strip if translation.is_a?(String) && translation.strip.present?
    end
  rescue Llm::Error, JSON::ParserError, ArgumentError => e
    Rails.logger.warn("Quiz translation to #{language} failed; using English: #{e.message}")
  end

  def evaluation_prompt(pairs)
    lang = Interviewing.language_name(language)
    transcript = pairs.each_with_index.map do |p, i|
      "Q#{i + 1}: #{p['question']}\nIdeal Answer: #{p['ideal_answer']}\nCandidate Answer: #{p['answer']}"
    end.join("\n\n")

    <<~TEXT
      You are an expert technical interviewer evaluating a #{target_role} quiz.

      LANGUAGE INSTRUCTION:
      Write ALL text fields in your evaluation in #{lang}.
      This includes: strengths, improvements, feedback, top_strengths,
      areas_to_improve, and summary. ideal_answer should be copied exactly as-is.

      QUIZ TRANSCRIPT (each entry shows the question, the ideal answer, and the candidate's answer):
      #{transcript}

      For EACH question-answer pair evaluate the candidate's answer against the ideal answer and provide:
      - score (1-10)
      - strengths (list of what they did well, in #{lang})
      - improvements (list of what could be better, in #{lang})
      - feedback (1-2 sentence evaluation, in #{lang})
      - ideal_answer (copy the ideal answer exactly as given above)

      Then provide an overall evaluation:
      - overall_score (1-10)
      - communication_score (1-10 — clarity and structure of answers)
      - technical_score (1-10 — technical depth and accuracy vs ideal answers)
      - top_strengths (2-3 highlights across the whole quiz, in #{lang})
      - areas_to_improve (2-3 things to work on overall, in #{lang})
      - summary (3-5 sentence overall assessment of the candidate, in #{lang})
      - hire_recommendation: one of "Strong Yes", "Yes", "Maybe", "No"

      Scoring criteria per answer:
      - Relevance to the question (vs ideal answer)
      - Technical depth and accuracy
      - Clarity and communication
      - Use of specific examples and outcomes
    TEXT
  end

  # One entry per answered question with the real question (translated),
  # answer and model answer restored, and scores in 1–10.
  def clean_evaluation(raw, pairs)
    per_question = Array(raw["per_question"]).select { |q| q.is_a?(Hash) }.first(pairs.size)
    per_question = per_question.each_with_index.map do |q, i|
      {
        "question" => translated(pairs[i]["question"]),
        "answer" => pairs[i]["answer"],
        "ideal_answer" => pairs[i]["ideal_answer"],
        "score" => Interviewing.clamp_score(q["score"]),
        "strengths" => Interviewing.strings(q["strengths"]),
        "improvements" => Interviewing.strings(q["improvements"]),
        "feedback" => Interviewing.text(q["feedback"]),
        "speech" => state["speech"][i]
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
      "hire_recommendation" => Interviewing.text(raw["hire_recommendation"])
    }
  end
end
