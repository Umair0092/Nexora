class CreateAnswers < ActiveRecord::Migration[8.1]
  def change
    create_table :answers do |t|
      t.references :session, null: false, foreign_key: { to_table: :interview_sessions }
      t.references :question, null: false, foreign_key: true
      t.text :transcript
      t.float :score
      t.text :feedback
      t.text :strengths, array: true, default: []
      t.text :weaknesses, array: true, default: []
      t.jsonb :behavioral_notes
      t.integer :duration

      t.timestamps
    end
  end
end
