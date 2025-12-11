class CreateInterviewSessions < ActiveRecord::Migration[8.1]
  def change
    create_table :interview_sessions do |t|
      t.references :user, null: false, foreign_key: true
      t.references :domain, null: false, foreign_key: true
      t.string :difficulty
      t.string :language
      t.string :status
      t.float :overall_score
      t.integer :total_questions
      t.integer :completed_questions
      t.datetime :started_at
      t.datetime :completed_at

      t.timestamps
    end
  end
end
