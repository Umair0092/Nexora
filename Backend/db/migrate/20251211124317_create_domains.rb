class CreateDomains < ActiveRecord::Migration[8.1]
  def change
    create_table :domains do |t|
      t.string :name
      t.text :description
      t.string :icon
      t.integer :question_count

      t.timestamps
    end
  end
end
