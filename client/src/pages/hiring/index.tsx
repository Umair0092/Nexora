import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Briefcase, Loader2, Mail, Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { api, errorMessage } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { formatSeconds, useOrganization, type Job, type Organization } from "@/lib/hiring";
import { cn } from "@/lib/utils";

function CreateCompany() {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const create = useMutation({
    mutationFn: () => api<Organization>("/api/v1/organization", { method: "POST", body: { name } }),
    onSuccess: (org) => queryClient.setQueryData(["/api/v1/organization"], org),
    onError: (error) => toast({ title: "Couldn't create the company", description: errorMessage(error), variant: "destructive" }),
  });

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 lg:py-16">
      <Briefcase className="h-10 w-10 text-primary" aria-hidden="true" />
      <h1 className="mt-5 text-3xl font-bold sm:text-4xl">Screen candidates with Nexora</h1>
      <p className="mt-3 text-lg text-muted-foreground">
        Set up a job with the questions you want answered, send candidates a link, and review their spoken answers with your team.
      </p>
      <ul className="mt-6 space-y-2 text-muted-foreground">
        <li>Every candidate for a job answers the same questions, so you compare like with like.</li>
        <li>Only the content of answers is assessed: no camera, and no judging of accent or delivery.</li>
        <li>An AI summary helps you read faster. Your team makes the decision.</li>
      </ul>

      <form
        className="mt-10 rounded-2xl border bg-card p-5 sm:p-6"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <Label htmlFor="company-name" className="text-base font-semibold">Company name</Label>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row">
          <Input id="company-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required placeholder="Acme Ltd" />
          <Button type="submit" disabled={!name.trim() || create.isPending} className="shrink-0" data-testid="button-create-company">
            {create.isPending && <Loader2 className="animate-spin" />}
            Create company
          </Button>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">Joining a team that already uses Nexora? Open the invitation link from your email instead.</p>
      </form>
    </div>
  );
}

function JobCard({ job }: { job: Job }) {
  const counts = job.candidateCounts;
  const total = Object.values(counts).reduce((s, n) => s + (n ?? 0), 0);
  return (
    <Link
      href={`/hiring/jobs/${job.id}`}
      className="block rounded-2xl border bg-card p-5 transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      data-testid={`link-job-${job.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-lg font-semibold">{job.title}</h2>
        <span
          className={cn(
            "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium",
            job.status === "open" ? "bg-success/15 text-success" : "bg-muted text-muted-foreground",
          )}
        >
          {job.status === "open" ? "Open" : "Closed"}
        </span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {job.questions.length} questions, up to {formatSeconds(job.answerSeconds)} each
      </p>
      <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <div><dt className="inline text-muted-foreground">Candidates </dt><dd className="inline font-semibold tabular-nums">{total}</dd></div>
        <div><dt className="inline text-muted-foreground">Finished </dt><dd className="inline font-semibold tabular-nums">{counts.completed ?? 0}</dd></div>
        <div><dt className="inline text-muted-foreground">In progress </dt><dd className="inline font-semibold tabular-nums">{counts.in_progress ?? 0}</dd></div>
      </dl>
    </Link>
  );
}

export default function HiringHome() {
  const { data: org, isLoading } = useOrganization();
  const { data: jobs, isLoading: jobsLoading } = useQuery<Job[]>({ queryKey: ["/api/v1/jobs"], enabled: !!org });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="mt-8 h-32 w-full" />
      </div>
    );
  }
  if (!org) return <CreateCompany />;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{org.name}</p>
          <h1 className="text-3xl font-bold sm:text-4xl">Hiring</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/hiring/templates">
              <Mail />
              Email templates
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/hiring/team">
              <Users />
              Team
            </Link>
          </Button>
          <Button asChild data-testid="button-new-job">
            <Link href="/hiring/jobs/new">
              <Plus />
              New job
            </Link>
          </Button>
        </div>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {jobsLoading && [0, 1].map((i) => <Skeleton key={i} className="h-36 rounded-2xl" />)}
        {jobs?.map((job) => <JobCard key={job.id} job={job} />)}
      </div>
      {jobs && jobs.length === 0 && (
        <div className="mt-2 rounded-2xl border border-dashed p-8 text-center">
          <p className="font-semibold">No jobs yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Create a job, choose its questions, then invite candidates.</p>
          <Button asChild className="mt-5">
            <Link href="/hiring/jobs/new">
              <Plus />
              New job
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}
