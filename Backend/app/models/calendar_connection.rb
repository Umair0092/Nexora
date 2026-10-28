# A teammate's Google account, connected so Nexora can add interviews to their
# calendar with a Meet link. Tokens are encrypted at rest.
class CalendarConnection < ApplicationRecord
  belongs_to :user

  encrypts :access_token, :refresh_token

  validates :provider, inclusion: { in: %w[google] }
  validates :email, presence: true
end
