import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Play, 
  Clock, 
  TrendingUp, 
  BarChart3, 
  ArrowRight,
  Calendar,
  Target,
  Award,
  FileText,
} from "lucide-react";
import type { InterviewSessionWithDomain, Domain } from "@shared/schema";

function ScoreCircle({ score, size = "lg" }: { score: number; size?: "sm" | "lg" }) {
  const circumference = 2 * Math.PI * (size === "lg" ? 45 : 30);
  const strokeDashoffset = circumference - (score / 100) * circumference;
  const radius = size === "lg" ? 45 : 30;
  const svgSize = size === "lg" ? 120 : 80;
  const strokeWidth = size === "lg" ? 8 : 6;

  const getScoreColor = (s: number) => {
    if (s >= 80) return "text-green-500";
    if (s >= 60) return "text-yellow-500";
    return "text-red-500";
  };

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={svgSize} height={svgSize} className="transform -rotate-90">
        <circle
          cx={svgSize / 2}
          cy={svgSize / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="none"
          className="text-muted"
        />
        <circle
          cx={svgSize / 2}
          cy={svgSize / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          className={getScoreColor(score)}
        />
      </svg>
      <span className={`absolute font-bold ${size === "lg" ? "text-2xl" : "text-lg"}`}>
        {Math.round(score)}%
      </span>
    </div>
  );
}

function SessionCard({ session }: { session: InterviewSessionWithDomain }) {
  const formattedDate = session.startedAt 
    ? new Date(session.startedAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "Unknown date";

  return (
    <Card className="hover-elevate" data-testid={`card-session-${session.id}`}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <Badge variant="secondary" className="text-xs">
                {session.domain?.name || "General"}
              </Badge>
              <Badge 
                variant={session.status === "completed" ? "default" : "outline"}
                className="text-xs"
              >
                {session.status === "completed" ? "Completed" : "In Progress"}
              </Badge>
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                {formattedDate}
              </span>
              <span className="flex items-center gap-1">
                <Target className="w-4 h-4" />
                {session.completedQuestions || 0}/{session.totalQuestions || 5} questions
              </span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {session.overallScore !== null && session.overallScore !== undefined && (
              <ScoreCircle score={session.overallScore} size="sm" />
            )}
            <Link href={session.status === "completed" ? `/report/${session.id}` : `/interview/session/${session.id}`}>
              <Button variant="outline" size="sm" data-testid={`button-view-session-${session.id}`}>
                {session.status === "completed" ? "View Report" : "Continue"}
                <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SessionSkeleton() {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-5 w-20" />
            </div>
            <div className="flex items-center gap-4">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-32" />
            </div>
          </div>
          <Skeleton className="h-16 w-16 rounded-full" />
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { user } = useAuth();

  const { data: sessions, isLoading: sessionsLoading } = useQuery<InterviewSessionWithDomain[]>({
    queryKey: ["/api/sessions"],
  });

  const { data: stats } = useQuery<{
    totalSessions: number;
    averageScore: number;
    completedSessions: number;
  }>({
    queryKey: ["/api/sessions/stats"],
  });

  const recentSessions = sessions?.slice(0, 5) || [];
  const completedCount = stats?.completedSessions || 0;
  const avgScore = stats?.averageScore || 0;

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2" data-testid="text-dashboard-title">
          Welcome back{user?.firstName ? `, ${user.firstName}` : ""}!
        </h1>
        <p className="text-muted-foreground">
          Ready to practice your interview skills? Start a new session or review your progress.
        </p>
      </div>

      <Card className="mb-8 bg-gradient-to-r from-primary to-primary/80 text-primary-foreground border-0">
        <CardContent className="p-8">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div>
              <h2 className="text-2xl font-bold mb-2">Start a New Interview</h2>
              <p className="text-primary-foreground/80 max-w-md">
                Practice with AI-powered feedback and improve your interview performance.
              </p>
            </div>
            <Link href="/interview/setup">
              <Button size="lg" variant="secondary" data-testid="button-start-interview">
                <Play className="w-5 h-5 mr-2" />
                Begin Practice
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-3 gap-6 mb-8">
        <Card data-testid="card-stat-total-sessions">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <BarChart3 className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats?.totalSessions || 0}</p>
                <p className="text-sm text-muted-foreground">Total Sessions</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-stat-completed">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-green-500/10 flex items-center justify-center">
                <Award className="w-6 h-6 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{completedCount}</p>
                <p className="text-sm text-muted-foreground">Completed</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-stat-average-score">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-yellow-500/10 flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-yellow-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{avgScore > 0 ? `${Math.round(avgScore)}%` : "N/A"}</p>
                <p className="text-sm text-muted-foreground">Average Score</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div>
        <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
          <div>
            <h2 className="text-xl font-semibold">Recent Sessions</h2>
            <p className="text-sm text-muted-foreground">Your latest interview practice sessions</p>
          </div>
          {sessions && sessions.length > 5 && (
            <Link href="/history">
              <Button variant="outline" size="sm" data-testid="button-view-all-sessions">
                View All
                <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          )}
        </div>

        <div className="space-y-4">
          {sessionsLoading ? (
            <>
              <SessionSkeleton />
              <SessionSkeleton />
              <SessionSkeleton />
            </>
          ) : recentSessions.length > 0 ? (
            recentSessions.map((session) => (
              <SessionCard key={session.id} session={session} />
            ))
          ) : (
            <Card className="p-12 text-center">
              <div className="mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <FileText className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">No Sessions Yet</h3>
              <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
                Start your first interview practice session to see your progress here.
              </p>
              <Link href="/interview/setup">
                <Button data-testid="button-start-first-session">
                  <Play className="w-4 h-4 mr-2" />
                  Start Your First Session
                </Button>
              </Link>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
