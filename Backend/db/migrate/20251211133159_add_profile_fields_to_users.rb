class AddProfileFieldsToUsers < ActiveRecord::Migration[8.1]
  def change
    add_column :users, :skills, :text, array: true, default: []
    add_column :users, :bio, :text
    add_column :users, :experience, :jsonb, default: []
    add_column :users, :resume_url, :string
  end
end
