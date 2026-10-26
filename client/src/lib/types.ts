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

export interface Answer {
  id: number;
  transcript: string | null;
  score: number | null;
  feedback: string | null;
  strengths: string[] | null;
  weaknesses: string[] | null;
  duration: number | null;
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
}

export interface Report {
  id: number;
  overallScore: number;
  verbalScore: number | null;
  nonVerbalScore: number | null;
  overallStrengths: string[];
  overallWeaknesses: string[];
  recommendations: string[];
  createdAt: string;
  session?: InterviewSession;
  answers?: Answer[];
  nonVerbalData?: NonVerbalData;
  evaluation?: Evaluation;
}

export interface SessionStats {
  totalSessions: number;
  completedSessions: number;
  averageScore: number;
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
