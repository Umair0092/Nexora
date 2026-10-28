import { useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Check, Copy, Download, KeyRound, Loader2, Plus, Send, Trash2, Webhook } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { api, errorMessage, getToken } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { timeAgo, useOrganization, type Job } from "@/lib/hiring";
import { cn } from "@/lib/utils";

interface Delivery { id: string; event: string; statusCode: number | null; error: string | null; attempts: number; succeeded: boolean; at: string }
interface Endpoint { id: number; url: string; events: string[]; active: boolean; createdAt: string; secretHint: string; deliveries: Delivery[]; secret?: string }

const EVENT_LABELS: Record<string, string> = {
  "candidate.invited": "A candidate is invited",
  "candidate.completed": "A candidate finishes the screening",
  "candidate.stage_changed": "A candidate moves stage",
  "candidate.withdrew": "A candidate withdraws",
  "meeting.scheduled": "An interview is scheduled",
  "meeting.cancelled": "An interview is cancelled",
  "meeting.minutes_ready": "Interview minutes are ready",
};

const VERIFY_SNIPPET = `// Node: check a Nexora webhook before trusting it
const [, t, v1] = req.headers["nexora-signature"].match(/t=(\\d+),v1=(\\w+)/);
const expected = crypto.createHmac("sha256", process.env.NEXORA_WEBHOOK_SECRET)
  .update(\`\${t}.\${rawBody}\`).digest("hex");
const fresh = Math.abs(Date.now() / 1000 - Number(t)) < 300;
if (!fresh || !crypto.timingSafeEqual(Buffer.from(v1), Buffer.from(expected))) return res.sendStatus(400);`;

function Section({ title, hint, children, action }: { title: string; hint: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="rounded-2xl border bg-card p-5 sm:p-6" aria-label={title}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="mt-0.5 max-w-2xl text-sm text-muted-foreground">{hint}</p>
        </div>
        {action}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={() => {
        navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        });
      }}
    >
      {done ? <Check /> : <Copy />}
      {done ? "Copied" : label}
    </Button>
  );
}

function ExportCsv() {
  const { toast } = useToast();
  const { data: jobs } = useQuery<Job[]>({ queryKey: ["/api/v1/jobs"] });
  const [jobId, setJobId] = useState("all");
  const download = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/v1/candidates/export${jobId === "all" ? "" : `?jobId=${jobId}`}`, { headers: { Authorization: `Bearer ${getToken()}` } });
      if (!res.ok) throw new Error("The export couldn't be prepared. Try again in a minute.");
      const name = res.headers.get("content-disposition")?.match(/filename="?([^";]+)"?/)?.[1] ?? "nexora-candidates.csv";
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    },
    onError: (error) => toast({ title: "Couldn't export", description: errorMessage(error), variant: "destructive" }),
  });
  return (
    <Section title="Export candidates" hint="A CSV with names, emails, jobs, stages, scores and links. Greenhouse, Lever and most applicant tracking systems import these columns. Answers and transcripts stay in Nexora.">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={jobId} onValueChange={setJobId}>
          <SelectTrigger className="w-60" aria-label="Which job">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All jobs</SelectItem>
            {jobs?.map((j) => <SelectItem key={j.id} value={String(j.id)}>{j.title}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button onClick={() => download.mutate()} disabled={download.isPending} data-testid="button-export-csv">
          {download.isPending ? <Loader2 className="animate-spin" /> : <Download />}
          Download CSV
        </Button>
      </div>
    </Section>
  );
}

function EventChecklist({ events, value, onChange }: { events: string[]; value: Set<string>; onChange: (v: Set<string>) => void }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {events.map((e) => (
        <label key={e} className="flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2 text-sm has-[:checked]:border-primary/60 has-[:checked]:bg-accent/40">
          <Checkbox
            checked={value.has(e)}
            className="mt-0.5"
            onCheckedChange={() => {
              const next = new Set(value);
              if (next.has(e)) next.delete(e);
              else next.add(e);
              onChange(next);
            }}
          />
          <span>
            {EVENT_LABELS[e] ?? e}
            <span className="block font-mono text-[11px] text-muted-foreground">{e}</span>
          </span>
        </label>
      ))}
    </div>
  );
}

function Webhooks() {
  const { toast } = useToast();
  const key = ["/api/v1/webhooks"];
  const { data } = useQuery<{ events: string[]; endpoints: Endpoint[] }>({ queryKey: key, refetchInterval: 8000 });
  const [adding, setAdding] = useState(false);
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<Set<string>>(new Set(["candidate.completed", "candidate.stage_changed"]));
  const [secret, setSecret] = useState<{ url: string; secret: string } | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: key });
  const onError = (title: string) => (error: unknown) => toast({ title, description: errorMessage(error), variant: "destructive" });

  const create = useMutation({
    mutationFn: () => api<Endpoint>("/api/v1/webhooks", { method: "POST", body: { url, events: Array.from(events) } }),
    onSuccess: (e) => {
      setAdding(false);
      setUrl("");
      setSecret({ url: e.url, secret: e.secret! });
      refresh();
    },
    onError: onError("Couldn't add the webhook"),
  });
  const update = useMutation({
    mutationFn: ({ id, ...body }: { id: number; active?: boolean }) => api(`/api/v1/webhooks/${id}`, { method: "PATCH", body }),
    onSuccess: refresh,
    onError: onError("Couldn't update the webhook"),
  });
  const test = useMutation({
    mutationFn: (id: number) => api(`/api/v1/webhooks/${id}/test`, { method: "POST" }),
    onSuccess: () => {
      toast({ title: "Test event sent", description: "Its result shows below in a few seconds." });
      setTimeout(refresh, 2500);
    },
    onError: onError("Couldn't send a test"),
  });
  const rotate = useMutation({
    mutationFn: (id: number) => api<Endpoint>(`/api/v1/webhooks/${id}/rotate`, { method: "POST" }),
    onSuccess: (e) => {
      setSecret({ url: e.url, secret: e.secret! });
      refresh();
    },
    onError: onError("Couldn't make a new secret"),
  });
  const remove = useMutation({
    mutationFn: (id: number) => api(`/api/v1/webhooks/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Webhook removed" });
      refresh();
    },
    onError: onError("Couldn't remove the webhook"),
  });

  return (
    <Section
      title="Webhooks"
      hint="Nexora posts JSON to your URL when something happens, so your ATS, Slack bridge or Zapier can react. Every request is signed with the webhook's secret."
      action={
        <Button onClick={() => setAdding(true)} data-testid="button-add-webhook">
          <Plus />
          Add webhook
        </Button>
      }
    >
      {data?.endpoints.length === 0 && (
        <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          <Webhook className="mx-auto mb-2 h-6 w-6" aria-hidden="true" />
          No webhooks yet.
        </div>
      )}
      <ul className="space-y-4">
        {data?.endpoints.map((e) => (
          <li key={e.id} className="rounded-xl border p-4" data-testid={`webhook-${e.id}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-mono text-sm">{e.url}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {e.events.length} event{e.events.length === 1 ? "" : "s"}, secret {e.secretHint}
                </p>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={e.active} onCheckedChange={(active) => update.mutate({ id: e.id, active })} aria-label="Active" />
                {e.active ? "On" : "Off"}
              </label>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {e.events.map((ev) => (
                <span key={ev} className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px]">{ev}</span>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => test.mutate(e.id)} disabled={test.isPending}>
                <Send />
                Send a test event
              </Button>
              <Button size="sm" variant="outline" onClick={() => rotate.mutate(e.id)} disabled={rotate.isPending}>
                <KeyRound />
                New secret
              </Button>
              <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => remove.mutate(e.id)}>
                <Trash2 />
                Remove
              </Button>
            </div>
            {e.deliveries.length > 0 && (
              <table className="mt-4 w-full text-sm">
                <caption className="sr-only">Recent deliveries</caption>
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-1.5 font-medium">Event</th>
                    <th className="py-1.5 font-medium">Result</th>
                    <th className="py-1.5 text-right font-medium">When</th>
                  </tr>
                </thead>
                <tbody>
                  {e.deliveries.map((d) => (
                    <tr key={d.id} className="border-b last:border-0">
                      <td className="py-1.5 font-mono text-xs">{d.event}</td>
                      <td className="py-1.5 text-xs">
                        <span className={cn("inline-flex items-center gap-1.5", d.succeeded ? "text-success" : d.attempts ? "text-destructive" : "text-muted-foreground")}>
                          <span className={cn("h-1.5 w-1.5 rounded-full", d.succeeded ? "bg-success" : d.attempts ? "bg-destructive" : "bg-muted-foreground")} aria-hidden="true" />
                          {d.succeeded ? `Delivered (${d.statusCode})` : d.attempts ? `Failed: ${d.statusCode ?? d.error}${d.attempts > 1 ? `, ${d.attempts} tries` : ""}` : "Sending"}
                        </span>
                      </td>
                      <td className="py-1.5 text-right text-xs text-muted-foreground">{timeAgo(d.at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </li>
        ))}
      </ul>

      <details className="mt-5 rounded-xl bg-muted/50 p-4 text-sm">
        <summary className="cursor-pointer font-medium">Checking the signature</summary>
        <p className="mt-2 text-muted-foreground">
          Each request has a <code className="font-mono text-xs">Nexora-Signature</code> header: a timestamp and an HMAC-SHA256 of
          <code className="font-mono text-xs"> timestamp.body</code> made with your secret. Failed deliveries are retried up to six times.
        </p>
        <pre className="mt-3 overflow-x-auto rounded-lg bg-background p-3 font-mono text-xs leading-relaxed">{VERIFY_SNIPPET}</pre>
      </details>

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add a webhook</DialogTitle>
            <DialogDescription>A public https address. Nexora won't call private networks or localhost.</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-5"
            onSubmit={(ev) => {
              ev.preventDefault();
              create.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="webhook-url">Endpoint URL</Label>
              <Input id="webhook-url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://hooks.example.com/nexora" required />
            </div>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Send these events</legend>
              <EventChecklist events={data?.events ?? []} value={events} onChange={setEvents} />
            </fieldset>
            <DialogFooter>
              <Button type="submit" disabled={!url.startsWith("https://") || events.size === 0 || create.isPending}>
                {create.isPending && <Loader2 className="animate-spin" />}
                Add webhook
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!secret} onOpenChange={(o) => !o && setSecret(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Copy the signing secret</DialogTitle>
            <DialogDescription>For {secret?.url}. You won't see it again; make a new one if it's lost.</DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 rounded-lg bg-muted p-3">
            <code className="min-w-0 flex-1 truncate font-mono text-sm">{secret?.secret}</code>
            {secret && <CopyButton text={secret.secret} label="Copy" />}
          </div>
          <DialogFooter>
            <Button onClick={() => setSecret(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Section>
  );
}

export default function IntegrationsPage() {
  const { data: org } = useOrganization();
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <Link href="/hiring" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Hiring
      </Link>
      <h1 className="mt-3 text-3xl font-bold sm:text-4xl">Integrations</h1>
      <p className="mt-2 text-muted-foreground">Take candidates to the rest of your hiring stack.</p>
      <div className="mt-8 space-y-6">
        <ExportCsv />
        {org?.myRole === "owner" ? (
          <Webhooks />
        ) : (
          <p className="rounded-xl bg-muted p-4 text-sm">Webhooks are managed by your company's owner.</p>
        )}
      </div>
    </div>
  );
}
