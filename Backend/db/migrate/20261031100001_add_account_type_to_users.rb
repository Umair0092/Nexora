class AddAccountTypeToUsers < ActiveRecord::Migration[8.1]
  def up
    # Candidates practise interviews; employers run hiring. Each gets its own workspace.
    add_column :users, :account_type, :string, null: false, default: "candidate"
    execute "UPDATE users SET account_type = 'employer' WHERE id IN (SELECT user_id FROM memberships)"
  end

  def down
    remove_column :users, :account_type
  end
end
