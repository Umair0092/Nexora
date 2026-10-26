class AddTitleAndInterviewTypeToInterviewSessions < ActiveRecord::Migration[8.1]
  def change
    add_column :interview_sessions, :title, :string
    add_column :interview_sessions, :interview_type, :string
  end
end
