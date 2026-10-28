# Demo data for screenshots, videos and trying the hiring side without an AI key.
#
#   DEMO_EMAIL=you@example.com DEMO_PASSWORD=... bin/rails demo:seed
#
# Creates (or rebuilds) a company called Northwind Labs owned by DEMO_EMAIL, with
# three jobs and candidates at every stage. Evaluations, CV matches and the
# activity log are written directly, spread over the last six weeks, so nothing
# calls the AI service. Running it again replaces the previous demo company.
namespace :demo do
  desc "Create a demo company with jobs, candidates and activity"
  task seed: :environment do
    abort "Refusing to seed demo data in production. Set DEMO_SEED_PRODUCTION=1 to allow it." if Rails.env.production? && ENV["DEMO_SEED_PRODUCTION"] != "1"
    email, password = ENV["DEMO_EMAIL"].presence, ENV["DEMO_PASSWORD"].presence
    abort "Set DEMO_EMAIL and DEMO_PASSWORD (8+ characters) for the demo owner's account." unless email && password

    org = DemoData.new(email: email, password: password).build
    puts "Seeded #{org.name}: #{org.jobs.count} jobs, #{org.candidates.count} candidates. Sign in as #{email}."
  end
end

class DemoData
  COMPANY = "Northwind Labs".freeze
  TEAMMATES = [
    { first_name: "Riya", last_name: "Shah", email: "riya.shah@northwind.example" },
    { first_name: "Daniel", last_name: "Okafor", email: "daniel.okafor@northwind.example" }
  ].freeze

  JOBS = [
    {
      title: "Backend Engineer",
      opened: 40,
      description: "Build and run the payments APIs behind Northwind's checkout in Ruby on Rails and PostgreSQL. " \
                   "You'll own services end to end, share on-call and work closely with product.",
      questions: [
        "Tell us about a backend service you owned end to end. What did you build and what broke first?",
        "A payments endpoint slows from 80ms to 2s at peak. How do you find the cause?",
        "How do you make a payment request safe to retry?",
        "Describe an incident you handled on call. What did you change afterwards?",
        "How do you decide when to add a cache, and what do you watch once it's live?"
      ],
      criteria: [ "System design", "Debugging and incidents", "Reliability practices", "Communication" ]
    },
    {
      title: "Product Designer",
      opened: 30,
      description: "Design the merchant dashboard used by 4,000 shops. You'll run research, prototype in Figma " \
                   "and ship with two engineering squads.",
      questions: [
        "Walk us through a design decision you changed after testing it with users.",
        "How do you design for a merchant who uses the dashboard once a month?",
        "Tell us about a time engineering pushed back on a design. What happened?",
        "How do you know a shipped design worked?"
      ],
      criteria: [ "User research", "Interaction design", "Collaboration" ]
    },
    {
      title: "Data Analyst",
      opened: 42,
      closed: true,
      description: "Turn payments data into weekly decisions for finance and risk. SQL every day, " \
                   "dashboards in Metabase, and clear write-ups for people who don't read SQL.",
      questions: [
        "Tell us about an analysis that changed a decision.",
        "Refunds rose 12% last week. Where do you start?",
        "How do you explain a confidence interval to a finance lead?"
      ],
      criteria: [ "SQL and analysis", "Business judgement", "Communication" ]
    }
  ].freeze

  # name, job index, how far they got, AI score (0-100), days since invited
  CANDIDATES = [
    [ "Omar Farooq", 0, "offer", 86, 34 ],
    [ "Lena Ortiz", 0, "interviewing", 81, 29 ],
    [ "Kenji Watanabe", 0, "shortlisted", 77, 21 ],
    [ "Amara Nwosu", 0, "review", 72, 12 ],
    [ "Sofia Marquez", 0, "review", 64, 9 ],
    [ "Tomasz Nowak", 0, "rejected", 41, 26 ],
    [ "Hannah Becker", 0, "invited", nil, 3 ],
    [ "Arjun Mehta", 0, "invited", nil, 1 ],
    [ "Grace Lee", 1, "interviewing", 84, 24 ],
    [ "Mateo Rossi", 1, "shortlisted", 75, 15 ],
    [ "Zainab Hussain", 1, "review", 69, 6 ],
    [ "Noah Fischer", 1, "withdrawn", nil, 18 ],
    [ "Priya Sharma", 2, "hired", 88, 41 ],
    [ "Ethan Clarke", 2, "rejected", 58, 38 ],
    [ "Mei Chen", 2, "rejected", 62, 36 ]
  ].freeze

  # One full answer per question. Middling candidates give the first two
  # sentences; weak ones give a vague answer.
  ANSWERS = [
    "I owned the payouts service at Brightpay, which moves merchant balances to their bank every night. The first thing that broke was the batch job: it held one long transaction and locked the ledger table. I split it into per-merchant jobs with their own retries, and the nightly run went from three hours to twenty minutes.",
    "I'd look at the traces first, to see whether the time goes to the database, a downstream call or the app itself. If it's the database, I'd check the slow query log and the query plans at peak against a normal day. Last time this happened to us it was a missing index after a migration, and we added a latency alert so we'd catch it sooner.",
    "The client sends an idempotency key with each payment, and we store the key with the result before replying. A retry with the same key gets the stored result instead of charging again. Keys expire after a day, and we return a conflict if the same key arrives with a different amount.",
    "A card provider started timing out on a Friday evening and our checkout queued up behind it. I turned on the fallback provider with a feature flag, then wrote the timeline for the post-mortem. Afterwards we added a circuit breaker and a runbook, so the next person on call doesn't need to know the history.",
    "Only when I can measure the problem and the data can be a little stale. I'd cache the merchant settings lookup, for example, but never a balance. Once it's live I watch the hit rate, the latency it saves and how often we serve something stale.",
    "We designed a bulk refund flow as one long form, and in testing four of five merchants stopped halfway. We split it into a review step and a confirm step. Completion went up and support tickets about refunds dropped by a third.",
    "I assume they've forgotten how it works since last time. Labels say what things do, the most common task is on the first screen, and nothing important hides behind hover. I test with people who haven't seen it for a month, not with our power users.",
    "Engineering said our animated chart would be slow on older phones. We sat down together and agreed on a static chart with one animated total. It shipped a sprint early and nobody missed the animation.",
    "We decide what success looks like before we ship, usually a task completion rate or fewer support tickets. Then I check the numbers two and six weeks after launch, and watch a handful of real sessions.",
    "I found that a third of failed payouts came from one bank's format change. Finance had planned to hire two people to handle them by hand. Instead we fixed the export and the backlog cleared in a week.",
    "First I'd check whether it's real: a change in how refunds are logged, or one big merchant. Then I'd split it by merchant, product and reason code to see where the extra refunds come from, and talk to support about what they're hearing.",
    "I'd say it's the range where the true number probably sits, given how much data we have. With more data the range gets narrower. Then I'd show it on their own chart rather than define it in the abstract."
  ].freeze
  WEAK_ANSWER = "I would probably look at what changed recently and ask the team. I haven't done exactly this before, but I think it depends on the situation.".freeze

  NOTES = [
    "Strong on the retry question: she described idempotency keys without prompting.",
    "@Riya Shah can you take the system design round on Thursday?",
    "Salary expectation is within band. Notice period four weeks.",
    "Good portfolio, but the case study skipped the research. Worth asking about in the panel."
  ].freeze

  def initialize(email:, password:)
    @email = email.strip.downcase
    @password = password
  end

  def build
    ActiveRecord::Base.transaction do
      owner = user(@email, "Alex", "Morgan", password: @password)
      Organization.joins(:memberships).where(name: COMPANY, memberships: { user_id: owner.id }).destroy_all
      Membership.where(user: owner).delete_all

      org = Organization.create!(name: COMPANY, created_at: 45.days.ago)
      org.memberships.create!(user: owner, role: "owner")
      team = TEAMMATES.map do |t|
        member = user(t[:email], t[:first_name], t[:last_name])
        Membership.where(user: member).delete_all
        org.memberships.create!(user: member, role: "recruiter")
        member
      end
      @people = [ owner, *team ]

      jobs = JOBS.map do |spec|
        org.jobs.create!(title: spec[:title], description: spec[:description], questions: spec[:questions],
                         criteria: spec[:criteria], answer_seconds: 120, status: spec[:closed] ? "closed" : "open",
                         created_by: owner, created_at: spec[:opened].days.ago)
      end
      jobs.each { |j| org.hiring_events.create!(action: "job_created", user: owner, details: { job_id: j.id }, created_at: j.created_at) }
      CANDIDATES.each_with_index { |row, i| candidate(org, jobs[row[1]], *row, i) }
      org
    end
  end

  private

  def user(email, first, last, password: SecureRandom.base58(24))
    u = User.find_or_initialize_by(email: email)
    u.assign_attributes(first_name: first, last_name: last, email_verified_at: u.email_verified_at || Time.current)
    u.password = password if u.new_record? || password == @password
    u.save!
    u
  end

  def candidate(org, job, name, _job_index, column, score, days_ago, index)
    invited = days_ago.days.ago.change(hour: 10)
    by = @people[index % @people.size]
    c = job.candidates.create!(name: name, email: "#{name.parameterize(separator: '.')}@example.com", invited_by: by,
                               created_at: invited, updated_at: invited)
    org.hiring_events.create!(action: "candidate_invited", user: by, candidate: c, created_at: invited)
    return c if column == "invited"

    if column == "withdrawn"
      c.update!(status: "withdrawn")
      org.hiring_events.create!(action: "candidate_withdrew", candidate: c, created_at: invited + 2.days)
      return c
    end

    done = invited + (1 + index % 3).days + 3.hours
    quality = score >= 75 ? :strong : score >= 60 ? :good : :weak
    job.questions.each_with_index do |q, pos|
      full = ANSWERS[JOBS.flat_map { |j| j[:questions] }.index(q)]
      text = { strong: full, good: full.split(/(?<=\.) /).first(2).join(" "), weak: WEAK_ANSWER }.fetch(quality)
      c.answers.create!(position: pos, question: q, transcript: text, duration_seconds: 70 + (index * 7 + pos * 11) % 50)
    end
    c.update!(status: "completed", consented_at: done - 25.minutes, started_at: done - 24.minutes, completed_at: done,
              evaluation_status: "done", ai_score: score, ai_evaluation: evaluation(job, score, quality),
              resume_status: "done", resume_score: (score + (index % 5) * 3 - 6).clamp(20, 98),
              resume_data: resume(name, job), resume_match: resume_match(job, quality))
    org.hiring_events.create!(action: "candidate_consented", candidate: c, created_at: done - 25.minutes)
    org.hiring_events.create!(action: "resume_added", candidate: c, created_at: done - 24.minutes)
    org.hiring_events.create!(action: "candidate_completed", candidate: c, created_at: done)

    stages = { "review" => [], "shortlisted" => %w[shortlisted], "interviewing" => %w[shortlisted interviewing],
               "offer" => %w[shortlisted interviewing offer], "hired" => %w[shortlisted interviewing offer hired],
               "rejected" => %w[rejected] }.fetch(column)
    from = nil
    stages.each_with_index do |stage, step|
      at = done + (step + 1) * 3.days
      org.hiring_events.create!(action: "stage_changed", user: @people[step % @people.size], candidate: c,
                                details: { from: from, to: stage }, created_at: at)
      from = stage
    end
    c.update!(stage: stages.last) if stages.any?
    interviews(org, c, stages, index)

    @people.first(stages.any? ? 2 : 1).each_with_index do |person, k|
      ratings = job.criteria.to_h { |cr| [ cr, (score / 20.0 + ((cr.length + k) % 3) - 1).round.clamp(1, 5) ] }
      c.scorecards.create!(user: person, ratings: ratings, recommendation: score >= 70 ? "advance" : score >= 55 ? "hold" : "reject",
                           notes: k.zero? ? "Clear answers with concrete examples." : "")
      org.hiring_events.create!(action: "scorecard_saved", user: person, candidate: c, created_at: done + (k + 1).days)
    end
    return c unless index.even?

    author = @people[(index + 1) % @people.size]
    c.notes.create!(user: author, body: NOTES[index % NOTES.size], created_at: done + 1.day)
    org.hiring_events.create!(action: "note_added", user: author, candidate: c, details: { mentions: 0 }, created_at: done + 1.day)
    c
  end

  # A booked interview for anyone at Interviewing; past ones for people further on.
  def interviews(org, c, stages, index)
    return unless stages.include?("interviewing")

    upcoming = stages.last == "interviewing"
    starts = upcoming ? (1 + index % 3).days.from_now.change(hour: 11 + index % 4) : c.completed_at + 6.days + 4.hours
    code = Digest::SHA256.hexdigest(c.name)[0, 10].tr("0-9", "a-j")
    meeting = org.meetings.create!(candidate: c, created_by: @people.first, title: "Interview: #{c.name}, #{c.job.title}",
                                   starts_at: starts, duration_minutes: 45, time_zone: "Europe/London",
                                   meeting_url: "https://meet.google.com/#{code[0, 3]}-#{code[3, 4]}-#{code[7, 3]}",
                                   agenda: "System design for 30 minutes, then time for their questions.",
                                   panelists: @people.first(2), created_at: starts - 3.days)
    org.hiring_events.create!(action: "meeting_scheduled", user: @people.first, candidate: c,
                              details: { meeting_id: meeting.id }, created_at: [ starts - 3.days, Time.current ].min)
    return if upcoming

    # Interviews that already happened have the notetaker's transcript and minutes.
    meeting.update!(notetaker: true, notetaker_status: "done", transcript_source: "bot", transcript: call_transcript(c, meeting),
                    minutes: call_minutes(c), minutes_status: "done", minutes_at: meeting.ends_at + 3.minutes)
    org.hiring_events.create!(action: "minutes_ready", candidate: c, details: { meeting_id: meeting.id }, created_at: meeting.ends_at + 3.minutes)
  end

  def call_transcript(c, meeting)
    lead = meeting.panelists.first.then { |u| "#{u.first_name} #{u.last_name}" }
    [
      [ lead, 4, "Thanks for making the time. Let's start with the payouts design we sent over. Talk us through it." ],
      [ c.name, 15, "I split it into a scheduler that picks the merchants due tonight and one job per merchant, each with its own retries." ],
      [ lead, 52, "What if the bank call times out but the money moved?" ],
      [ c.name, 58, "Every payout carries an idempotency key that we store with the result, so a retry gets the original answer instead of paying twice." ],
      [ "Riya Shah", 140, "How would you roll that out without risking tonight's run?" ],
      [ c.name, 147, "Behind a flag for five per cent of merchants, comparing totals against the old job for a week before switching." ],
      [ "Riya Shah", 610, "Any questions for us?" ],
      [ c.name, 615, "How is on-call shared, and what does the first month look like?" ]
    ].map { |speaker, start, text| { "speaker" => speaker, "start" => start.to_f, "text" => text } }
  end

  def call_minutes(c)
    first = c.name.split.first
    {
      "summary" => "The panel went through #{first}'s payouts design, failure handling and rollout plan. #{first} gave concrete, " \
                   "well-reasoned answers on idempotency and a staged rollout, and asked about on-call and onboarding.",
      "topics" => [
        { "title" => "Payouts design", "notes" => "A scheduler for due merchants and one job per merchant with its own retries, so one failure doesn't block the rest." },
        { "title" => "Timeouts and double payments", "notes" => "Idempotency keys stored with each result; retries return the original answer." },
        { "title" => "Rollout", "notes" => "Behind a flag for 5% of merchants, comparing totals with the old job for a week." },
        { "title" => "Questions from #{first}", "notes" => "Asked how on-call is shared and what the first month looks like." }
      ],
      "criteria" => [
        { "criterion" => "System design", "signal" => "strong", "evidence" => "Per-merchant jobs with isolated retries; a clear split between scheduling and work." },
        { "criterion" => "Debugging and incidents", "signal" => "mixed", "evidence" => "Covered prevention well; less on how they'd investigate a live failure." },
        { "criterion" => "Reliability practices", "signal" => "strong", "evidence" => "Idempotency keys, staged rollout behind a flag, comparing totals before switching." },
        { "criterion" => "Communication", "signal" => "strong", "evidence" => "Structured answers that started from the risk, then the fix." }
      ],
      "candidateQuestions" => [ "How is on-call shared?", "What does the first month look like?" ],
      "concerns" => [ "Didn't size the ledger table's growth", "Little on investigating a failure in progress" ],
      "followUps" => [ { "owner" => "Riya Shah", "item" => "Send the offer details" }, { "owner" => "Panel", "item" => "Ask about incident investigation in the final call" } ]
    }
  end

  def evaluation(job, score, quality)
    {
      "answers" => job.questions.map.with_index { |_, i| { "score" => ((score / 10.0) + [ 0.5, -0.5, 0, 1, -1 ][i % 5]).round.clamp(1, 10), "summary" => summary(quality) } },
      "criteria" => job.criteria.map.with_index { |cr, i| { "criterion" => cr, "rating" => (score / 20.0 + [ 0, 0.5, -0.5 ][i % 3]).round.clamp(1, 5), "evidence" => summary(quality) } },
      "summary" => summary(quality),
      "strengths" => quality == :weak ? [ "Honest about gaps" ] : [ "Measures before changing things", "Concrete examples from real incidents" ],
      "gaps" => quality == :strong ? [ "Little on cost trade-offs" ] : [ "Answers stay general", "No follow-up after fixes" ]
    }
  end

  def summary(quality)
    { strong: "Specific, structured answers grounded in work the candidate did, with clear follow-through.",
      good: "Sound approach and a relevant example, though light on detail about their own part.",
      weak: "General answers without examples; unclear how they would approach the problem." }.fetch(quality)
  end

  # Same shape ResumeParser.normalize returns.
  def resume(name, job)
    skills = { "Backend Engineer" => %w[Ruby Rails PostgreSQL Redis Sidekiq AWS],
               "Product Designer" => [ "Figma", "User interviews", "Prototyping", "Design systems" ],
               "Data Analyst" => %w[SQL Python Metabase dbt Statistics] }.fetch(job.title)
    {
      "name" => name, "degree" => "BSc Computer Science", "summary" => "#{job.title} with five years in fintech and marketplaces.",
      "skills" => skills,
      "work_experience" => [
        { "company" => "Brightpay", "role" => job.title, "duration" => "2022 - now", "description" => "Owns the team's busiest service and its on-call rota." },
        { "company" => "Cartwheel", "role" => "Junior #{job.title}", "duration" => "2019 - 2022", "description" => nil }
      ],
      "projects_done" => [ "Cut checkout latency by 40%", "Led the move to a shared design system" ],
      "education" => [ { "institution" => "University of Leeds", "course" => "BSc Computer Science", "duration" => "2015 - 2019", "score" => nil } ],
      "achievements" => [ "Speaker at a regional meetup" ]
    }
  end

  def resume_match(job, quality)
    met = job.criteria.first(quality == :weak ? 1 : 3).map { |cr| { "requirement" => cr, "evidence" => "Described in their most recent role." } }
    { "summary" => summary(quality), "met" => met, "missing" => quality == :strong ? [] : [ job.criteria.last ] }
  end
end
