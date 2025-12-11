import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  varchar,
  real,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

// Session storage table for Replit Auth
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table for Replit Auth
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  skills: text("skills").array(),
  bio: text("bio"),
  experience: jsonb("experience"),
  resumeUrl: varchar("resume_url"),
});

// Interview domains
export const domains = pgTable("domains", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  icon: varchar("icon", { length: 50 }),
  questionCount: integer("question_count").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

// Interview questions
export const questions = pgTable("questions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  domainId: varchar("domain_id").references(() => domains.id).notNull(),
  text: text("text").notNull(),
  difficulty: varchar("difficulty", { length: 20 }).notNull().default("intermediate"),
  language: varchar("language", { length: 10 }).default("en"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Interview sessions
export const interviewSessions = pgTable("interview_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  domainId: varchar("domain_id").references(() => domains.id).notNull(),
  difficulty: varchar("difficulty", { length: 20 }).notNull(),
  language: varchar("language", { length: 10 }).notNull().default("en"),
  status: varchar("status", { length: 20 }).notNull().default("in_progress"),
  overallScore: real("overall_score"),
  totalQuestions: integer("total_questions").default(5),
  completedQuestions: integer("completed_questions").default(0),
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

// Answers for each question in an interview
export const answers = pgTable("answers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").references(() => interviewSessions.id).notNull(),
  questionId: varchar("question_id").references(() => questions.id).notNull(),
  transcript: text("transcript"),
  score: real("score"),
  feedback: text("feedback"),
  strengths: text("strengths").array(),
  weaknesses: text("weaknesses").array(),
  behavioralNotes: jsonb("behavioral_notes"),
  duration: integer("duration"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Performance reports
export const reports = pgTable("reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").references(() => interviewSessions.id).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  overallScore: real("overall_score").notNull(),
  verbalScore: real("verbal_score"),
  nonVerbalScore: real("non_verbal_score"),
  overallStrengths: text("overall_strengths").array(),
  overallWeaknesses: text("overall_weaknesses").array(),
  recommendations: text("recommendations").array(),
  behavioralSummary: jsonb("behavioral_summary"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(interviewSessions),
  reports: many(reports),
}));

export const domainsRelations = relations(domains, ({ many }) => ({
  questions: many(questions),
  sessions: many(interviewSessions),
}));

export const questionsRelations = relations(questions, ({ one, many }) => ({
  domain: one(domains, {
    fields: [questions.domainId],
    references: [domains.id],
  }),
  answers: many(answers),
}));

export const interviewSessionsRelations = relations(interviewSessions, ({ one, many }) => ({
  user: one(users, {
    fields: [interviewSessions.userId],
    references: [users.id],
  }),
  domain: one(domains, {
    fields: [interviewSessions.domainId],
    references: [domains.id],
  }),
  answers: many(answers),
  report: one(reports),
}));

export const answersRelations = relations(answers, ({ one }) => ({
  session: one(interviewSessions, {
    fields: [answers.sessionId],
    references: [interviewSessions.id],
  }),
  question: one(questions, {
    fields: [answers.questionId],
    references: [questions.id],
  }),
}));

export const reportsRelations = relations(reports, ({ one }) => ({
  session: one(interviewSessions, {
    fields: [reports.sessionId],
    references: [interviewSessions.id],
  }),
  user: one(users, {
    fields: [reports.userId],
    references: [users.id],
  }),
}));

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true, updatedAt: true });
export const insertDomainSchema = createInsertSchema(domains).omit({ id: true, createdAt: true });
export const insertQuestionSchema = createInsertSchema(questions).omit({ id: true, createdAt: true });
export const insertInterviewSessionSchema = createInsertSchema(interviewSessions).omit({ id: true, startedAt: true, completedAt: true });
export const insertAnswerSchema = createInsertSchema(answers).omit({ id: true, createdAt: true });
export const insertReportSchema = createInsertSchema(reports).omit({ id: true, createdAt: true });

// Types
export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
export type Domain = typeof domains.$inferSelect;
export type InsertDomain = z.infer<typeof insertDomainSchema>;
export type Question = typeof questions.$inferSelect;
export type InsertQuestion = z.infer<typeof insertQuestionSchema>;
export type InterviewSession = typeof interviewSessions.$inferSelect;
export type InsertInterviewSession = z.infer<typeof insertInterviewSessionSchema>;
export type Answer = typeof answers.$inferSelect;
export type InsertAnswer = z.infer<typeof insertAnswerSchema>;
export type Report = typeof reports.$inferSelect;
export type InsertReport = z.infer<typeof insertReportSchema>;

// Extended types for frontend
export interface InterviewSessionWithDomain extends InterviewSession {
  domain?: Domain;
}

export interface ReportWithSession extends Report {
  session?: InterviewSessionWithDomain;
}

export interface AnswerWithQuestion extends Answer {
  question?: Question;
}
