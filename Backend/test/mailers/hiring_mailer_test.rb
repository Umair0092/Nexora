require "test_helper"

class HiringMailerTest < ActionMailer::TestCase
  include ApiTestHelpers
  setup do
    @owner = create_user(email: "owner@acme.test", first_name: "Ada", last_name: "Park")
    @org = Organization.create!(name: "Acme")
    @org.memberships.create!(user: @owner, role: "owner")
    @job = @org.jobs.create!(title: "Backend Engineer", questions: [ "Q1", "Q2", "Q3" ], criteria: %w[Design Ownership], answer_seconds: 90)
    @candidate = @job.candidates.create!(name: "Sam Lee", email: "sam@example.com", invited_by: @owner)
  end

  test "candidate invitation has the personal link and the time it takes" do
    mail = HiringMailer.candidate_invitation(@candidate)
    assert_equal "Acme: your screening interview for Backend Engineer", mail.subject
    body = mail.text_part.body.to_s
    assert_includes body, "/apply/#{@candidate.access_token}"
    assert_includes body, "90 seconds"
  end

  test "candidate message replies to the teammate who sent it" do
    mail = HiringMailer.candidate_message(@candidate, subject: "Next steps", body: "Hi Sam,\n\nThanks!", sender: @owner)
    assert_equal [ "owner@acme.test" ], mail.reply_to
    assert_includes mail.text_part.body.to_s, "Thanks!"
  end

  test "mention names the author and links to the candidate" do
    teammate = create_user(email: "riya@acme.test", first_name: "Riya")
    note = @candidate.notes.create!(user: @owner, body: "@Riya can you look?")
    mail = HiringMailer.mention(note, teammate)
    assert_equal [ "riya@acme.test" ], mail.to
    assert_equal "Ada Park mentioned you on Sam Lee", mail.subject
    assert_includes mail.text_part.body.to_s, "/hiring/candidates/#{@candidate.id}"
  end

  test "durations read naturally" do
    assert_equal "2 minutes", HiringMailer.duration(120)
    assert_equal "90 seconds", HiringMailer.duration(90)
  end
end
