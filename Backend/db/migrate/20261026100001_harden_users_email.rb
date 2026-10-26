class HardenUsersEmail < ActiveRecord::Migration[8.1]
  def up
    execute <<~SQL.squish
      UPDATE users SET email = LOWER(TRIM(email)) WHERE email IS NOT NULL AND email <> LOWER(TRIM(email))
    SQL

    remove_index :users, name: "index_users_on_email", if_exists: true
    add_index :users, "lower((email)::text)", unique: true, name: "index_users_on_lower_email"
  end

  def down
    remove_index :users, name: "index_users_on_lower_email", if_exists: true
    add_index :users, :email, name: "index_users_on_email" unless index_exists?(:users, :email, name: "index_users_on_email")
  end
end
