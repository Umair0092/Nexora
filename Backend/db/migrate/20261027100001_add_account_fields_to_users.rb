class AddAccountFieldsToUsers < ActiveRecord::Migration[8.1]
  def change
    add_column :users, :email_verified_at, :datetime
    add_column :users, :reminders_enabled, :boolean, default: false, null: false
    add_column :users, :weekly_goal, :integer, default: 3, null: false
    add_column :users, :last_reminded_at, :datetime
  end
end
