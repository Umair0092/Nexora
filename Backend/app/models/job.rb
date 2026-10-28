# An opening with a fixed set of questions every candidate answers, and the
# criteria the team scores them on.
class Job < ApplicationRecord
  STATUSES = %w[open closed].freeze
  QUESTIONS = 3..10
  CRITERIA = 2..6
  ANSWER_SECONDS = [ 60, 90, 120, 180, 240 ].freeze
  MAX_ITEM = 500

  belongs_to :organization
  belongs_to :created_by, class_name: "User", optional: true
  has_many :candidates, dependent: :destroy

  validates :title, presence: true, length: { maximum: 120 }
  validates :description, length: { maximum: Interviewing::MAX_JOB_DESCRIPTION }
  validates :status, inclusion: { in: STATUSES }
  validates :answer_seconds, inclusion: { in: ANSWER_SECONDS }
  validate :questions_and_criteria_shape
  validate :questions_locked, on: :update

  normalizes :questions, :criteria, with: ->(list) { Array(list).map { |item| item.to_s.squish }.reject(&:blank?) }

  def open?
    status == "open"
  end

  # Once a candidate has started, changing the questions would make answers
  # incomparable.
  def questions_locked?
    candidates.where.not(consented_at: nil).exists?
  end

  private

  def questions_and_criteria_shape
    errors.add(:questions, "must have #{QUESTIONS.min}–#{QUESTIONS.max} questions") unless QUESTIONS.cover?(questions.size)
    errors.add(:criteria, "must have #{CRITERIA.min}–#{CRITERIA.max} criteria") unless CRITERIA.cover?(criteria.size)
    errors.add(:base, "Each question and criterion can be up to #{MAX_ITEM} characters") if (questions + criteria).any? { |q| q.length > MAX_ITEM }
  end

  def questions_locked
    return unless (will_save_change_to_questions? || will_save_change_to_criteria? || will_save_change_to_answer_seconds?) && questions_locked?

    errors.add(:base, "Questions, criteria and the time limit can't change after a candidate has started")
  end
end
