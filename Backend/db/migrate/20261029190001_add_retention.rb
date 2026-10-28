class AddRetention < ActiveRecord::Migration[8.1]
  def change
    # How long to keep candidates' personal data; nil keeps it until someone deletes it.
    add_column :organizations, :retention_months, :integer
    add_column :candidates, :anonymized_at, :datetime
    add_index :hiring_events, [ :organization_id, :action ]
  end
end
