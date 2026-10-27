import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Printer, Share2, Mic } from "lucide-react";
import { api } from "@/lib/api";
import type { Answer, Report } from "@/lib/types";
import { ReportView } from "@/components/report/report-view";
import { RetryDialog } from "@/components/report/retry-dialog";
import { ShareDialog } from "@/components/report/share-dialog";

export function ReportSkeleton() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <Skeleton className="h-5 w-32" />
      <Skeleton className="mt-4 h-10 w-80 max-w-full" />
      <Skeleton className="mt-8 h-64 rounded-2xl" />
      <Skeleton className="mt-6 h-96 rounded-2xl" />
    </div>
  );
}

export default function PerformanceReport() {
  const params = useParams<{ id: string }>();
  const [open, setOpen] = useState<string[]>([]);
  const [retrying, setRetrying] = useState<Answer | null>(null);
  const [sharing, setSharing] = useState(false);

  const { data: report, isLoading, error } = useQuery<Report>({
    queryKey: ["/api/v1/sessions", params.id, "report"],
    queryFn: () => api<Report>(`/api/v1/sessions/${params.id}/report`),
  });

  const printReport = () => {
    // Expand every answer so the printout / PDF contains the full feedback.
    setOpen((report?.answers ?? []).map((_, i) => `q-${i}`));
    setTimeout(() => window.print(), 150);
  };

  if (isLoading) return <ReportSkeleton />;

  if (!report || error) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20">
        <h1 className="text-2xl font-bold">We couldn't find that report</h1>
        <p className="mt-3 text-muted-foreground">It may belong to another account, or the link is incomplete.</p>
        <Button asChild className="mt-8">
          <Link href="/history">See your past interviews</Link>
        </Button>
      </div>
    );
  }

  // Keep the dialog's answer in sync with the latest report data (new attempts).
  const retryAnswer = retrying ? report.answers?.find((a) => a.id === retrying.id) ?? retrying : null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Button asChild variant="ghost" size="sm" className="-ml-3" data-testid="button-back-dashboard">
          <Link href="/history">
            <ArrowLeft />
            Past interviews
          </Link>
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setSharing(true)} data-testid="button-share-report">
            <Share2 />
            {report.shared ? "Shared" : "Share"}
          </Button>
          <Button variant="outline" size="sm" onClick={printReport} data-testid="button-download-report">
            <Printer />
            Print or save PDF
          </Button>
        </div>
      </div>

      <ReportView
        report={report}
        open={open}
        onOpenChange={setOpen}
        owner={{ sessionId: params.id, onRetry: setRetrying }}
      />

      <div className="mt-10 flex flex-col gap-3 border-t pt-8 sm:flex-row print:hidden">
        <Button asChild size="lg" data-testid="button-practice-again">
          <Link href="/interview/setup">
            <Mic />
            New interview
          </Link>
        </Button>
        <Button asChild variant="outline" size="lg" data-testid="button-view-dashboard">
          <Link href="/dashboard">Back to overview</Link>
        </Button>
      </div>

      <RetryDialog
        answer={retryAnswer}
        sessionId={params.id}
        language={report.session?.language || "en"}
        open={!!retrying}
        onOpenChange={(o) => !o && setRetrying(null)}
      />
      <ShareDialog sessionId={params.id} shareUrl={report.shareUrl} open={sharing} onOpenChange={setSharing} />
    </div>
  );
}
