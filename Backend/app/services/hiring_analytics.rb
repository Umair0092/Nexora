# Numbers for the hiring analytics page, for candidates invited in a period.
#
#   HiringAnalytics.new(org, days: 90, job: nil).to_h
#     -> { funnel[], rates, timing, weekly[], scores, jobs[] }
#
# Stage progress comes from the activity log: a candidate who reached Offer and
# was later rejected still counts as having reached Shortlisted, Interviewing
# and Offer. Times are medians in days, which long tails don't drag around.
class HiringAnalytics
  PERIODS = [ 30, 90, 365 ].freeze
  LADDER = %w[shortlisted interviewing offer hired].freeze

  def initialize(organization, days: 90, job: nil)
    @org = organization
    @days = PERIODS.include?(days) ? days : nil
    @job = job
  end

  def to_h
    { periodDays: @days, funnel: funnel, rates: rates, timing: timing, weekly: weekly, scores: scores, jobs: jobs }
  end

  private

  def candidates
    @candidates ||= begin
      scope = @job ? @job.candidates : @org.candidates
      scope = scope.where(created_at: @days.days.ago..) if @days
      scope.includes(:job).to_a
    end
  end

  # candidate_id -> [ [stage, at], ... ] oldest first
  def moves
    @moves ||= @org.hiring_events.where(action: "stage_changed", candidate_id: candidates.map(&:id)).order(:created_at)
                   .pluck(:candidate_id, Arel.sql("details->>'to'"), :created_at)
                   .group_by(&:first).transform_values { |rows| rows.map { |_, to, at| [ to, at ] } }
  end

  def highest_rung(c)
    reached = [ c.stage, *Array(moves[c.id]).map(&:first) ].compact
    reached.map { |s| LADDER.index(s) }.compact.max
  end

  def funnel
    rungs = candidates.map { |c| highest_rung(c) }
    steps = [
      [ "invited", "Invited", candidates.size ],
      [ "started", "Started the interview", candidates.count(&:consented_at) ],
      [ "completed", "Finished it", candidates.count { |c| c.completed_at } ],
      *LADDER.each_with_index.map { |stage, i| [ stage, stage.capitalize, rungs.count { |r| r && r >= i } ] }
    ]
    steps.each_with_index.map do |(key, label, n), i|
      previous = i.zero? ? nil : steps[i - 1][2]
      { key: key, label: label, count: n, ofPrevious: previous.to_i.positive? ? (100.0 * n / previous).round : nil,
        ofInvited: candidates.any? ? (100.0 * n / candidates.size).round : nil }
    end
  end

  def rates
    invited = candidates.size
    decided = candidates.count { |c| c.completed_at && (c.stage || moves[c.id]) }
    completed = candidates.count(&:completed_at)
    {
      completion: percent(completed, invited),
      withdrawn: percent(candidates.count { |c| c.status == "withdrawn" }, invited),
      reviewed: percent(decided, completed),
      hired: candidates.count { |c| highest_rung(c) == LADDER.index("hired") }
    }
  end

  def timing
    {
      inviteToFinish: median(candidates.filter_map { |c| days_between(c.created_at, c.completed_at) }),
      finishToFirstDecision: median(candidates.filter_map { |c| c.completed_at && days_between(c.completed_at, Array(moves[c.id]).first&.last) }),
      inviteToOffer: median(candidates.filter_map { |c| days_between(c.created_at, reached_at(c, "offer")) }),
      inviteToHire: median(candidates.filter_map { |c| days_between(c.created_at, reached_at(c, "hired")) })
    }
  end

  # Invitations and finished interviews per week (weeks start on Monday).
  def weekly
    weeks = @days ? (@days / 7.0).ceil.clamp(4, 26) : 12
    first = (Time.current - (weeks - 1).weeks).beginning_of_week
    (0...weeks).map do |i|
      from = first + i.weeks
      range = from...(from + 1.week)
      { weekStart: from.to_date, invited: candidates.count { |c| range.cover?(c.created_at) },
        completed: candidates.count { |c| c.completed_at && range.cover?(c.completed_at) } }
    end
  end

  def scores
    ai = candidates.filter_map(&:ai_score)
    {
      bins: (0...10).map { |b| { from: b * 10, to: b == 9 ? 100 : b * 10 + 9, count: ai.count { |s| [ (s / 10).floor, 9 ].min == b } } },
      medianAi: median(ai)&.round,
      medianCv: median(candidates.filter_map(&:resume_score))&.round,
      scored: ai.size
    }
  end

  def jobs
    candidates.group_by(&:job).sort_by { |job, _| [ job.status == "open" ? 0 : 1, job.title ] }.map do |job, list|
      completed = list.count(&:completed_at)
      rungs = list.map { |c| highest_rung(c) }
      {
        id: job.id, title: job.title, status: job.status, invited: list.size, completed: completed,
        completion: percent(completed, list.size), medianAi: median(list.filter_map(&:ai_score))&.round,
        inPipeline: list.count { |c| c.stage.in?(%w[shortlisted interviewing offer]) },
        hired: rungs.count { |r| r == LADDER.index("hired") },
        daysToFirstDecision: median(list.filter_map { |c| c.completed_at && days_between(c.completed_at, Array(moves[c.id]).first&.last) })
      }
    end
  end

  def reached_at(c, stage)
    Array(moves[c.id]).find { |to, _| to == stage }&.last
  end

  def days_between(from, to)
    from && to && to >= from ? ((to - from) / 1.day).round(1) : nil
  end

  def percent(part, whole)
    whole.positive? ? (100.0 * part / whole).round : nil
  end

  def median(values)
    return nil if values.empty?

    sorted = values.sort
    mid = sorted.size / 2
    (sorted.size.odd? ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2.0).round(1)
  end
end
