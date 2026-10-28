# Phase 1 of hiring: companies, their teams, jobs with fixed questions, and
# candidates who answer them through a personal link.
class CreateHiring < ActiveRecord::Migration[8.1]
  def change
    create_table :organizations do |t|
      t.string :name, null: false
      t.timestamps
    end

    # One company per user for now (unique user_id).
    create_table :memberships do |t|
      t.references :organization, null: false, foreign_key: { on_delete: :cascade }
      t.references :user, null: false, foreign_key: { on_delete: :cascade }, index: { unique: true }
      t.string :role, null: false, default: "recruiter"
      t.timestamps
    end

    create_table :team_invitations do |t|
      t.references :organization, null: false, foreign_key: { on_delete: :cascade }
      t.references :invited_by, foreign_key: { to_table: :users, on_delete: :nullify }
      t.string :email, null: false
      t.string :role, null: false, default: "recruiter"
      t.datetime :accepted_at
      t.timestamps
    end
    add_index :team_invitations, [ :organization_id, :email ], unique: true, where: "accepted_at IS NULL"

    create_table :jobs do |t|
      t.references :organization, null: false, foreign_key: { on_delete: :cascade }
      t.references :created_by, foreign_key: { to_table: :users, on_delete: :nullify }
      t.string :title, null: false
      t.text :description, null: false, default: ""
      t.jsonb :questions, null: false, default: []
      t.jsonb :criteria, null: false, default: []
      t.integer :answer_seconds, null: false, default: 120
      t.string :status, null: false, default: "open"
      t.timestamps
    end

    create_table :candidates do |t|
      t.references :job, null: false, foreign_key: { on_delete: :cascade }
      t.references :invited_by, foreign_key: { to_table: :users, on_delete: :nullify }
      t.string :name, null: false
      t.string :email, null: false
      t.string :access_token, null: false
      t.string :status, null: false, default: "invited"
      t.string :decision
      t.datetime :consented_at
      t.datetime :started_at
      t.datetime :completed_at
      t.string :evaluation_status
      t.jsonb :ai_evaluation
      t.float :ai_score
      t.timestamps
    end
    add_index :candidates, :access_token, unique: true
    add_index :candidates, [ :job_id, :email ], unique: true

    create_table :candidate_answers do |t|
      t.references :candidate, null: false, foreign_key: { on_delete: :cascade }
      t.integer :position, null: false
      t.text :question, null: false
      t.text :transcript, null: false
      t.integer :duration_seconds
      t.timestamps
    end
    add_index :candidate_answers, [ :candidate_id, :position ], unique: true

    create_table :scorecards do |t|
      t.references :candidate, null: false, foreign_key: { on_delete: :cascade }
      t.references :user, null: false, foreign_key: { on_delete: :cascade }
      t.jsonb :ratings, null: false, default: {}
      t.text :notes, null: false, default: ""
      t.string :recommendation
      t.timestamps
    end
    add_index :scorecards, [ :candidate_id, :user_id ], unique: true

    # Who looked at or decided what, and when.
    create_table :hiring_events do |t|
      t.references :organization, null: false, foreign_key: { on_delete: :cascade }
      t.references :candidate, foreign_key: { on_delete: :cascade }
      t.references :user, foreign_key: { on_delete: :nullify }
      t.string :action, null: false
      t.jsonb :details, null: false, default: {}
      t.datetime :created_at, null: false
    end
    add_index :hiring_events, [ :organization_id, :created_at ]
  end
end
