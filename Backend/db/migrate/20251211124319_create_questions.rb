class CreateQuestions < ActiveRecord::Migration[8.1]
  def change
    create_table :questions do |t|
      t.references :domain, null: false, foreign_key: true
      t.text :text
      t.string :difficulty
      t.string :language

      t.timestamps
    end
  end
end
