import {
  users,
  domains,
  questions,
  interviewSessions,
  answers,
  reports,
  type User,
  type UpsertUser,
  type Domain,
  type InsertDomain,
  type Question,
  type InsertQuestion,
  type InterviewSession,
  type InsertInterviewSession,
  type Answer,
  type InsertAnswer,
  type Report,
  type InsertReport,
  type InterviewSessionWithDomain,
  type AnswerWithQuestion,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, sql } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  
  getDomains(): Promise<Domain[]>;
  getDomain(id: string): Promise<Domain | undefined>;
  createDomain(domain: InsertDomain): Promise<Domain>;
  
  getQuestionsByDomain(domainId: string, difficulty?: string): Promise<Question[]>;
  getQuestion(id: string): Promise<Question | undefined>;
  createQuestion(question: InsertQuestion): Promise<Question>;
  getRandomQuestions(domainId: string, difficulty: string, limit: number): Promise<Question[]>;
  
  getUserSessions(userId: string): Promise<InterviewSessionWithDomain[]>;
  getSession(id: string): Promise<InterviewSessionWithDomain | undefined>;
  createSession(session: InsertInterviewSession): Promise<InterviewSession>;
  updateSession(id: string, data: Partial<InterviewSession>): Promise<InterviewSession | undefined>;
  
  getSessionAnswers(sessionId: string): Promise<AnswerWithQuestion[]>;
  createAnswer(answer: InsertAnswer): Promise<Answer>;
  updateAnswer(id: string, data: Partial<Answer>): Promise<Answer | undefined>;
  
  getReportBySession(sessionId: string): Promise<Report | undefined>;
  createReport(report: InsertReport): Promise<Report>;
  
  getUserStats(userId: string): Promise<{
    totalSessions: number;
    completedSessions: number;
    averageScore: number;
  }>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  async getDomains(): Promise<Domain[]> {
    return await db.select().from(domains);
  }

  async getDomain(id: string): Promise<Domain | undefined> {
    const [domain] = await db.select().from(domains).where(eq(domains.id, id));
    return domain;
  }

  async createDomain(domain: InsertDomain): Promise<Domain> {
    const [created] = await db.insert(domains).values(domain).returning();
    return created;
  }

  async getQuestionsByDomain(domainId: string, difficulty?: string): Promise<Question[]> {
    if (difficulty) {
      return await db
        .select()
        .from(questions)
        .where(and(eq(questions.domainId, domainId), eq(questions.difficulty, difficulty)));
    }
    return await db.select().from(questions).where(eq(questions.domainId, domainId));
  }

  async getQuestion(id: string): Promise<Question | undefined> {
    const [question] = await db.select().from(questions).where(eq(questions.id, id));
    return question;
  }

  async createQuestion(question: InsertQuestion): Promise<Question> {
    const [created] = await db.insert(questions).values(question).returning();
    return created;
  }

  async getRandomQuestions(domainId: string, difficulty: string, limit: number): Promise<Question[]> {
    return await db
      .select()
      .from(questions)
      .where(and(eq(questions.domainId, domainId), eq(questions.difficulty, difficulty)))
      .orderBy(sql`RANDOM()`)
      .limit(limit);
  }

  async getUserSessions(userId: string): Promise<InterviewSessionWithDomain[]> {
    const sessions = await db
      .select()
      .from(interviewSessions)
      .where(eq(interviewSessions.userId, userId))
      .orderBy(desc(interviewSessions.startedAt));

    const sessionsWithDomain: InterviewSessionWithDomain[] = [];
    for (const session of sessions) {
      const domain = await this.getDomain(session.domainId);
      sessionsWithDomain.push({ ...session, domain });
    }
    return sessionsWithDomain;
  }

  async getSession(id: string): Promise<InterviewSessionWithDomain | undefined> {
    const [session] = await db
      .select()
      .from(interviewSessions)
      .where(eq(interviewSessions.id, id));
    if (!session) return undefined;
    const domain = await this.getDomain(session.domainId);
    return { ...session, domain };
  }

  async createSession(session: InsertInterviewSession): Promise<InterviewSession> {
    const [created] = await db.insert(interviewSessions).values(session).returning();
    return created;
  }

  async updateSession(id: string, data: Partial<InterviewSession>): Promise<InterviewSession | undefined> {
    const [updated] = await db
      .update(interviewSessions)
      .set(data)
      .where(eq(interviewSessions.id, id))
      .returning();
    return updated;
  }

  async getSessionAnswers(sessionId: string): Promise<AnswerWithQuestion[]> {
    const answersList = await db
      .select()
      .from(answers)
      .where(eq(answers.sessionId, sessionId));

    const answersWithQuestions: AnswerWithQuestion[] = [];
    for (const answer of answersList) {
      const question = await this.getQuestion(answer.questionId);
      answersWithQuestions.push({ ...answer, question });
    }
    return answersWithQuestions;
  }

  async createAnswer(answer: InsertAnswer): Promise<Answer> {
    const [created] = await db.insert(answers).values(answer).returning();
    return created;
  }

  async updateAnswer(id: string, data: Partial<Answer>): Promise<Answer | undefined> {
    const [updated] = await db
      .update(answers)
      .set(data)
      .where(eq(answers.id, id))
      .returning();
    return updated;
  }

  async getReportBySession(sessionId: string): Promise<Report | undefined> {
    const [report] = await db
      .select()
      .from(reports)
      .where(eq(reports.sessionId, sessionId));
    return report;
  }

  async createReport(report: InsertReport): Promise<Report> {
    const [created] = await db.insert(reports).values(report).returning();
    return created;
  }

  async getUserStats(userId: string): Promise<{
    totalSessions: number;
    completedSessions: number;
    averageScore: number;
  }> {
    const sessions = await db
      .select()
      .from(interviewSessions)
      .where(eq(interviewSessions.userId, userId));

    const totalSessions = sessions.length;
    const completedSessions = sessions.filter(s => s.status === "completed").length;
    const scoresArray = sessions
      .filter(s => s.overallScore !== null)
      .map(s => s.overallScore as number);
    const averageScore = scoresArray.length > 0
      ? scoresArray.reduce((a, b) => a + b, 0) / scoresArray.length
      : 0;

    return { totalSessions, completedSessions, averageScore };
  }
}

export const storage = new DatabaseStorage();
