import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { insertInterviewSessionSchema, insertAnswerSchema } from "@shared/schema";
import OpenAI from "openai";

// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
// Initialize OpenAI client only if API key is available
let openai: OpenAI | null = null;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  await setupAuth(app);

  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  app.get("/api/domains", async (req, res) => {
    try {
      const domainsList = await storage.getDomains();
      res.json(domainsList);
    } catch (error) {
      console.error("Error fetching domains:", error);
      res.status(500).json({ message: "Failed to fetch domains" });
    }
  });

  app.get("/api/domains/:id", async (req, res) => {
    try {
      const domain = await storage.getDomain(req.params.id);
      if (!domain) {
        return res.status(404).json({ message: "Domain not found" });
      }
      res.json(domain);
    } catch (error) {
      console.error("Error fetching domain:", error);
      res.status(500).json({ message: "Failed to fetch domain" });
    }
  });

  app.get("/api/sessions", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const sessions = await storage.getUserSessions(userId);
      res.json(sessions);
    } catch (error) {
      console.error("Error fetching sessions:", error);
      res.status(500).json({ message: "Failed to fetch sessions" });
    }
  });

  app.get("/api/sessions/stats", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const stats = await storage.getUserStats(userId);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching stats:", error);
      res.status(500).json({ message: "Failed to fetch stats" });
    }
  });

  app.get("/api/sessions/:id", isAuthenticated, async (req: any, res) => {
    try {
      const session = await storage.getSession(req.params.id);
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }
      if (session.userId !== req.user.claims.sub) {
        return res.status(403).json({ message: "Access denied" });
      }
      res.json(session);
    } catch (error) {
      console.error("Error fetching session:", error);
      res.status(500).json({ message: "Failed to fetch session" });
    }
  });

  app.post("/api/sessions", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const sessionData = insertInterviewSessionSchema.parse({
        ...req.body,
        userId,
        status: "in_progress",
        completedQuestions: 0,
      });

      const session = await storage.createSession(sessionData);

      const questionsList = await storage.getRandomQuestions(
        sessionData.domainId,
        sessionData.difficulty,
        sessionData.totalQuestions || 5
      );

      for (const question of questionsList) {
        await storage.createAnswer({
          sessionId: session.id,
          questionId: question.id,
        });
      }

      const fullSession = await storage.getSession(session.id);
      res.status(201).json(fullSession);
    } catch (error) {
      console.error("Error creating session:", error);
      res.status(500).json({ message: "Failed to create session" });
    }
  });

  app.get("/api/sessions/:id/answers", isAuthenticated, async (req: any, res) => {
    try {
      const session = await storage.getSession(req.params.id);
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }
      if (session.userId !== req.user.claims.sub) {
        return res.status(403).json({ message: "Access denied" });
      }
      const answersList = await storage.getSessionAnswers(req.params.id);
      res.json(answersList);
    } catch (error) {
      console.error("Error fetching answers:", error);
      res.status(500).json({ message: "Failed to fetch answers" });
    }
  });

  app.post("/api/sessions/:sessionId/answers/:answerId", isAuthenticated, async (req: any, res) => {
    try {
      const { transcript, duration } = req.body;
      const session = await storage.getSession(req.params.sessionId);
      
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }
      if (session.userId !== req.user.claims.sub) {
        return res.status(403).json({ message: "Access denied" });
      }

      const answers = await storage.getSessionAnswers(req.params.sessionId);
      const answer = answers.find(a => a.id === req.params.answerId);
      
      if (!answer) {
        return res.status(404).json({ message: "Answer not found" });
      }

      let evaluation = {
        score: 0,
        feedback: "Unable to evaluate",
        strengths: [] as string[],
        weaknesses: [] as string[],
      };

      if (openai && transcript && transcript.trim().length > 0) {
        try {
          const response = await openai.chat.completions.create({
            model: "gpt-5",
            messages: [
              {
                role: "system",
                content: `You are an expert interview coach evaluating candidate responses. 
                Analyze the response and provide:
                1. A score from 0-100
                2. Brief constructive feedback
                3. 2-3 strengths shown in the answer
                4. 2-3 areas for improvement
                
                Respond with JSON in this format:
                {
                  "score": number,
                  "feedback": "string",
                  "strengths": ["string", "string"],
                  "weaknesses": ["string", "string"]
                }`
              },
              {
                role: "user",
                content: `Question: ${answer.question?.text || "Interview question"}

Candidate's Response: ${transcript}

Please evaluate this interview response.`
              }
            ],
            response_format: { type: "json_object" },
            max_completion_tokens: 1024,
          });

          const parsed = JSON.parse(response.choices[0].message.content || "{}");
          evaluation = {
            score: Math.max(0, Math.min(100, parsed.score || 0)),
            feedback: parsed.feedback || "No feedback available",
            strengths: parsed.strengths || [],
            weaknesses: parsed.weaknesses || [],
          };
        } catch (aiError) {
          console.error("OpenAI evaluation error:", aiError);
        }
      } else if (!transcript || transcript.trim().length === 0) {
        evaluation = {
          score: 0,
          feedback: "No response provided",
          strengths: [],
          weaknesses: ["No answer was given for this question"],
        };
      }

      const updated = await storage.updateAnswer(req.params.answerId, {
        transcript,
        duration,
        score: evaluation.score,
        feedback: evaluation.feedback,
        strengths: evaluation.strengths,
        weaknesses: evaluation.weaknesses,
      });

      const allAnswers = await storage.getSessionAnswers(req.params.sessionId);
      const completedCount = allAnswers.filter(a => a.transcript !== null).length;
      
      await storage.updateSession(req.params.sessionId, {
        completedQuestions: completedCount,
      });

      res.json(updated);
    } catch (error) {
      console.error("Error updating answer:", error);
      res.status(500).json({ message: "Failed to update answer" });
    }
  });

  app.post("/api/sessions/:id/complete", isAuthenticated, async (req: any, res) => {
    try {
      const session = await storage.getSession(req.params.id);
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }
      if (session.userId !== req.user.claims.sub) {
        return res.status(403).json({ message: "Access denied" });
      }

      const answersList = await storage.getSessionAnswers(req.params.id);
      const scores = answersList.filter(a => a.score !== null).map(a => a.score as number);
      const overallScore = scores.length > 0 
        ? scores.reduce((a, b) => a + b, 0) / scores.length 
        : 0;

      const allStrengths = answersList.flatMap(a => a.strengths || []);
      const allWeaknesses = answersList.flatMap(a => a.weaknesses || []);

      const strengthCounts = new Map<string, number>();
      allStrengths.forEach(s => strengthCounts.set(s, (strengthCounts.get(s) || 0) + 1));
      const overallStrengths = Array.from(strengthCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([s]) => s);

      const weaknessCounts = new Map<string, number>();
      allWeaknesses.forEach(w => weaknessCounts.set(w, (weaknessCounts.get(w) || 0) + 1));
      const overallWeaknesses = Array.from(weaknessCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([w]) => w);

      let recommendations: string[] = [];
      if (openai && answersList.length > 0) {
        try {
          const response = await openai.chat.completions.create({
            model: "gpt-5",
            messages: [
              {
                role: "system",
                content: `You are an expert career coach. Based on the interview performance summary, provide 3-5 actionable recommendations for improvement.
                
                Respond with JSON in this format:
                {
                  "recommendations": ["string", "string", "string"]
                }`
              },
              {
                role: "user",
                content: `Interview Performance Summary:
- Overall Score: ${overallScore.toFixed(1)}%
- Strengths: ${overallStrengths.join(", ") || "None identified"}
- Areas for Improvement: ${overallWeaknesses.join(", ") || "None identified"}
- Number of Questions: ${answersList.length}

Please provide actionable recommendations for this candidate.`
              }
            ],
            response_format: { type: "json_object" },
            max_completion_tokens: 512,
          });

          const parsed = JSON.parse(response.choices[0].message.content || "{}");
          recommendations = parsed.recommendations || [];
        } catch (aiError) {
          console.error("OpenAI recommendations error:", aiError);
          recommendations = [
            "Practice answering questions with the STAR method",
            "Focus on providing specific examples from your experience",
            "Work on maintaining confident body language"
          ];
        }
      } else {
        recommendations = [
          "Practice answering questions with the STAR method",
          "Focus on providing specific examples from your experience",
          "Work on maintaining confident body language"
        ];
      }

      const report = await storage.createReport({
        sessionId: session.id,
        userId: session.userId,
        overallScore,
        verbalScore: overallScore,
        nonVerbalScore: null,
        overallStrengths,
        overallWeaknesses,
        recommendations,
        behavioralSummary: null,
      });

      await storage.updateSession(req.params.id, {
        status: "completed",
        completedAt: new Date(),
        overallScore,
      });

      res.json({ session: await storage.getSession(req.params.id), report });
    } catch (error) {
      console.error("Error completing session:", error);
      res.status(500).json({ message: "Failed to complete session" });
    }
  });

  app.get("/api/reports/:sessionId", isAuthenticated, async (req: any, res) => {
    try {
      const session = await storage.getSession(req.params.sessionId);
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }
      if (session.userId !== req.user.claims.sub) {
        return res.status(403).json({ message: "Access denied" });
      }

      const report = await storage.getReportBySession(req.params.sessionId);
      if (!report) {
        return res.status(404).json({ message: "Report not found" });
      }

      const answersList = await storage.getSessionAnswers(req.params.sessionId);

      res.json({ report, session, answers: answersList });
    } catch (error) {
      console.error("Error fetching report:", error);
      res.status(500).json({ message: "Failed to fetch report" });
    }
  });

  return httpServer;
}
