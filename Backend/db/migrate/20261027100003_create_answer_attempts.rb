class CreateAnswerAttempts < ActiveRecord::Migration[8.1]
  def change
    create_table :answer_attempts do |t|
      t.references :answer, null: false, foreign_key: { on_delete: :cascade }
      t.text :transcript, null: false
      t.float :score
      t.text :feedback
      t.text :recommendation
      t.text :strengths, array: true, default: []
      t.text :improvements, array: true, default: []
      t.jsonb :star
      t.jsonb :speech_metrics
      t.timestamps
    end
  end
end
