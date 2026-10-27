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

ActiveRecord::Schema[8.1].define(version: 2026_10_27_100004) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "pg_catalog.plpgsql"

  create_table "answer_attempts", force: :cascade do |t|
    t.bigint "answer_id", null: false
    t.datetime "created_at", null: false
    t.text "feedback"
    t.text "improvements", default: [], array: true
    t.text "recommendation"
    t.float "score"
    t.jsonb "speech_metrics"
    t.jsonb "star"
    t.text "strengths", default: [], array: true
    t.text "transcript", null: false
    t.datetime "updated_at", null: false
    t.index ["answer_id"], name: "index_answer_attempts_on_answer_id"
  end

  create_table "answers", force: :cascade do |t|
    t.jsonb "behavioral_notes"
    t.datetime "created_at", null: false
    t.integer "duration"
    t.text "feedback"
    t.text "ideal_answer"
    t.text "improved_answer"
    t.text "improvement_notes", default: [], array: true
    t.bigint "question_id", null: false
    t.float "score"
    t.bigint "session_id", null: false
    t.jsonb "speech_metrics"
    t.jsonb "star"
    t.text "strengths", default: [], array: true
    t.text "transcript"
    t.datetime "updated_at", null: false
    t.text "weaknesses", default: [], array: true
    t.index ["question_id"], name: "index_answers_on_question_id"
    t.index ["session_id"], name: "index_answers_on_session_id"
  end

  create_table "domains", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.text "description"
    t.string "icon"
    t.boolean "internal", default: false, null: false
    t.string "name"
    t.integer "question_count"
    t.datetime "updated_at", null: false
    t.index ["internal"], name: "index_domains_on_internal"
  end

  create_table "interview_sessions", force: :cascade do |t|
    t.datetime "completed_at"
    t.integer "completed_questions"
    t.datetime "created_at", null: false
    t.string "difficulty"
    t.bigint "domain_id", null: false
    t.string "interview_type"
    t.text "job_description"
    t.string "language"
    t.float "overall_score"
    t.datetime "started_at"
    t.string "status"
    t.string "title"
    t.integer "total_questions"
    t.datetime "updated_at", null: false
    t.bigint "user_id", null: false
    t.index ["domain_id"], name: "index_interview_sessions_on_domain_id"
    t.index ["user_id"], name: "index_interview_sessions_on_user_id"
  end

  create_table "questions", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "difficulty"
    t.bigint "domain_id", null: false
    t.string "language"
    t.text "text"
    t.datetime "updated_at", null: false
    t.index ["domain_id"], name: "index_questions_on_domain_id"
  end

  create_table "reports", force: :cascade do |t|
    t.jsonb "behavioral_summary"
    t.datetime "created_at", null: false
    t.float "non_verbal_score"
    t.float "overall_score"
    t.text "overall_strengths", default: [], array: true
    t.text "overall_weaknesses", default: [], array: true
    t.text "recommendations", default: [], array: true
    t.bigint "session_id", null: false
    t.string "share_token"
    t.datetime "shared_at"
    t.datetime "updated_at", null: false
    t.bigint "user_id", null: false
    t.float "verbal_score"
    t.index ["session_id"], name: "index_reports_on_session_id"
    t.index ["share_token"], name: "index_reports_on_share_token", unique: true
    t.index ["user_id"], name: "index_reports_on_user_id"
  end

  create_table "users", force: :cascade do |t|
    t.text "bio"
    t.datetime "created_at", null: false
    t.string "email", default: "", null: false
    t.datetime "email_verified_at"
    t.jsonb "experience", default: []
    t.string "first_name"
    t.string "jti"
    t.string "last_name"
    t.datetime "last_reminded_at"
    t.string "password_digest", default: "", null: false
    t.string "profile_image_url"
    t.datetime "remember_created_at"
    t.boolean "reminders_enabled", default: false, null: false
    t.datetime "reset_password_sent_at"
    t.string "reset_password_token"
    t.string "resume_url"
    t.text "skills", default: [], array: true
    t.datetime "updated_at", null: false
    t.integer "weekly_goal", default: 3, null: false
    t.index "lower((email)::text)", name: "index_users_on_lower_email", unique: true
    t.index ["jti"], name: "index_users_on_jti", unique: true
    t.index ["reset_password_token"], name: "index_users_on_reset_password_token", unique: true
  end

  add_foreign_key "answer_attempts", "answers", on_delete: :cascade
  add_foreign_key "answers", "interview_sessions", column: "session_id"
  add_foreign_key "answers", "questions"
  add_foreign_key "interview_sessions", "domains"
  add_foreign_key "interview_sessions", "users"
  add_foreign_key "questions", "domains"
  add_foreign_key "reports", "interview_sessions", column: "session_id"
  add_foreign_key "reports", "users"
end
