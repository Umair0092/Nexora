# In-progress interviews and quizzes. They used to live in the AI services'
# own ai_sessions table; now Rails runs them, so they're an ordinary model.
class CreateLiveInterviews < ActiveRecord::Migration[8.1]
  def change
    create_table :live_interviews, id: :uuid do |t|
      t.references :user, null: false, foreign_key: { on_delete: :cascade }
      t.string :kind, null: false
      t.jsonb :state, null: false, default: {}
      t.timestamps
    end
    add_index :live_interviews, :updated_at

    reversible do |dir|
      dir.up { drop_table :ai_sessions, if_exists: true }
    end
  end
end
