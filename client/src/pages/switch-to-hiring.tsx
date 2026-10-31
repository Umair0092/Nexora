import { Link } from "wouter";
import { Briefcase, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSwitchWorkspace } from "@/hooks/useAuth";

// A practice account that follows a hiring link. Hiring is its own workspace, so
// say what it is and let the person choose rather than mixing the two.
export default function SwitchToHiring() {
  const switchWorkspace = useSwitchWorkspace();

  return (
    <div className="mx-auto max-w-xl px-4 py-16 sm:px-6 sm:py-20">
      <Briefcase className="h-8 w-8 text-primary" aria-hidden="true" />
      <h1 className="mt-4 text-3xl font-bold sm:text-4xl">Hiring has its own workspace</h1>
      <p className="mt-4 text-muted-foreground">
        This account is set up for interview practice. Companies use a separate hiring workspace to post jobs, screen candidates
        with spoken interviews, run live interviews with an AI notetaker and track their pipeline.
      </p>
      <p className="mt-3 text-muted-foreground">
        If you're hiring, switch this account. Your practice interviews stay saved, and you can switch back from Account settings
        until you create or join a company.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Button size="lg" onClick={() => switchWorkspace.mutate("employer")} disabled={switchWorkspace.isPending} data-testid="button-switch-to-hiring">
          {switchWorkspace.isPending && <Loader2 className="animate-spin" />}
          Switch to hiring
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/dashboard">Keep practising</Link>
        </Button>
      </div>
    </div>
  );
}
