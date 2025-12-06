import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  ArrowRight, 
  Calendar, 
  Target, 
  FileText, 
  Play,
  Filter,
} from "lucide-react";
import type { InterviewSessionWithDomain } from "@shared/schema";

function ScoreCircle({ score }: { score: number }) {
  const circumference = 2 * Math.PI * 25;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  const getScoreColor = (s: number) => {
    if (s >= 80) return "text-green-500";
    if (s >= 60) return "text-yellow-500";
    return "text-red-500";
  };

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={64} height={64} className="transform -rotate-90">
        <circle
          cx={32}
          cy={32}
          r={25}
          stroke="currentColor"
          strokeWidth={5}
          fill="none"
          className="text-muted"
        />
        <circle
          cx={32}
          cy={32}
          r={25}
          stroke="currentColor"
          strokeWidth={5}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          className={getScoreColor(score)}
        />
      </svg>
      <span className="absolute font-bold text-sm">{Math.round(score)}%</span>
    </div>
  );
}

function SessionCard({ session }: { session: InterviewSessionWithDomain }) {
  const formattedDate = session.startedAt
    ? new Date(session.startedAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Unknown date";

  return (
    <Card className="hover-elevate" data-testid={`card-history-session-${session.id}`}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <Badge variant="secondary">{session.domain?.name || "General"}</Badge>
              <Badge variant="outline">{session.difficulty}</Badge>
              <Badge 
                variant={session.status === "completed" ? "default" : "secondary"}
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
            {session.status === "completed" && session.overallScore !== null && session.overallScore !== undefined && (
              <ScoreCircle score={session.overallScore} />
            )}
            <Link href={session.status === "completed" ? `/report/${session.id}` : `/interview/session/${session.id}`}>
              <Button variant="outline" data-testid={`button-action-session-${session.id}`}>
                {session.status === "completed" ? (
                  <>
                    View Report
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </>
                ) : (
                  <>
                    Continue
                    <Play className="w-4 h-4 ml-2" />
                  </>
                )}
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
            <div className="flex items-center gap-2 mb-3">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-5 w-20" />
            </div>
            <div className="flex items-center gap-4">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-4 w-28" />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Skeleton className="h-16 w-16 rounded-full" />
            <Skeleton className="h-10 w-28" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function SessionHistory() {
  const { data: sessions, isLoading } = useQuery<InterviewSessionWithDomain[]>({
    queryKey: ["/api/sessions"],
  });

  const completedSessions = sessions?.filter(s => s.status === "completed") || [];
  const inProgressSessions = sessions?.filter(s => s.status !== "completed") || [];

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-4 mb-8 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold mb-2" data-testid="text-history-title">Session History</h1>
          <p className="text-muted-foreground">
            View all your past interview practice sessions
          </p>
        </div>
        <Link href="/interview/setup">
          <Button data-testid="button-new-session">
            <Play className="w-4 h-4 mr-2" />
            New Session
          </Button>
        </Link>
      </div>

      {inProgressSessions.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
            In Progress
          </h2>
          <div className="space-y-4">
            {inProgressSessions.map((session) => (
              <SessionCard key={session.id} session={session} />
            ))}
          </div>
        </div>
      )}

      <div>
        <h2 className="text-lg font-semibold mb-4">Completed Sessions</h2>
        {isLoading ? (
          <div className="space-y-4">
            <SessionSkeleton />
            <SessionSkeleton />
            <SessionSkeleton />
          </div>
        ) : completedSessions.length > 0 ? (
          <div className="space-y-4">
            {completedSessions.map((session) => (
              <SessionCard key={session.id} session={session} />
            ))}
          </div>
        ) : (
          <Card className="p-12 text-center">
            <div className="mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <FileText className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No Completed Sessions</h3>
            <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
              Complete your first interview practice session to see your history here.
            </p>
            <Link href="/interview/setup">
              <Button data-testid="button-start-first">
                <Play className="w-4 h-4 mr-2" />
                Start Your First Session
              </Button>
            </Link>
          </Card>
        )}
      </div>
    </div>
  );
}
