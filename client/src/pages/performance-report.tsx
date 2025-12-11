import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft,
  Download,
  Share2,
  Play,
  CheckCircle,
  XCircle,
  TrendingUp,
  MessageSquare,
  Lightbulb,
  Calendar,
  Clock,
  Target,
} from "lucide-react";
import type { Report, Answer, Question, InterviewSession, Domain } from "@shared/schema";

interface ReportData extends Report {
  session?: InterviewSession & { domain?: Domain };
  answers?: (Answer & { question?: Question })[];
}

function ScoreCircle({ score, size = "lg" }: { score: number; size?: "sm" | "md" | "lg" }) {
  const sizes = {
    sm: { svg: 60, radius: 22, stroke: 4, text: "text-base" },
    md: { svg: 100, radius: 38, stroke: 6, text: "text-xl" },
    lg: { svg: 160, radius: 65, stroke: 10, text: "text-4xl" },
  };
  const { svg, radius, stroke, text } = sizes[size];
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  const getScoreColor = (s: number) => {
    if (s >= 80) return "text-green-500";
    if (s >= 60) return "text-yellow-500";
    return "text-red-500";
  };

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={svg} height={svg} className="transform -rotate-90">
        <circle
          cx={svg / 2}
          cy={svg / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={stroke}
          fill="none"
          className="text-muted"
        />
        <circle
          cx={svg / 2}
          cy={svg / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          className={getScoreColor(score)}
        />
      </svg>
      <span className={`absolute font-bold ${text}`}>{Math.round(score)}%</span>
    </div>
  );
}

function AnswerCard({ answer, index }: { answer: Answer & { question?: Question }; index: number }) {
  const score = answer.score || 0;
  const getScoreBadgeVariant = (s: number) => {
    if (s >= 80) return "default";
    if (s >= 60) return "secondary";
    return "destructive";
  };

  return (
    <AccordionItem value={`answer-${index}`} className="border rounded-lg px-0 mb-3">
      <AccordionTrigger className="px-6 py-4 hover:no-underline" data-testid={`accordion-answer-${index}`}>
        <div className="flex items-start justify-between gap-4 w-full text-left">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <Badge variant="outline" className="text-xs">Q{index + 1}</Badge>
              <Badge variant={getScoreBadgeVariant(score)} className="text-xs">
                {Math.round(score)}%
              </Badge>
            </div>
            <p className="font-medium text-sm line-clamp-2">
              {answer.question?.text || "Question"}
            </p>
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent className="px-6 pb-6">
        <div className="space-y-4">
          <div>
            <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-muted-foreground" />
              Your Answer
            </h4>
            <div className="bg-muted/30 rounded-lg p-4 text-sm">
              {answer.transcript || "No transcript available"}
            </div>
          </div>

          {answer.feedback && (
            <div>
              <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-yellow-500" />
                AI Feedback
              </h4>
              <p className="text-sm text-muted-foreground">{answer.feedback}</p>
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-4">
            {answer.strengths && answer.strengths.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold mb-2 flex items-center gap-2 text-green-600">
                  <CheckCircle className="w-4 h-4" />
                  Strengths
                </h4>
                <ul className="text-sm space-y-1">
                  {answer.strengths.map((strength, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-green-500 mt-1">+</span>
                      {strength}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {answer.weaknesses && answer.weaknesses.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold mb-2 flex items-center gap-2 text-red-600">
                  <XCircle className="w-4 h-4" />
                  Areas for Improvement
                </h4>
                <ul className="text-sm space-y-1">
                  {answer.weaknesses.map((weakness, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-red-500 mt-1">-</span>
                      {weakness}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {answer.duration && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground pt-2 border-t">
              <Clock className="w-4 h-4" />
              Answer duration: {Math.floor(answer.duration / 60)}:{(answer.duration % 60).toString().padStart(2, "0")}
            </div>
          )}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

export default function PerformanceReport() {
  const params = useParams<{ id: string }>();

  const { data: report, isLoading } = useQuery<ReportData>({
    queryKey: ["/api/v1/sessions", params.id, "report"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/v1/sessions/${params.id}/report`);
      return await res.json();
    }
  });

  if (isLoading) {
    return (
      <div className="p-6 lg:p-8 max-w-5xl mx-auto">
        <Skeleton className="h-8 w-64 mb-4" />
        <Skeleton className="h-4 w-48 mb-8" />
        <div className="grid md:grid-cols-3 gap-6 mb-8">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!report) {
    return (
      <div className="p-6 lg:p-8 max-w-5xl mx-auto text-center">
        <h1 className="text-2xl font-bold mb-4">Report Not Found</h1>
        <p className="text-muted-foreground mb-6">This performance report could not be found.</p>
        <Link href="/dashboard">
          <Button>Return to Dashboard</Button>
        </Link>
      </div>
    );
  }

  const formattedDate = report.createdAt
    ? new Date(report.createdAt).toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    })
    : "Unknown date";

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-4 mb-8 flex-wrap">
        <div>
          <Link href="/dashboard">
            <Button variant="ghost" size="sm" className="mb-2" data-testid="button-back-dashboard">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </Button>
          </Link>
          <h1 className="text-3xl font-bold" data-testid="text-report-title">Performance Report</h1>
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <Badge variant="secondary">{report.session?.domain?.name || "General"}</Badge>
            <span className="flex items-center gap-1 text-sm text-muted-foreground">
              <Calendar className="w-4 h-4" />
              {formattedDate}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" data-testid="button-share-report">
            <Share2 className="w-4 h-4 mr-2" />
            Share
          </Button>
          <Button variant="outline" size="sm" data-testid="button-download-report">
            <Download className="w-4 h-4 mr-2" />
            Download
          </Button>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-6 mb-8">
        <Card className="md:col-span-1" data-testid="card-overall-score">
          <CardContent className="p-6 flex flex-col items-center justify-center text-center">
            <p className="text-sm text-muted-foreground mb-4">Overall Score</p>
            <ScoreCircle score={report.overallScore} size="lg" />
            <p className="text-sm text-muted-foreground mt-4">
              {report.overallScore >= 80 ? "Excellent Performance!" :
                report.overallScore >= 60 ? "Good Performance" : "Needs Improvement"}
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-verbal-score">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-muted-foreground">Verbal Communication</p>
              <MessageSquare className="w-5 h-5 text-primary" />
            </div>
            <div className="flex items-center gap-4">
              <ScoreCircle score={report.verbalScore || 0} size="md" />
              <div className="flex-1">
                <p className="text-sm text-muted-foreground">
                  Based on answer clarity, relevance, and structure
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-nonverbal-score">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-muted-foreground">Non-Verbal Cues</p>
              <Target className="w-5 h-5 text-primary" />
            </div>
            <div className="flex items-center gap-4">
              <ScoreCircle score={report.nonVerbalScore || 0} size="md" />
              <div className="flex-1">
                <p className="text-sm text-muted-foreground">
                  Based on posture, eye contact, and gestures
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-6 mb-8">
        <Card data-testid="card-strengths">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <CheckCircle className="w-5 h-5 text-green-500" />
              Strengths
            </CardTitle>
          </CardHeader>
          <CardContent>
            {report.overallStrengths && report.overallStrengths.length > 0 ? (
              <ul className="space-y-3">
                {report.overallStrengths.map((strength, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full bg-green-500/10 text-green-500 flex items-center justify-center text-xs font-semibold flex-shrink-0">
                      {i + 1}
                    </span>
                    <span className="text-sm">{strength}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No strengths identified yet.</p>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-weaknesses">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <XCircle className="w-5 h-5 text-red-500" />
              Areas for Improvement
            </CardTitle>
          </CardHeader>
          <CardContent>
            {report.overallWeaknesses && report.overallWeaknesses.length > 0 ? (
              <ul className="space-y-3">
                {report.overallWeaknesses.map((weakness, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center text-xs font-semibold flex-shrink-0">
                      {i + 1}
                    </span>
                    <span className="text-sm">{weakness}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No areas for improvement identified.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {report.recommendations && report.recommendations.length > 0 && (
        <Card className="mb-8" data-testid="card-recommendations">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <TrendingUp className="w-5 h-5 text-primary" />
              Personalized Recommendations
            </CardTitle>
            <CardDescription>
              Actionable tips to improve your interview performance
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="space-y-4">
              {report.recommendations.map((rec, i) => (
                <li key={i} className="flex items-start gap-4 p-4 bg-muted/30 rounded-lg">
                  <span className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold flex-shrink-0">
                    {i + 1}
                  </span>
                  <p className="text-sm flex-1">{rec}</p>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}

      <Card data-testid="card-question-breakdown">
        <CardHeader>
          <CardTitle className="text-lg">Question-by-Question Breakdown</CardTitle>
          <CardDescription>
            Detailed analysis of each answer with AI-generated feedback
          </CardDescription>
        </CardHeader>
        <CardContent>
          {report.answers && report.answers.length > 0 ? (
            <Accordion type="single" collapsible className="w-full">
              {report.answers.map((answer, i) => (
                <AnswerCard key={answer.id} answer={answer} index={i} />
              ))}
            </Accordion>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">
              No answer details available.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-center gap-4 mt-8 pt-8 border-t flex-wrap">
        <Link href="/interview/setup">
          <Button size="lg" data-testid="button-practice-again">
            <Play className="w-5 h-5 mr-2" />
            Practice Again
          </Button>
        </Link>
        <Link href="/dashboard">
          <Button variant="outline" size="lg" data-testid="button-view-dashboard">
            View Dashboard
          </Button>
        </Link>
      </div>
    </div>
  );
}
