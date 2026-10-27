// Shapes returned by the Rails API (keys are camelized server-side).

export interface Experience {
  title: string;
  company: string;
  duration?: string;
  description?: string;
}

export interface User {
  id: number;
  email: string;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  bio: string | null;
  skills: string[];
  experience: Experience[];
  resumeUrl: string | null;
  emailVerified: boolean;
  remindersEnabled: boolean;
  weeklyGoal: number;
}

export interface Domain {
  id: number;
  name: string;
  description: string | null;
}

export type InterviewType = "cv" | "role" | "complete" | "behavioral";

export interface InterviewSession {
  id: number;
  title: string | null;
  interviewType: InterviewType | null;
  difficulty: string | null;
  language: string | null;
  status: "in_progress" | "completed";
  totalQuestions: number | null;
  completedQuestions: number | null;
  overallScore: number | null;
  startedAt: string | null;
  completedAt: string | null;
  domain?: Domain;
}

export interface Question {
  id: number;
  text: string;
}

// Delivery metrics from Whisper word timestamps (see resumeaiservice/speech.py).
export interface SpeechMetrics {
  durationSeconds: number;
  wordCount: number;
  wordsPerMinute: number | null;
  fillerCount: number;
  fillers: Record<string, number>;
  longPauses: number;
  longestPauseSeconds: number;
}

// The same metrics as the transcribe endpoint returns them (snake_case), to send back with an answer.
export interface RawSpeechMetrics {
  duration_seconds: number;
  word_count: number;
  words_per_minute: number | null;
  filler_count: number;
  fillers: Record<string, number>;
  long_pauses: number;
  longest_pause_seconds: number;
}

export interface StarCoverage {
  situation: boolean;
  task: boolean;
  action: boolean;
  result: boolean;
  note: string;
}

export interface AnswerAttempt {
  id: number;
  transcript: string;
  score: number | null;
  feedback: string | null;
  recommendation: string | null;
  strengths: string[];
  improvements: string[];
  star: StarCoverage | null;
  speechMetrics: SpeechMetrics | null;
  createdAt: string;
}

export interface Answer {
  id: number;
  transcript: string | null;
  score: number | null;
  feedback: string | null;
  strengths: string[] | null;
  weaknesses: string[] | null;
  duration: number | null;
  idealAnswer: string | null;
  improvedAnswer: string | null;
  improvementNotes: string[] | null;
  speechMetrics: SpeechMetrics | null;
  star: StarCoverage | null;
  attempts: AnswerAttempt[];
  question?: Question;
}

export interface NonVerbalData {
  averageAttentionScore: number;
  attentionDistribution: { attentive: number; partiallyAttentive: number; disengaged: number };
  disengagementReasons?: Record<string, number> | null;
  handActivity?: { calm: number; moderate: number; excessive: number };
}

export interface Evaluation {
  overallScore?: number;
  communicationScore?: number;
  technicalScore?: number;
  hireRecommendation?: string;
  summary?: string;
  recommendationSummary?: string;
  jobFit?: string;
  interviewStyle?: "standard" | "behavioral";
}

export interface Report {
  id?: number;
  overallScore: number;
  verbalScore: number | null;
  nonVerbalScore: number | null;
  overallStrengths: string[];
  overallWeaknesses: string[];
  recommendations: string[];
  createdAt: string;
  session?: InterviewSession;
  answers?: Answer[];
  nonVerbalData?: NonVerbalData | null;
  evaluation?: Evaluation;
  hasJobDescription?: boolean;
  shared?: boolean;
  shareUrl?: string | null;
}

export interface SessionStats {
  totalSessions: number;
  completedSessions: number;
  averageScore: number;
  currentStreak: number;
  longestStreak: number;
  practicedToday: boolean;
  thisWeek: number;
  weeklyGoal: number;
}

// One finished interview on the progress chart. Scores are 0–100.
export interface ProgressPoint {
  sessionId: number;
  date: string | null;
  title: string | null;
  interviewType: InterviewType | null;
  overall: number | null;
  communication: number | null;
  technical: number | null;
  presence: number | null;
}

export function displayName(user: Pick<User, "firstName" | "lastName" | "email"> | null | undefined) {
  if (!user) return "";
  const full = [user.firstName, user.lastName].filter(Boolean).join(" ");
  return full || user.email.split("@")[0];
}

export function sessionTitle(session: InterviewSession) {
  return session.title || session.domain?.name || "Interview";
}

export const INTERVIEW_TYPE_LABELS: Record<InterviewType, string> = {
  cv: "CV interview",
  role: "Technical quiz",
  complete: "Full interview",
  behavioral: "Behavioral",
};
