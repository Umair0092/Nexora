class CreateReports < ActiveRecord::Migration[8.1]
  def change
    create_table :reports do |t|
      t.references :session, null: false, foreign_key: { to_table: :interview_sessions }
      t.references :user, null: false, foreign_key: true
      t.float :overall_score
      t.float :verbal_score
      t.float :non_verbal_score
      t.text :overall_strengths, array: true, default: []
      t.text :overall_weaknesses, array: true, default: []
      t.text :recommendations, array: true, default: []
      t.jsonb :behavioral_summary

      t.timestamps
    end
  end
end
