class AddNotetakerToMeetings < ActiveRecord::Migration[8.1]
  def change
    change_table :meetings, bulk: true do |t|
      # The notetaker bot that joins the call (Recall.ai), and how far it's got.
      t.boolean :notetaker, null: false, default: false
      t.string :notetaker_status
      t.string :bot_id
      t.string :notetaker_error
      # [{ speaker, start, text }] from the bot's captions or an uploaded recording.
      t.jsonb :transcript
      t.string :transcript_source
      # The AI's minutes: summary, topics, evidence for each criterion, follow-ups.
      t.jsonb :minutes
      t.string :minutes_status
      t.datetime :minutes_at
      t.index :bot_id, unique: true
    end
  end
end
