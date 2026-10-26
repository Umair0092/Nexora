class AddInternalToDomains < ActiveRecord::Migration[8.1]
  # Domains created by the old sync_ai_session from user/AI-supplied names, plus
  # the fixed per-interview-type domains. None should appear in the public list.
  INTERNAL_NAMES = [
    "Data Scientist",
    "AI Interview",
    "Software Engineer",
    "AI (Data Science)",
    "General Software Engineering",
    "CV Interview",
    "Role-based Interview",
    "Complete Interview",
    "Behavioral Interview"
  ].freeze

  def up
    add_column :domains, :internal, :boolean, default: false, null: false
    add_index :domains, :internal

    quoted = INTERNAL_NAMES.map { |n| connection.quote(n) }.join(", ")
    execute "UPDATE domains SET internal = TRUE WHERE name IN (#{quoted}) OR description LIKE 'AI generated domain for %'"
  end

  def down
    remove_index :domains, :internal, if_exists: true
    remove_column :domains, :internal
  end
end
