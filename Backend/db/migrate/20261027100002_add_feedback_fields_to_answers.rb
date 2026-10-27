class AddFeedbackFieldsToAnswers < ActiveRecord::Migration[8.1]
  def change
    add_column :answers, :ideal_answer, :text
    add_column :answers, :improved_answer, :text
    add_column :answers, :improvement_notes, :text, array: true, default: []
    add_column :answers, :speech_metrics, :jsonb
    add_column :answers, :star, :jsonb
    add_column :interview_sessions, :job_description, :text
  end
end
