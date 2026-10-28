import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, ChevronLeft, ChevronRight, Download, Loader2, Search, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { api, errorMessage, getToken } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { ACTIVITY_LABELS, activityText, useOrganization, type ActivityEvent, type Organization } from "@/lib/hiring";

interface ActivityPage {
  events: (ActivityEvent & { id: number; candidate: { id: number; name: string; jobTitle: string } | null })[];
  page: number;
  pages: number;
  total: number;
  actions: string[];
  people: { id: number; name: string }[];
}

const RETENTION = [
  ["keep", "Until someone deletes them"],
  ["6", "6 months"],
  ["12", "12 months"],
  ["24", "24 months"],
] as const;

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

function Retention({ org }: { org: Organization }) {
  const { toast } = useToast();
  const owner = org.myRole === "owner";
  const save = useMutation({
    mutationFn: (value: string) => api<Organization>("/api/v1/organization", { method: "PATCH", body: { retentionMonths: value === "keep" ? null : Number(value) } }),
    onSuccess: (o) => {
      queryClient.setQueryData(["/api/v1/organization"], o);
      toast({ title: "Saved", description: o.retentionMonths ? `Candidates untouched for ${o.retentionMonths} months are anonymised each night.` : "Candidate data is kept until someone deletes it." });
    },
    onError: (e) => toast({ title: "Couldn't save that", description: errorMessage(e), variant: "destructive" }),
  });
  return (
    <section className="rounded-2xl border bg-card p-5 sm:p-6" aria-labelledby="retention-heading">
      <h2 id="retention-heading" className="flex items-center gap-2 text-lg font-semibold">
        <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />
        Keep candidate data
      </h2>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
        After this long without any activity, a candidate is anonymised: their answers, CV, notes, scorecards and interview transcripts are deleted,
        their name and email are replaced, and their link stops working. Counts and scores stay, so analytics still add up. Anyone with an interview booked is skipped.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Select value={org.retentionMonths ? String(org.retentionMonths) : "keep"} onValueChange={(v) => save.mutate(v)} disabled={!owner || save.isPending}>
          <SelectTrigger className="w-64" aria-label="Keep candidate data">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RETENTION.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
          </SelectContent>
        </Select>
        {save.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-label="Saving" />}
        {!owner && <span className="text-sm text-muted-foreground">Only the owner can change this.</span>}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">Candidates can also withdraw from their own link at any time, which deletes their answers straight away.</p>
    </section>
  );
}

function AuditLog() {
  const { toast } = useToast();
  const [page, setPage] = useState(1);
  const [action, setAction] = useState("all");
  const [person, setPerson] = useState("all");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(q.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);
  const params = new URLSearchParams({ page: String(page) });
  if (action !== "all") params.set("action_name", action);
  if (person !== "all") params.set("userId", person);
  if (search) params.set("q", search);
  const { data, isFetching } = useQuery<ActivityPage>({ queryKey: [`/api/v1/hiring/activity?${params}`], placeholderData: (p) => p });

  const exportCsv = useMutation({
    mutationFn: async () => {
      params.delete("page");
      const res = await fetch(`/api/v1/hiring/activity.csv?${params}`, { headers: { Authorization: `Bearer ${getToken()}` } });
      if (!res.ok) throw new Error("The export couldn't be prepared.");
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `nexora-activity-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    },
    onError: (e) => toast({ title: "Couldn't export", description: errorMessage(e), variant: "destructive" }),
  });

  return (
    <section className="rounded-2xl border bg-card p-5 sm:p-6" aria-labelledby="audit-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="audit-heading" className="text-lg font-semibold">Activity log</h2>
          <p className="mt-1 text-sm text-muted-foreground">Everything your team did with candidates: who opened, scored, moved, emailed or exported them.</p>
        </div>
        <Button variant="outline" onClick={() => exportCsv.mutate()} disabled={exportCsv.isPending}>
          {exportCsv.isPending ? <Loader2 className="animate-spin" /> : <Download />}
          Export CSV
        </Button>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <div className="relative min-w-[14rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by candidate name or email" className="pl-9" aria-label="Search by candidate" />
        </div>
        <Select value={action} onValueChange={(v) => { setAction(v); setPage(1); }}>
          <SelectTrigger className="w-56" aria-label="What happened"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Everything</SelectItem>
            {data?.actions.map((a) => <SelectItem key={a} value={a}>{ACTIVITY_LABELS[a] ?? a.replace(/_/g, " ")}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={person} onValueChange={(v) => { setPerson(v); setPage(1); }}>
          <SelectTrigger className="w-48" aria-label="Who"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Anyone</SelectItem>
            {data?.people.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="-mx-5 mt-4 overflow-x-auto sm:-mx-6">
        <table className="w-full min-w-[40rem] text-sm" aria-busy={isFetching}>
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="px-5 py-2 font-medium sm:px-6">When</th>
              <th className="py-2 font-medium">Who</th>
              <th className="py-2 font-medium">What</th>
              <th className="px-5 py-2 font-medium sm:px-6">Candidate</th>
            </tr>
          </thead>
          <tbody>
            {data?.events.map((e) => (
              <tr key={e.id} className="border-b last:border-0">
                <td className="whitespace-nowrap px-5 py-2.5 text-muted-foreground tabular-nums sm:px-6">{when(e.at)}</td>
                <td className="py-2.5">{e.by ?? <span className="text-muted-foreground">Candidate or system</span>}</td>
                <td className="py-2.5">{activityText(e)}</td>
                <td className="px-5 py-2.5 sm:px-6">
                  {e.candidate ? (
                    <Link href={`/hiring/candidates/${e.candidate.id}`} className="hover:text-primary">
                      {e.candidate.name}
                      <span className="block text-xs text-muted-foreground">{e.candidate.jobTitle}</span>
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">–</span>
                  )}
                </td>
              </tr>
            ))}
            {data?.events.length === 0 && (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-muted-foreground">Nothing matches those filters.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {data && data.pages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{data.total} entries</span>
          <div className="flex items-center gap-2">
            <Button size="icon" variant="outline" onClick={() => setPage((p) => p - 1)} disabled={page <= 1} aria-label="Newer"><ChevronLeft /></Button>
            <span className="tabular-nums">Page {data.page} of {data.pages}</span>
            <Button size="icon" variant="outline" onClick={() => setPage((p) => p + 1)} disabled={page >= data.pages} aria-label="Older"><ChevronRight /></Button>
          </div>
        </div>
      )}
    </section>
  );
}

export default function PrivacyPage() {
  const { data: org } = useOrganization();
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <Link href="/hiring" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Hiring
      </Link>
      <h1 className="mt-3 text-3xl font-bold sm:text-4xl">Privacy and activity</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">How long candidates' data is kept, and a record of who did what.</p>
      <div className="mt-8 space-y-6">
        {org && <Retention org={org} />}
        <AuditLog />
      </div>
    </div>
  );
}
