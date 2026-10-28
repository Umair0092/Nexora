# Phase 2 of hiring: a stage pipeline instead of shortlist/reject, team notes,
# CVs matched against the job, and email templates.
class HiringPhaseTwo < ActiveRecord::Migration[8.1]
  def change
    # Shortlisted and rejected carry over as stages.
    rename_column :candidates, :decision, :stage

    # The CV's extracted text, structured; the file itself is never stored.
    add_column :candidates, :resume_data, :jsonb
    add_column :candidates, :resume_status, :string
    add_column :candidates, :resume_match, :jsonb
    add_column :candidates, :resume_score, :float
    add_column :jobs, :collect_resume, :boolean, null: false, default: true

    create_table :candidate_notes do |t|
      t.references :candidate, null: false, foreign_key: { on_delete: :cascade }
      t.references :user, foreign_key: { on_delete: :nullify }
      t.text :body, null: false
      t.jsonb :mentioned_user_ids, null: false, default: []
      t.timestamps
    end

    create_table :email_templates do |t|
      t.references :organization, null: false, foreign_key: { on_delete: :cascade }
      t.string :name, null: false
      t.string :subject, null: false
      t.text :body, null: false
      t.timestamps
    end
    add_index :email_templates, [ :organization_id, :name ], unique: true
  end
end
