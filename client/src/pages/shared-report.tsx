import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { api } from "@/lib/api";
import type { Report } from "@/lib/types";
import { ReportView } from "@/components/report/report-view";
import { ReportSkeleton } from "@/pages/performance-report";

// Public, read-only report behind a share link. Works signed in or out.
export default function SharedReport() {
  const params = useParams<{ token: string }>();
  const [open, setOpen] = useState<string[]>([]);
  const { data: report, isLoading, error } = useQuery<Report>({
    queryKey: ["/api/v1/shared", params.token],
    queryFn: () => api<Report>(`/api/v1/shared/${encodeURIComponent(params.token)}`),
  });

  // Keep shared reports out of search engines.
  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between border-b px-4 py-3 sm:px-6 print:hidden">
        <Link href="/" aria-label="Nexora home">
          <Brand />
        </Link>
        <ThemeToggle />
      </header>
      {isLoading ? (
        <ReportSkeleton />
      ) : !report || error ? (
        <main className="mx-auto max-w-lg px-4 py-20">
          <h1 className="text-2xl font-bold">This report isn't available</h1>
          <p className="mt-3 text-muted-foreground">The link has been turned off by its owner, or it's incomplete.</p>
          <Button asChild className="mt-8">
            <Link href="/">Go to Nexora</Link>
          </Button>
        </main>
      ) : (
        <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
          <p className="rounded-xl bg-muted/60 px-4 py-3 text-sm text-muted-foreground print:hidden">
            A practice interview report shared from Nexora. It's read-only.
          </p>
          <ReportView report={report} open={open} onOpenChange={setOpen} />
          <div className="mt-10 border-t pt-8 print:hidden">
            <p className="font-semibold">Want feedback like this on your own interviews?</p>
            <Button asChild className="mt-3">
              <Link href="/auth?mode=register">Try Nexora free</Link>
            </Button>
          </div>
        </main>
      )}
    </div>
  );
}
