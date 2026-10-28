# JSON for the hiring screens, camelCase like the rest of the API.
module HiringSerializer
  # Board columns as people read them (the client has the same labels).
  COLUMN_NAMES = { "invited" => "Invited", "review" => "To review", "shortlisted" => "Shortlisted", "interviewing" => "Interviewing",
                   "offer" => "Offer", "hired" => "Hired", "rejected" => "Rejected", "withdrawn" => "Withdrew" }.freeze

  module_function

  def organization(org, membership)
    {
      id: org.id,
      name: org.name,
      myRole: membership.role,
      members: org.memberships.includes(:user).order(:created_at).map do |m|
        { id: m.id, userId: m.user_id, name: display_name(m.user), email: m.user.email, role: m.role, joinedAt: m.created_at }
      end,
      invitations: org.team_invitations.pending.order(:created_at).map do |i|
        { id: i.id, email: i.email, role: i.role, invitedAt: i.created_at }
      end
    }
  end

  def job(job, counts = nil)
    {
      id: job.id,
      title: job.title,
      description: job.description,
      questions: job.questions,
      criteria: job.criteria,
      answerSeconds: job.answer_seconds,
      collectResume: job.collect_resume,
      status: job.status,
      questionsLocked: job.questions_locked?,
      createdAt: job.created_at,
      candidateCounts: counts || job.candidates.group(:status).count
    }
  end

  def candidate_row(c)
    {
      id: c.id,
      name: c.name,
      email: c.email,
      status: c.status,
      stage: c.stage,
      column: c.board_column,
      aiScore: c.ai_score,
      evaluationStatus: c.evaluation_status,
      resumeScore: c.resume_score,
      resumeStatus: c.resume_status,
      noteCount: c.notes.size,
      scorecardAverage: c.scorecard_average,
      scorecardCount: c.scorecards.size,
      invitedAt: c.created_at,
      completedAt: c.completed_at,
      link: "/apply/#{c.access_token}"
    }
  end

  def candidate_detail(c, viewer)
    mine = c.scorecards.find { |s| s.user_id == viewer.id }
    candidate_row(c).merge(
      job: { id: c.job.id, title: c.job.title, criteria: c.job.criteria },
      consentedAt: c.consented_at,
      answers: c.answers.map { |a| { position: a.position, question: a.question, transcript: a.transcript, durationSeconds: a.duration_seconds } },
      aiEvaluation: c.ai_evaluation&.deep_transform_keys { |k| k.to_s.camelize(:lower) },
      resume: c.resume_data&.except("name"),
      resumeMatch: c.resume_match,
      notes: c.notes.map { |n| note(n, viewer) },
      meetings: c.meetings.includes(:panelists, :created_by).map { |m| meeting(m) },
      myScorecard: mine && scorecard(mine),
      scorecards: c.scorecards.includes(:user).map { |s| scorecard(s) },
      activity: c.hiring_events.includes(:user).order(created_at: :desc).limit(50).map do |e|
        { action: e.action, by: e.user ? display_name(e.user) : nil, at: e.created_at, details: e.details }
      end
    )
  end

  # One column of the side-by-side view.
  def comparison(c)
    cards = c.scorecards
    criteria = c.job.criteria.index_with do |name|
      values = cards.filter_map { |s| s.ratings[name] }
      values.any? ? (values.sum.to_f / values.size).round(1) : nil
    end
    candidate_row(c).merge(
      teamRatings: criteria,
      aiRatings: Array(c.ai_evaluation&.dig("criteria")).to_h { |r| [ r["criterion"], r["rating"] ] },
      recommendations: Scorecard::RECOMMENDATIONS.index_with { |r| cards.count { |s| s.recommendation == r } },
      summary: c.ai_evaluation&.dig("summary"),
      resumeSummary: c.resume_match&.dig("summary"),
      answers: c.answers.to_h { |a| [ a.position, a.transcript ] }
    )
  end

  def note(n, viewer)
    { id: n.id, body: n.body, by: n.user ? display_name(n.user) : "Former teammate", mine: n.user_id == viewer.id, at: n.created_at }
  end

  def email_template(t)
    { id: t.id, name: t.name, subject: t.subject, body: t.body, updatedAt: t.updated_at }
  end

  def scorecard(s)
    { userId: s.user_id, by: display_name(s.user), ratings: s.ratings, notes: s.notes, recommendation: s.recommendation, updatedAt: s.updated_at }
  end

  def meeting(m)
    {
      id: m.id, title: m.title, startsAt: m.starts_at, endsAt: m.ends_at, durationMinutes: m.duration_minutes,
      timeZone: m.time_zone, meetingUrl: m.meeting_url, provider: m.provider, status: m.status, agenda: m.agenda,
      inGoogleCalendar: m.google_event_id.present?,
      notetaker: m.notetaker, notetakerStatus: m.notetaker_status, notetakerError: m.notetaker_error,
      hasTranscript: m.transcript.present?, minutesStatus: m.minutes_status,
      minutesSummary: m.minutes&.dig("summary"),
      createdBy: m.created_by && display_name(m.created_by),
      panel: m.panelists.map { |u| { id: u.id, name: display_name(u) } },
      candidate: { id: m.candidate.id, name: m.candidate.name, jobTitle: m.candidate.job.title }
    }
  end

  def meeting_detail(m)
    meeting(m).merge(
      transcript: Array(m.transcript), transcriptSource: m.transcript_source, minutes: m.minutes, minutesAt: m.minutes_at,
      criteria: m.candidate.job.criteria, notetakerAvailable: MeetingBot.configured?
    )
  end

  def display_name(user)
    [ user.first_name, user.last_name ].compact_blank.join(" ").presence || user.email
  end
end
