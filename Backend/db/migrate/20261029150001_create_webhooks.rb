class CreateWebhooks < ActiveRecord::Migration[8.1]
  def change
    # A company's endpoints that hear about hiring events (an ATS, Slack bridge, Zapier...).
    create_table :webhook_endpoints do |t|
      t.references :organization, null: false, foreign_key: true
      t.string :url, null: false
      t.text :secret, null: false
      t.jsonb :events, null: false, default: []
      t.boolean :active, null: false, default: true
      t.timestamps
    end

    # Recent attempts, so the settings page can show what was sent and what came back.
    create_table :webhook_deliveries do |t|
      t.references :webhook_endpoint, null: false, foreign_key: { on_delete: :cascade }
      t.string :event, null: false
      t.string :delivery_id, null: false
      t.jsonb :payload, null: false
      t.integer :status_code
      t.string :error
      t.integer :attempts, null: false, default: 0
      t.datetime :delivered_at
      t.timestamps
      t.index :delivery_id, unique: true
      t.index [ :webhook_endpoint_id, :created_at ]
    end
  end
end
