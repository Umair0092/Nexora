require "csv"

# The technical question bank (db/data/question_bank.csv): about 9,000
# questions with model answers, by category and difficulty. Loaded once and
# kept in memory; it's ~2 MB.
#
#   QuestionBank.categories                       # => ["AI (Data Science)", "Containers and Cloud", ...]
#   QuestionBank.pick("SQL", 5, "medium")         # => [{ "question" => ..., "ideal_answer" => ... }, ...]
module QuestionBank
  PATH = Rails.root.join("db/data/question_bank.csv")
  DIFFICULTIES = %w[easy medium hard].freeze

  # Share of each difficulty in a quiz, by the level the candidate picked.
  WEIGHTS = {
    "easy" => { "Easy" => 0.70, "Medium" => 0.20, "Hard" => 0.10 },
    "medium" => { "Easy" => 0.20, "Medium" => 0.60, "Hard" => 0.20 },
    "hard" => { "Easy" => 0.10, "Medium" => 0.20, "Hard" => 0.70 }
  }.freeze

  module_function

  def rows
    @rows ||= CSV.foreach(PATH, headers: true).map do |row|
      {
        "id" => row["ID"].to_s,
        "category" => row["Category"].to_s.strip,
        "question" => row["Question"].to_s.strip,
        # The source prefixes every model answer with "Answer: ".
        "ideal_answer" => row["Answer"].to_s.strip.delete_prefix("Answer:").strip,
        "difficulty" => row["Difficulty"].to_s.strip.capitalize
      }
    end.freeze
  end

  def categories
    @categories ||= rows.map { |r| r["category"] }.uniq.sort.freeze
  end

  # A fresh random selection with the weighted difficulty mix, topped up from
  # the rest of the category when a level runs short. May return fewer than
  # `count` questions when the category is small.
  def pick(category, count, difficulty)
    pool = rows.select { |r| r["category"] == category }
    raise ArgumentError, "No questions found for role: '#{category}'" if pool.empty?

    # The bank repeats some questions under different ids; never ask one twice.
    targets = WEIGHTS.fetch(difficulty).transform_values { |w| [ (count * w).round(half: :even), 1 ].max }
    selected = targets.flat_map do |level, n|
      pool.select { |r| r["difficulty"] == level }.uniq { |r| r["question"] }.sample(n)
    end.uniq { |r| r["question"] }

    if selected.size < count
      taken = selected.map { |r| r["question"] }.to_set
      selected += pool.reject { |r| taken.include?(r["question"]) }.uniq { |r| r["question"] }.sample(count - selected.size)
    elsif selected.size > count
      selected = selected.sample(count)
    end

    selected.shuffle.map { |r| r.slice("question", "ideal_answer") }
  end
end
