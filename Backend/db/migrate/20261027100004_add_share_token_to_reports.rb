class AddShareTokenToReports < ActiveRecord::Migration[8.1]
  def change
    add_column :reports, :share_token, :string
    add_column :reports, :shared_at, :datetime
    add_index :reports, :share_token, unique: true
  end
end
