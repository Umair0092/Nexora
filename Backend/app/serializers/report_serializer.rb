# The report page payload: report fields, the evaluation and camera summary
# merged in, the session, and every answer with its retries. Keys are camelCase.
#
# `public: true` is the read-only shared view: no ids, share token or job
# description, and nothing about the account.
class ReportSerializer
  ANSWER_FIELDS = %w[id transcript score feedback strengths weaknesses duration ideal_answer improved_answer
                     improvement_notes speech_metrics star].freeze
  ATTEMPT_FIELDS = %w[id transcript score feedback recommendation strengths improvements star speech_metrics created_at].freeze
  SESSION_FIELDS = %w[id title interview_type language status total_questions completed_questions overall_score
                      started_at completed_at].freeze

  def self.call(report, public: false)
    new(report, public).as_json
  end

  def initialize(report, public)
    @report = report
    @session = report.interview_session
    @public = public
  end

  def as_json
    data = self.class.camelize(@report.as_json(except: %w[share_token user_id behavioral_summary]))
    summary = @report.behavioral_summary.is_a?(Hash) ? @report.behavioral_summary.deep_dup : {}
    summary["evaluation"]&.delete("job_description") if @public
    summary["nonVerbalData"] = nil unless @report.camera_analysed?
    data.merge!(self.class.camelize(summary))
    data["shareUrl"] = self.class.share_url(@report) unless @public
    data["shared"] = @report.shared? unless @public
    data["hasJobDescription"] = @session.job_description.present?

    session = @session.as_json(only: SESSION_FIELDS, include: { domain: { only: %w[id name] } })
    data["session"] = self.class.camelize(session)
    data["answers"] = @session.answers.includes(:question, :attempts).map { |a| self.class.answer(a) }
    data.delete("id") if @public
    data
  end

  def self.share_url(report)
    return nil unless report.shared?

    "#{ENV.fetch('APP_URL', 'http://127.0.0.1:5001').chomp('/')}/shared/#{report.share_token}"
  end

  def self.answer(answer)
    json = answer.as_json(only: ANSWER_FIELDS)
    json["question"] = { "id" => answer.question_id, "text" => answer.question&.text }
    json["attempts"] = answer.attempts.map { |a| a.as_json(only: ATTEMPT_FIELDS) }
    camelize(json)
  end

  def self.camelize(hash)
    hash.deep_transform_keys { |key| key.to_s.camelize(:lower) }
  end
end
