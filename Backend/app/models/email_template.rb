# A reusable email to candidates. {{placeholders}} are filled per candidate.
#
#   template.fill(candidate)  # => { subject: "...", body: "..." }
class EmailTemplate < ApplicationRecord
  PLACEHOLDERS = %w[first_name name job company link].freeze

  # Every company starts with these; they can be edited or deleted.
  DEFAULTS = [
    {
      name: "Reminder to finish the interview",
      subject: "Reminder: your screening interview for {{job}}",
      body: <<~TEXT
        Hi {{first_name}},

        A quick reminder that your screening interview for the {{job}} role at {{company}} is still waiting for you. It takes about 15 minutes and you can do it whenever suits you:

        {{link}}

        Thanks,
        {{company}}
      TEXT
    },
    {
      name: "Moving forward",
      subject: "Next steps for {{job}} at {{company}}",
      body: <<~TEXT
        Hi {{first_name}},

        Thank you for your screening interview for {{job}}. We enjoyed hearing your answers and would like to invite you to the next stage. We'll be in touch shortly to arrange a time.

        Best,
        {{company}}
      TEXT
    },
    {
      name: "Not moving forward",
      subject: "Your application for {{job}} at {{company}}",
      body: <<~TEXT
        Hi {{first_name}},

        Thank you for taking the time to interview for {{job}}. After careful review, we've decided not to move forward with your application at this point.

        We appreciate your interest in {{company}} and wish you the best in your search.

        Kind regards,
        {{company}}
      TEXT
    }
  ].freeze

  belongs_to :organization

  validates :name, presence: true, length: { maximum: 80 }, uniqueness: { scope: :organization_id }
  validates :subject, presence: true, length: { maximum: 200 }
  validates :body, presence: true, length: { maximum: 10_000 }

  def fill(candidate)
    { subject: self.class.fill(subject, candidate), body: self.class.fill(body, candidate) }
  end

  # Unknown {{placeholders}} are left as typed so the sender notices them.
  def self.fill(text, candidate)
    values = {
      "first_name" => candidate.name.split.first.to_s,
      "name" => candidate.name,
      "job" => candidate.job.title,
      "company" => candidate.organization.name,
      "link" => candidate.interview_url
    }
    text.to_s.gsub(/\{\{\s*(\w+)\s*\}\}/) { values.fetch(::Regexp.last_match(1), ::Regexp.last_match(0)) }
  end
end
