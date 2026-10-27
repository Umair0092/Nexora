class Report < ApplicationRecord
  belongs_to :interview_session, foreign_key: :session_id
  belongs_to :user

  # Older reports stored an all-zero camera summary when no camera ran; treat
  # those the same as a missing one.
  def camera_analysed?
    data = behavioral_summary.is_a?(Hash) ? behavioral_summary["nonVerbalData"] : nil
    return false unless data.is_a?(Hash)

    Hash(data["attention_distribution"]).values.sum { |v| v.to_f }.positive?
  end

  def shared?
    share_token.present?
  end

  # Creates the public link token, or keeps the existing one.
  def share!
    return share_token if shared?

    update!(share_token: SecureRandom.urlsafe_base64(24), shared_at: Time.current)
    share_token
  end

  def unshare!
    update!(share_token: nil, shared_at: nil)
  end
end
