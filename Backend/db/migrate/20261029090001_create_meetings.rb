class CreateMeetings < ActiveRecord::Migration[8.1]
  def change
    # Live interviews: a time, a video link and the teammates on the panel.
    create_table :meetings do |t|
      t.references :organization, null: false, foreign_key: true
      t.references :candidate, null: false, foreign_key: true
      t.references :created_by, foreign_key: { to_table: :users, on_delete: :nullify }
      t.string :title, null: false
      t.datetime :starts_at, null: false
      t.integer :duration_minutes, null: false, default: 45
      t.string :time_zone, null: false, default: "UTC"
      t.string :meeting_url
      t.string :provider, null: false, default: "link"
      t.string :status, null: false, default: "scheduled"
      t.text :agenda, null: false, default: ""
      t.string :uid, null: false
      t.integer :sequence, null: false, default: 0
      t.string :google_event_id
      t.timestamps
      t.index :uid, unique: true
      t.index [ :organization_id, :starts_at ]
    end

    create_table :meeting_panelists do |t|
      t.references :meeting, null: false, foreign_key: { on_delete: :cascade }
      t.references :user, null: false, foreign_key: { on_delete: :cascade }
      t.index [ :meeting_id, :user_id ], unique: true
    end

    # A teammate's own calendar account, used to create events with a Meet link.
    create_table :calendar_connections do |t|
      t.references :user, null: false, foreign_key: { on_delete: :cascade }, index: { unique: true }
      t.string :provider, null: false, default: "google"
      t.string :email, null: false
      t.text :access_token, null: false
      t.text :refresh_token
      t.datetime :expires_at
      t.timestamps
    end
  end
end
