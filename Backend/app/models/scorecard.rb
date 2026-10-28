# One team member's assessment of a candidate: 1–5 per job criterion.
class Scorecard < ApplicationRecord
  RECOMMENDATIONS = %w[advance hold reject].freeze

  belongs_to :candidate
  belongs_to :user

  validates :recommendation, inclusion: { in: RECOMMENDATIONS }, allow_nil: true
  validates :notes, length: { maximum: 5000 }
  validate :ratings_match_criteria

  private

  def ratings_match_criteria
    criteria = candidate.job.criteria
    return if ratings.is_a?(Hash) && ratings.all? { |k, v| criteria.include?(k) && v.is_a?(Integer) && v.between?(1, 5) }

    errors.add(:ratings, "must rate the job's criteria from 1 to 5")
  end
end
