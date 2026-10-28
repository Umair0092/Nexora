# A team member's note on a candidate. "@Name" mentions of teammates are
# resolved when the note is saved, and those teammates are emailed.
class CandidateNote < ApplicationRecord
  belongs_to :candidate
  belongs_to :user, optional: true

  validates :body, presence: true, length: { maximum: 5000 }

  # Teammates (other than the author) whose "@Full Name" appears in the body.
  # Longer names win, so "@Sam Lee" doesn't also mention "Sam".
  def self.mentions_in(body, organization, author)
    remaining = body.to_s
    organization.users.where.not(id: author.id).to_a
                .sort_by { |u| -HiringSerializer.display_name(u).length }
                .select do |u|
                  tag = "@#{HiringSerializer.display_name(u)}"
                  next false unless remaining.include?(tag)

                  remaining = remaining.gsub(tag, "")
                  true
                end
  end
end
