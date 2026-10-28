# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.1].define(version: 2026_10_29_190001) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "pg_catalog.plpgsql"

  create_table "answer_attempts", force: :cascade do |t|
    t.bigint "answer_id", null: false
    t.text "transcript", null: false
    t.float "score"
    t.text "feedback"
    t.text "recommendation"
    t.text "strengths", default: [], array: true
    t.text "improvements", default: [], array: true
    t.jsonb "star"
    t.jsonb "speech_metrics"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["answer_id"], name: "index_answer_attempts_on_answer_id"
  end

  create_table "answers", force: :cascade do |t|
    t.bigint "session_id", null: false
    t.bigint "question_id", null: false
    t.text "transcript"
    t.float "score"
    t.text "feedback"
    t.text "strengths", default: [], array: true
    t.text "weaknesses", default: [], array: true
    t.jsonb "behavioral_notes"
    t.integer "duration"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.text "ideal_answer"
    t.text "improved_answer"
    t.text "improvement_notes", default: [], array: true
    t.jsonb "speech_metrics"
    t.jsonb "star"
    t.index ["question_id"], name: "index_answers_on_question_id"
    t.index ["session_id"], name: "index_answers_on_session_id"
  end

  create_table "calendar_connections", force: :cascade do |t|
    t.bigint "user_id", null: false
    t.string "provider", default: "google", null: false
    t.string "email", null: false
    t.text "access_token", null: false
    t.text "refresh_token"
    t.datetime "expires_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["user_id"], name: "index_calendar_connections_on_user_id", unique: true
  end

  create_table "candidate_answers", force: :cascade do |t|
    t.bigint "candidate_id", null: false
    t.integer "position", null: false
    t.text "question", null: false
    t.text "transcript", null: false
    t.integer "duration_seconds"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["candidate_id", "position"], name: "index_candidate_answers_on_candidate_id_and_position", unique: true
    t.index ["candidate_id"], name: "index_candidate_answers_on_candidate_id"
  end

  create_table "candidate_notes", force: :cascade do |t|
    t.bigint "candidate_id", null: false
    t.bigint "user_id"
    t.text "body", null: false
    t.jsonb "mentioned_user_ids", default: [], null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["candidate_id"], name: "index_candidate_notes_on_candidate_id"
    t.index ["user_id"], name: "index_candidate_notes_on_user_id"
  end

  create_table "candidates", force: :cascade do |t|
    t.bigint "job_id", null: false
    t.bigint "invited_by_id"
    t.string "name", null: false
    t.string "email", null: false
    t.string "access_token", null: false
    t.string "status", default: "invited", null: false
    t.string "stage"
    t.datetime "consented_at"
    t.datetime "started_at"
    t.datetime "completed_at"
    t.string "evaluation_status"
    t.jsonb "ai_evaluation"
    t.float "ai_score"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.jsonb "resume_data"
    t.string "resume_status"
    t.jsonb "resume_match"
    t.float "resume_score"
    t.datetime "anonymized_at"
    t.index ["access_token"], name: "index_candidates_on_access_token", unique: true
    t.index ["invited_by_id"], name: "index_candidates_on_invited_by_id"
    t.index ["job_id", "email"], name: "index_candidates_on_job_id_and_email", unique: true
    t.index ["job_id"], name: "index_candidates_on_job_id"
  end

  create_table "domains", force: :cascade do |t|
    t.string "name"
    t.text "description"
    t.string "icon"
    t.integer "question_count"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.boolean "internal", default: false, null: false
    t.index ["internal"], name: "index_domains_on_internal"
  end

  create_table "email_templates", force: :cascade do |t|
    t.bigint "organization_id", null: false
    t.string "name", null: false
    t.string "subject", null: false
    t.text "body", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["organization_id", "name"], name: "index_email_templates_on_organization_id_and_name", unique: true
    t.index ["organization_id"], name: "index_email_templates_on_organization_id"
  end

  create_table "hiring_events", force: :cascade do |t|
    t.bigint "organization_id", null: false
    t.bigint "candidate_id"
    t.bigint "user_id"
    t.string "action", null: false
    t.jsonb "details", default: {}, null: false
    t.datetime "created_at", null: false
    t.index ["candidate_id"], name: "index_hiring_events_on_candidate_id"
    t.index ["organization_id", "action"], name: "index_hiring_events_on_organization_id_and_action"
    t.index ["organization_id", "created_at"], name: "index_hiring_events_on_organization_id_and_created_at"
    t.index ["organization_id"], name: "index_hiring_events_on_organization_id"
    t.index ["user_id"], name: "index_hiring_events_on_user_id"
  end

  create_table "interview_sessions", force: :cascade do |t|
    t.bigint "user_id", null: false
    t.bigint "domain_id", null: false
    t.string "difficulty"
    t.string "language"
    t.string "status"
    t.float "overall_score"
    t.integer "total_questions"
    t.integer "completed_questions"
    t.datetime "started_at"
    t.datetime "completed_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.string "title"
    t.string "interview_type"
    t.text "job_description"
    t.index ["domain_id"], name: "index_interview_sessions_on_domain_id"
    t.index ["user_id"], name: "index_interview_sessions_on_user_id"
  end

  create_table "jobs", force: :cascade do |t|
    t.bigint "organization_id", null: false
    t.bigint "created_by_id"
    t.string "title", null: false
    t.text "description", default: "", null: false
    t.jsonb "questions", default: [], null: false
    t.jsonb "criteria", default: [], null: false
    t.integer "answer_seconds", default: 120, null: false
    t.string "status", default: "open", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.boolean "collect_resume", default: true, null: false
    t.index ["created_by_id"], name: "index_jobs_on_created_by_id"
    t.index ["organization_id"], name: "index_jobs_on_organization_id"
  end

  create_table "live_interviews", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.bigint "user_id", null: false
    t.string "kind", null: false
    t.jsonb "state", default: {}, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["updated_at"], name: "index_live_interviews_on_updated_at"
    t.index ["user_id"], name: "index_live_interviews_on_user_id"
  end

  create_table "meeting_panelists", force: :cascade do |t|
    t.bigint "meeting_id", null: false
    t.bigint "user_id", null: false
    t.index ["meeting_id", "user_id"], name: "index_meeting_panelists_on_meeting_id_and_user_id", unique: true
    t.index ["meeting_id"], name: "index_meeting_panelists_on_meeting_id"
    t.index ["user_id"], name: "index_meeting_panelists_on_user_id"
  end

  create_table "meetings", force: :cascade do |t|
    t.bigint "organization_id", null: false
    t.bigint "candidate_id", null: false
    t.bigint "created_by_id"
    t.string "title", null: false
    t.datetime "starts_at", null: false
    t.integer "duration_minutes", default: 45, null: false
    t.string "time_zone", default: "UTC", null: false
    t.string "meeting_url"
    t.string "provider", default: "link", null: false
    t.string "status", default: "scheduled", null: false
    t.text "agenda", default: "", null: false
    t.string "uid", null: false
    t.integer "sequence", default: 0, null: false
    t.string "google_event_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.boolean "notetaker", default: false, null: false
    t.string "notetaker_status"
    t.string "bot_id"
    t.string "notetaker_error"
    t.jsonb "transcript"
    t.string "transcript_source"
    t.jsonb "minutes"
    t.string "minutes_status"
    t.datetime "minutes_at"
    t.index ["bot_id"], name: "index_meetings_on_bot_id", unique: true
    t.index ["candidate_id"], name: "index_meetings_on_candidate_id"
    t.index ["created_by_id"], name: "index_meetings_on_created_by_id"
    t.index ["organization_id", "starts_at"], name: "index_meetings_on_organization_id_and_starts_at"
    t.index ["organization_id"], name: "index_meetings_on_organization_id"
    t.index ["uid"], name: "index_meetings_on_uid", unique: true
  end

  create_table "memberships", force: :cascade do |t|
    t.bigint "organization_id", null: false
    t.bigint "user_id", null: false
    t.string "role", default: "recruiter", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["organization_id"], name: "index_memberships_on_organization_id"
    t.index ["user_id"], name: "index_memberships_on_user_id", unique: true
  end

  create_table "organizations", force: :cascade do |t|
    t.string "name", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.string "plan", default: "free", null: false
    t.string "plan_status"
    t.string "stripe_customer_id"
    t.string "stripe_subscription_id"
    t.datetime "current_period_end"
    t.integer "retention_months"
    t.index ["stripe_customer_id"], name: "index_organizations_on_stripe_customer_id", unique: true
    t.index ["stripe_subscription_id"], name: "index_organizations_on_stripe_subscription_id", unique: true
  end

  create_table "questions", force: :cascade do |t|
    t.bigint "domain_id", null: false
    t.text "text"
    t.string "difficulty"
    t.string "language"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["domain_id"], name: "index_questions_on_domain_id"
  end

  create_table "reports", force: :cascade do |t|
    t.bigint "session_id", null: false
    t.bigint "user_id", null: false
    t.float "overall_score"
    t.float "verbal_score"
    t.float "non_verbal_score"
    t.text "overall_strengths", default: [], array: true
    t.text "overall_weaknesses", default: [], array: true
    t.text "recommendations", default: [], array: true
    t.jsonb "behavioral_summary"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.string "share_token"
    t.datetime "shared_at"
    t.index ["session_id"], name: "index_reports_on_session_id"
    t.index ["share_token"], name: "index_reports_on_share_token", unique: true
    t.index ["user_id"], name: "index_reports_on_user_id"
  end

  create_table "scorecards", force: :cascade do |t|
    t.bigint "candidate_id", null: false
    t.bigint "user_id", null: false
    t.jsonb "ratings", default: {}, null: false
    t.text "notes", default: "", null: false
    t.string "recommendation"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["candidate_id", "user_id"], name: "index_scorecards_on_candidate_id_and_user_id", unique: true
    t.index ["candidate_id"], name: "index_scorecards_on_candidate_id"
    t.index ["user_id"], name: "index_scorecards_on_user_id"
  end

  create_table "solid_cable_messages", force: :cascade do |t|
    t.binary "channel", null: false
    t.binary "payload", null: false
    t.datetime "created_at", null: false
    t.bigint "channel_hash", null: false
    t.index ["channel"], name: "index_solid_cable_messages_on_channel"
    t.index ["channel_hash"], name: "index_solid_cable_messages_on_channel_hash"
    t.index ["created_at"], name: "index_solid_cable_messages_on_created_at"
  end

  create_table "solid_cache_entries", force: :cascade do |t|
    t.binary "key", null: false
    t.binary "value", null: false
    t.datetime "created_at", null: false
    t.bigint "key_hash", null: false
    t.integer "byte_size", null: false
    t.index ["byte_size"], name: "index_solid_cache_entries_on_byte_size"
    t.index ["key_hash", "byte_size"], name: "index_solid_cache_entries_on_key_hash_and_byte_size"
    t.index ["key_hash"], name: "index_solid_cache_entries_on_key_hash", unique: true
  end

  create_table "solid_queue_blocked_executions", force: :cascade do |t|
    t.bigint "job_id", null: false
    t.string "queue_name", null: false
    t.integer "priority", default: 0, null: false
    t.string "concurrency_key", null: false
    t.datetime "expires_at", null: false
    t.datetime "created_at", null: false
    t.index ["concurrency_key", "priority", "job_id"], name: "index_solid_queue_blocked_executions_for_release"
    t.index ["expires_at", "concurrency_key"], name: "index_solid_queue_blocked_executions_for_maintenance"
    t.index ["job_id"], name: "index_solid_queue_blocked_executions_on_job_id", unique: true
  end

  create_table "solid_queue_claimed_executions", force: :cascade do |t|
    t.bigint "job_id", null: false
    t.bigint "process_id"
    t.datetime "created_at", null: false
    t.index ["job_id"], name: "index_solid_queue_claimed_executions_on_job_id", unique: true
    t.index ["process_id", "job_id"], name: "index_solid_queue_claimed_executions_on_process_id_and_job_id"
  end

  create_table "solid_queue_failed_executions", force: :cascade do |t|
    t.bigint "job_id", null: false
    t.text "error"
    t.datetime "created_at", null: false
    t.index ["job_id"], name: "index_solid_queue_failed_executions_on_job_id", unique: true
  end

  create_table "solid_queue_jobs", force: :cascade do |t|
    t.string "queue_name", null: false
    t.string "class_name", null: false
    t.text "arguments"
    t.integer "priority", default: 0, null: false
    t.string "active_job_id"
    t.datetime "scheduled_at"
    t.datetime "finished_at"
    t.string "concurrency_key"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["active_job_id"], name: "index_solid_queue_jobs_on_active_job_id"
    t.index ["class_name"], name: "index_solid_queue_jobs_on_class_name"
    t.index ["finished_at"], name: "index_solid_queue_jobs_on_finished_at"
    t.index ["queue_name", "finished_at"], name: "index_solid_queue_jobs_for_filtering"
    t.index ["scheduled_at", "finished_at"], name: "index_solid_queue_jobs_for_alerting"
  end

  create_table "solid_queue_pauses", force: :cascade do |t|
    t.string "queue_name", null: false
    t.datetime "created_at", null: false
    t.index ["queue_name"], name: "index_solid_queue_pauses_on_queue_name", unique: true
  end

  create_table "solid_queue_processes", force: :cascade do |t|
    t.string "kind", null: false
    t.datetime "last_heartbeat_at", null: false
    t.bigint "supervisor_id"
    t.integer "pid", null: false
    t.string "hostname"
    t.text "metadata"
    t.datetime "created_at", null: false
    t.string "name", null: false
    t.index ["last_heartbeat_at"], name: "index_solid_queue_processes_on_last_heartbeat_at"
    t.index ["name", "supervisor_id"], name: "index_solid_queue_processes_on_name_and_supervisor_id", unique: true
    t.index ["supervisor_id"], name: "index_solid_queue_processes_on_supervisor_id"
  end

  create_table "solid_queue_ready_executions", force: :cascade do |t|
    t.bigint "job_id", null: false
    t.string "queue_name", null: false
    t.integer "priority", default: 0, null: false
    t.datetime "created_at", null: false
    t.index ["job_id"], name: "index_solid_queue_ready_executions_on_job_id", unique: true
    t.index ["priority", "job_id"], name: "index_solid_queue_poll_all"
    t.index ["queue_name", "priority", "job_id"], name: "index_solid_queue_poll_by_queue"
  end

  create_table "solid_queue_recurring_executions", force: :cascade do |t|
    t.bigint "job_id", null: false
    t.string "task_key", null: false
    t.datetime "run_at", null: false
    t.datetime "created_at", null: false
    t.index ["job_id"], name: "index_solid_queue_recurring_executions_on_job_id", unique: true
    t.index ["task_key", "run_at"], name: "index_solid_queue_recurring_executions_on_task_key_and_run_at", unique: true
  end

  create_table "solid_queue_recurring_tasks", force: :cascade do |t|
    t.string "key", null: false
    t.string "schedule", null: false
    t.string "command", limit: 2048
    t.string "class_name"
    t.text "arguments"
    t.string "queue_name"
    t.integer "priority", default: 0
    t.boolean "static", default: true, null: false
    t.text "description"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["key"], name: "index_solid_queue_recurring_tasks_on_key", unique: true
    t.index ["static"], name: "index_solid_queue_recurring_tasks_on_static"
  end

  create_table "solid_queue_scheduled_executions", force: :cascade do |t|
    t.bigint "job_id", null: false
    t.string "queue_name", null: false
    t.integer "priority", default: 0, null: false
    t.datetime "scheduled_at", null: false
    t.datetime "created_at", null: false
    t.index ["job_id"], name: "index_solid_queue_scheduled_executions_on_job_id", unique: true
    t.index ["scheduled_at", "priority", "job_id"], name: "index_solid_queue_dispatch_all"
  end

  create_table "solid_queue_semaphores", force: :cascade do |t|
    t.string "key", null: false
    t.integer "value", default: 1, null: false
    t.datetime "expires_at", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["expires_at"], name: "index_solid_queue_semaphores_on_expires_at"
    t.index ["key", "value"], name: "index_solid_queue_semaphores_on_key_and_value"
    t.index ["key"], name: "index_solid_queue_semaphores_on_key", unique: true
  end

  create_table "team_invitations", force: :cascade do |t|
    t.bigint "organization_id", null: false
    t.bigint "invited_by_id"
    t.string "email", null: false
    t.string "role", default: "recruiter", null: false
    t.datetime "accepted_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["invited_by_id"], name: "index_team_invitations_on_invited_by_id"
    t.index ["organization_id", "email"], name: "index_team_invitations_on_organization_id_and_email", unique: true, where: "(accepted_at IS NULL)"
    t.index ["organization_id"], name: "index_team_invitations_on_organization_id"
  end

  create_table "users", force: :cascade do |t|
    t.string "email", default: "", null: false
    t.string "password_digest", default: "", null: false
    t.string "reset_password_token"
    t.datetime "reset_password_sent_at"
    t.datetime "remember_created_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.string "jti"
    t.text "skills", default: [], array: true
    t.text "bio"
    t.jsonb "experience", default: []
    t.string "resume_url"
    t.string "first_name"
    t.string "last_name"
    t.string "profile_image_url"
    t.datetime "email_verified_at"
    t.boolean "reminders_enabled", default: false, null: false
    t.integer "weekly_goal", default: 3, null: false
    t.datetime "last_reminded_at"
    t.index "lower((email)::text)", name: "index_users_on_lower_email", unique: true
    t.index ["jti"], name: "index_users_on_jti", unique: true
    t.index ["reset_password_token"], name: "index_users_on_reset_password_token", unique: true
  end

  create_table "webhook_deliveries", force: :cascade do |t|
    t.bigint "webhook_endpoint_id", null: false
    t.string "event", null: false
    t.string "delivery_id", null: false
    t.jsonb "payload", null: false
    t.integer "status_code"
    t.string "error"
    t.integer "attempts", default: 0, null: false
    t.datetime "delivered_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["delivery_id"], name: "index_webhook_deliveries_on_delivery_id", unique: true
    t.index ["webhook_endpoint_id", "created_at"], name: "index_webhook_deliveries_on_webhook_endpoint_id_and_created_at"
    t.index ["webhook_endpoint_id"], name: "index_webhook_deliveries_on_webhook_endpoint_id"
  end

  create_table "webhook_endpoints", force: :cascade do |t|
    t.bigint "organization_id", null: false
    t.string "url", null: false
    t.text "secret", null: false
    t.jsonb "events", default: [], null: false
    t.boolean "active", default: true, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["organization_id"], name: "index_webhook_endpoints_on_organization_id"
  end

  add_foreign_key "answer_attempts", "answers", on_delete: :cascade
  add_foreign_key "answers", "interview_sessions", column: "session_id"
  add_foreign_key "answers", "questions"
  add_foreign_key "calendar_connections", "users", on_delete: :cascade
  add_foreign_key "candidate_answers", "candidates", on_delete: :cascade
  add_foreign_key "candidate_notes", "candidates", on_delete: :cascade
  add_foreign_key "candidate_notes", "users", on_delete: :nullify
  add_foreign_key "candidates", "jobs", on_delete: :cascade
  add_foreign_key "candidates", "users", column: "invited_by_id", on_delete: :nullify
  add_foreign_key "email_templates", "organizations", on_delete: :cascade
  add_foreign_key "hiring_events", "candidates", on_delete: :cascade
  add_foreign_key "hiring_events", "organizations", on_delete: :cascade
  add_foreign_key "hiring_events", "users", on_delete: :nullify
  add_foreign_key "interview_sessions", "domains"
  add_foreign_key "interview_sessions", "users"
  add_foreign_key "jobs", "organizations", on_delete: :cascade
  add_foreign_key "jobs", "users", column: "created_by_id", on_delete: :nullify
  add_foreign_key "live_interviews", "users", on_delete: :cascade
  add_foreign_key "meeting_panelists", "meetings", on_delete: :cascade
  add_foreign_key "meeting_panelists", "users", on_delete: :cascade
  add_foreign_key "meetings", "candidates"
  add_foreign_key "meetings", "organizations"
  add_foreign_key "meetings", "users", column: "created_by_id", on_delete: :nullify
  add_foreign_key "memberships", "organizations", on_delete: :cascade
  add_foreign_key "memberships", "users", on_delete: :cascade
  add_foreign_key "questions", "domains"
  add_foreign_key "reports", "interview_sessions", column: "session_id"
  add_foreign_key "reports", "users"
  add_foreign_key "scorecards", "candidates", on_delete: :cascade
  add_foreign_key "scorecards", "users", on_delete: :cascade
  add_foreign_key "solid_queue_blocked_executions", "solid_queue_jobs", column: "job_id", on_delete: :cascade
  add_foreign_key "solid_queue_claimed_executions", "solid_queue_jobs", column: "job_id", on_delete: :cascade
  add_foreign_key "solid_queue_failed_executions", "solid_queue_jobs", column: "job_id", on_delete: :cascade
  add_foreign_key "solid_queue_ready_executions", "solid_queue_jobs", column: "job_id", on_delete: :cascade
  add_foreign_key "solid_queue_recurring_executions", "solid_queue_jobs", column: "job_id", on_delete: :cascade
  add_foreign_key "solid_queue_scheduled_executions", "solid_queue_jobs", column: "job_id", on_delete: :cascade
  add_foreign_key "team_invitations", "organizations", on_delete: :cascade
  add_foreign_key "team_invitations", "users", column: "invited_by_id", on_delete: :nullify
  add_foreign_key "webhook_deliveries", "webhook_endpoints", on_delete: :cascade
  add_foreign_key "webhook_endpoints", "organizations"
end
