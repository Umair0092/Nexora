// Types and helpers for the hiring screens (company side and candidate side).
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";

export type MemberRole = "owner" | "recruiter";
export type CandidateStatus = "invited" | "in_progress" | "completed" | "withdrawn";
export type Stage = "shortlisted" | "interviewing" | "offer" | "hired" | "rejected";
// Board columns: Invited and To review are where candidates without a stage sit.
export type Column = "invited" | "review" | Stage | "withdrawn";
export type Recommendation = "advance" | "hold" | "reject";

export interface Organization {
  id: number;
  name: string;
  myRole: MemberRole;
  members: { id: number; userId: number; name: string; email: string; role: MemberRole; joinedAt: string }[];
  invitations: { id: number; email: string; role: MemberRole; invitedAt: string }[];
}

export interface Job {
  id: number;
  title: string;
  description: string;
  questions: string[];
  criteria: string[];
  answerSeconds: number;
  collectResume: boolean;
  status: "open" | "closed";
  questionsLocked: boolean;
  createdAt: string;
  candidateCounts: Partial<Record<CandidateStatus, number>>;
}

export interface CandidateRow {
  id: number;
  name: string;
  email: string;
  status: CandidateStatus;
  stage: Stage | null;
  column: Column;
  aiScore: number | null;
  evaluationStatus: "pending" | "done" | "failed" | null;
  resumeScore: number | null;
  resumeStatus: "skipped" | "pending" | "done" | "failed" | null;
  noteCount: number;
  scorecardAverage: number | null;
  scorecardCount: number;
  invitedAt: string;
  completedAt: string | null;
  link: string;
}

export type MeetingProvider = "google_meet" | "zoom" | "teams" | "link";

export interface Meeting {
  id: number;
  title: string;
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  timeZone: string;
  meetingUrl: string | null;
  provider: MeetingProvider;
  status: "scheduled" | "cancelled";
  agenda: string;
  inGoogleCalendar: boolean;
  notetaker: boolean;
  notetakerStatus: NotetakerStatus | null;
  notetakerError: string | null;
  hasTranscript: boolean;
  minutesStatus: "pending" | "done" | "failed" | null;
  minutesSummary: string | null;
  createdBy: string | null;
  panel: { id: number; name: string }[];
  candidate: { id: number; name: string; jobTitle: string };
}

export type NotetakerStatus = "scheduled" | "joining" | "waiting_room" | "recording" | "processing" | "done" | "failed";

export const NOTETAKER_LABELS: Record<NotetakerStatus, string> = {
  scheduled: "Notetaker booked",
  joining: "Notetaker joining the call",
  waiting_room: "Notetaker in the waiting room: let it in",
  recording: "Notetaker recording",
  processing: "Call ended, preparing the transcript",
  done: "Transcript ready",
  failed: "Notetaker couldn't record",
};

export type Signal = "strong" | "mixed" | "weak" | "not_covered";

export interface Minutes {
  summary: string;
  topics: { title: string; notes: string }[];
  criteria: { criterion: string; signal: Signal; evidence: string }[];
  candidateQuestions: string[];
  concerns: string[];
  followUps: { owner: string; item: string }[];
}

export interface MeetingDetail extends Meeting {
  transcript: { speaker: string | null; start: number; text: string }[];
  transcriptSource: "bot" | "upload" | null;
  minutes: Minutes | null;
  minutesAt: string | null;
  criteria: string[];
  notetakerAvailable: boolean;
}

export const PROVIDER_LABELS: Record<MeetingProvider, string> = {
  google_meet: "Google Meet",
  zoom: "Zoom",
  teams: "Microsoft Teams",
  link: "Video call",
};

export const MEETING_DURATIONS = [15, 30, 45, 60, 90];

/** "Thu 30 Oct, 10:00–10:45" in the viewer's own time zone. */
export function meetingTime(m: Pick<Meeting, "startsAt" | "endsAt">) {
  const start = new Date(m.startsAt);
  const day = start.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  const time = (d: Date) => d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return `${day}, ${time(start)}–${time(new Date(m.endsAt))}`;
}

export interface Scorecard {
  userId: number;
  by: string;
  ratings: Record<string, number>;
  notes: string;
  recommendation: Recommendation | null;
  updatedAt: string;
}

export interface CandidateDetail extends CandidateRow {
  job: { id: number; title: string; criteria: string[] };
  consentedAt: string | null;
  answers: { position: number; question: string; transcript: string; durationSeconds: number | null }[];
  aiEvaluation: {
    answers: { score: number; summary: string }[];
    criteria: { criterion: string; rating: number | null; evidence: string }[];
    summary: string;
    strengths: string[];
    gaps: string[];
  } | null;
  resume: {
    degree: string;
    summary: string | null;
    skills: string[];
    work_experience: { company: string; role: string; duration: string | null; description: string | null }[];
    projects_done: string[];
    education: { institution: string; course: string; duration: string | null; score: string | null }[];
    achievements: string[];
  } | null;
  resumeMatch: { summary: string; met: { requirement: string; evidence: string }[]; missing: string[] } | null;
  notes: Note[];
  myScorecard: Scorecard | null;
  scorecards: Scorecard[];
  activity: ActivityEvent[];
  meetings: Meeting[];
}

export interface Note {
  id: number;
  body: string;
  by: string;
  mine: boolean;
  at: string;
}

export interface EmailTemplate {
  id: number;
  name: string;
  subject: string;
  body: string;
  updatedAt: string;
}

// One column of the side-by-side comparison.
export interface ComparedCandidate extends CandidateRow {
  teamRatings: Record<string, number | null>;
  aiRatings: Record<string, number | null>;
  recommendations: Record<Recommendation, number>;
  summary: string | null;
  resumeSummary: string | null;
  answers: Record<string, string>;
}

// What the candidate's own page receives.
export interface ApplyState {
  company: string;
  jobTitle: string;
  candidateName: string;
  status: CandidateStatus;
  jobOpen: boolean;
  questionCount: number;
  answerSeconds: number;
  answered: number;
  collectResume: boolean;
  resumeStep: boolean;
  resumeAdded: boolean;
  currentQuestion: string | null;
  consentedAt: string | null;
  completedAt: string | null;
  upcomingInterview: (Pick<Meeting, "title" | "startsAt" | "durationMinutes" | "meetingUrl" | "provider">) | null;
}

export const STATUS_LABELS: Record<CandidateStatus, string> = {
  invited: "Invited",
  in_progress: "In progress",
  completed: "Completed",
  withdrawn: "Withdrew",
};

export const COLUMN_LABELS: Record<Column, string> = {
  invited: "Invited",
  review: "To review",
  shortlisted: "Shortlisted",
  interviewing: "Interviewing",
  offer: "Offer",
  hired: "Hired",
  rejected: "Rejected",
  withdrawn: "Withdrew",
};

// Board order. Withdrawn candidates are listed separately.
export const BOARD_COLUMNS: Column[] = ["invited", "review", "shortlisted", "interviewing", "offer", "hired", "rejected"];

// Dropping into Invited or To review clears the stage.
export const stageFor = (column: Column): Stage | null => (column === "invited" || column === "review" || column === "withdrawn" ? null : column);

export const RECOMMENDATION_LABELS: Record<Recommendation, string> = {
  advance: "Advance",
  hold: "Hold",
  reject: "Don't advance",
};

export const ANSWER_SECONDS = [60, 90, 120, 180, 240];

// 120 -> "2 minutes", 90 -> "90 seconds"
export function formatSeconds(seconds: number) {
  if (seconds % 60 === 0) return `${seconds / 60} minute${seconds === 60 ? "" : "s"}`;
  return `${seconds} seconds`;
}

/** The signed-in user's company, or null when they don't have one. */
export function useOrganization() {
  return useQuery<Organization | null>({
    queryKey: ["/api/v1/organization"],
    queryFn: async () => {
      try {
        return await api<Organization>("/api/v1/organization");
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }
    },
  });
}

export const ACTIVITY_LABELS: Record<string, string> = {
  candidate_invited: "Invited",
  invitation_resent: "Invitation sent again",
  candidate_consented: "Gave consent and started",
  candidate_completed: "Submitted the interview",
  candidate_withdrew: "Withdrew; answers deleted",
  candidate_viewed: "Viewed answers",
  scorecard_saved: "Saved a scorecard",
  decision_changed: "Changed the decision",
  stage_changed: "Moved",
  note_added: "Added a note",
  email_sent: "Emailed",
  resume_added: "Added a CV",
  meeting_scheduled: "Scheduled an interview",
  meeting_rescheduled: "Changed an interview",
  meeting_cancelled: "Cancelled an interview",
  notetaker_sent: "Sent the notetaker",
  meeting_transcribed: "Interview transcribed",
  minutes_ready: "Interview minutes ready",
};

export interface ActivityEvent {
  action: string;
  by: string | null;
  at: string;
  details: Record<string, unknown>;
}

/** One line of the activity log, without who did it. */
export function activityText(e: ActivityEvent) {
  if (e.action === "stage_changed") return `Moved to ${COLUMN_LABELS[((e.details.to as Stage | null) ?? "review") as Column]}`;
  if (e.action === "email_sent" && typeof e.details.subject === "string") return `Emailed "${e.details.subject}"`;
  return ACTIVITY_LABELS[e.action] ?? e.action.replace(/_/g, " ");
}

/**
 * An activity event as a sentence around the candidate's name, for feeds that
 * mix candidates: ["Riya Shah moved", "to Offer"] reads "Riya Shah moved Omar Farooq to Offer".
 * Events the candidate did themselves start with their name, so `before` is empty.
 */
export function feedSentence(e: ActivityEvent): { before: string; after: string } {
  const by = e.by ?? "Someone";
  const to = COLUMN_LABELS[((e.details.to as Stage | null) ?? "review") as Column];
  switch (e.action) {
    case "candidate_invited": return { before: `${by} invited`, after: "" };
    case "invitation_resent": return { before: `${by} sent the invitation again to`, after: "" };
    case "candidate_consented": return { before: "", after: "started the interview" };
    case "candidate_completed": return { before: "", after: "submitted the interview" };
    case "candidate_withdrew": return { before: "", after: "withdrew and their answers were deleted" };
    case "resume_added": return { before: "", after: "added a CV" };
    case "scorecard_saved": return { before: `${by} scored`, after: "" };
    case "stage_changed": return { before: `${by} moved`, after: `to ${to}` };
    case "note_added": return { before: `${by} added a note on`, after: "" };
    case "email_sent": return { before: `${by} emailed`, after: "" };
    case "meeting_scheduled": return { before: `${by} scheduled an interview with`, after: "" };
    case "meeting_rescheduled": return { before: `${by} changed the interview with`, after: "" };
    case "minutes_ready": return { before: "Minutes are ready for the interview with", after: "" };
    case "meeting_transcribed": return { before: "The interview with", after: "was transcribed" };
    case "meeting_cancelled": return { before: `${e.by ?? "The team"} cancelled the interview with`, after: "" };
    default: return { before: e.by ? `${e.by}: ${activityText(e).toLowerCase()}` : activityText(e), after: "" };
  }
}

/** "just now", "5 minutes ago", "3 days ago"; older than a month shows the date. */
export function timeAgo(iso: string, now = Date.now()) {
  const minutes = Math.round((now - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 31) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export interface HiringOverview {
  stats: { openJobs: number; toReview: number; interviewing: number; offers: number; hiredRecently: number };
  needsReview: { id: number; name: string; jobId: number; jobTitle: string; aiScore: number | null; resumeScore: number | null; completedAt: string }[];
  activity: (ActivityEvent & { id: number; candidate: { id: number; name: string; jobTitle: string } | null })[];
  columns: Record<string, Partial<Record<Column, number>>>;
  upcomingMeetings: Meeting[];
}

// Placeholders a template or email can use, with what each becomes.
export const PLACEHOLDERS: [string, string][] = [
  ["{{first_name}}", "the candidate's first name"],
  ["{{name}}", "their full name"],
  ["{{job}}", "the job title"],
  ["{{company}}", "your company"],
  ["{{link}}", "their interview link"],
];

// The same filling the server does, for previews. `job` and `company` come from the page.
export function fillPlaceholders(text: string, c: Pick<CandidateRow, "name" | "link">, job: string, company: string) {
  const values: Record<string, string> = {
    first_name: c.name.split(/\s+/)[0] ?? "",
    name: c.name,
    job,
    company,
    link: `${window.location.origin}${c.link}`,
  };
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (all, key: string) => values[key] ?? all);
}
