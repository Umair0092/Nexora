# What each plan includes. Limits only apply when billing is switched on
# (STRIPE_SECRET_KEY is set); a self-hosted install without it has no limits.
#
#   Plan.for(org).allows?(:notetaker)
#   Plan.for(org).limit(:open_jobs)      # => 1, or nil for no limit
class Plan
  ALL = {
    "free" => { name: "Free", price: 0, open_jobs: 1, candidates_per_month: 25, notetaker: false, webhooks: false,
                blurb: "Try Nexora on one role." },
    "team" => { name: "Team", price: 49, open_jobs: nil, candidates_per_month: 500, notetaker: true, webhooks: true,
                blurb: "For a hiring team screening every week." },
    "business" => { name: "Business", price: nil, open_jobs: nil, candidates_per_month: nil, notetaker: true, webhooks: true,
                    blurb: "For larger teams: unlimited candidates and help rolling it out." }
  }.freeze

  attr_reader :key

  def self.for(organization)
    new(organization.plan)
  end

  def self.billing?
    StripeBilling.configured?
  end

  def initialize(key)
    @key = ALL.key?(key) ? key : "free"
  end

  def name = ALL[@key][:name]

  def limit(name)
    self.class.billing? ? ALL[@key][name] : nil
  end

  def allows?(feature)
    !self.class.billing? || ALL[@key][feature]
  end

  # The usage counters the billing page shows, and the checks behind them.
  def self.usage(organization)
    {
      openJobs: organization.jobs.where(status: "open").count,
      candidatesThisMonth: organization.candidates.where(candidates: { created_at: Time.current.beginning_of_month.. }).count
    }
  end

  # => nil when allowed, or a message to show.
  def self.blocked(organization, action)
    plan = self.for(organization)
    usage = usage(organization)
    case action
    when :open_job
      cap = plan.limit(:open_jobs)
      "The #{plan.name} plan includes #{cap} open job. Close one or upgrade to open more." if cap && usage[:openJobs] >= cap
    when :invite
      cap = plan.limit(:candidates_per_month)
      "You've invited #{cap} candidates this month, the #{plan.name} plan's limit. Upgrade to invite more." if cap && usage[:candidatesThisMonth] >= cap
    when :notetaker
      "The notetaker comes with the Team plan." unless plan.allows?(:notetaker)
    when :webhooks
      "Webhooks come with the Team plan." unless plan.allows?(:webhooks)
    end
  end
end
