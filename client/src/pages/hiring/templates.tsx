import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowLeft, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { api, errorMessage } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { PLACEHOLDERS, type EmailTemplate } from "@/lib/hiring";
import { cn } from "@/lib/utils";

const KEY = ["/api/v1/email_templates"];
const BLANK = { name: "", subject: "", body: "" };

// The company's reusable emails to candidates.
export default function TemplatesPage() {
  const { toast } = useToast();
  const { data: templates, isLoading } = useQuery<EmailTemplate[]>({ queryKey: KEY });
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [draft, setDraft] = useState(BLANK);

  // Open the first template once they load.
  useEffect(() => {
    if (editing === null && templates?.length) setEditing(templates[0].id);
  }, [templates, editing]);
  useEffect(() => {
    if (editing === "new") setDraft(BLANK);
    const t = templates?.find((x) => x.id === editing);
    if (t) setDraft({ name: t.name, subject: t.subject, body: t.body });
  }, [editing, templates]);

  const save = useMutation({
    mutationFn: () =>
      editing === "new"
        ? api<EmailTemplate>("/api/v1/email_templates", { method: "POST", body: draft })
        : api<EmailTemplate>(`/api/v1/email_templates/${editing}`, { method: "PATCH", body: draft }),
    onSuccess: (t) => {
      queryClient.invalidateQueries({ queryKey: KEY });
      setEditing(t.id);
      toast({ title: "Template saved" });
    },
    onError: (error) => toast({ title: "Couldn't save the template", description: errorMessage(error), variant: "destructive" }),
  });
  const remove = useMutation({
    mutationFn: (tid: number) => api(`/api/v1/email_templates/${tid}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEY });
      setEditing(null);
      toast({ title: "Template deleted" });
    },
    onError: (error) => toast({ title: "Couldn't delete the template", description: errorMessage(error), variant: "destructive" }),
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <Link href="/hiring" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Hiring
      </Link>
      <h1 className="mt-3 text-3xl font-bold sm:text-4xl">Email templates</h1>
      <p className="mt-2 text-muted-foreground">Start candidate emails from these. You can still edit each email before it's sent.</p>

      <div className="mt-8 grid gap-6 md:grid-cols-[16rem_1fr]">
        <nav aria-label="Templates" className="space-y-1">
          {isLoading && [0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
          {templates?.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setEditing(t.id)}
              aria-current={editing === t.id}
              className={cn(
                "block w-full rounded-lg px-3 py-2 text-left text-sm transition-colors",
                editing === t.id ? "bg-primary/10 font-semibold text-primary" : "hover:bg-muted",
              )}
            >
              {t.name}
            </button>
          ))}
          <Button variant="ghost" className="w-full justify-start" onClick={() => setEditing("new")}>
            <Plus />
            New template
          </Button>
        </nav>

        {editing !== null && (
          <form
            className="space-y-4 rounded-2xl border bg-card p-5"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="template-name">Name</Label>
              <Input id="template-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} maxLength={80} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="template-subject">Subject</Label>
              <Input id="template-subject" value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} maxLength={200} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="template-body">Message</Label>
              <Textarea id="template-body" value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} rows={12} maxLength={10000} required />
            </div>
            <div className="rounded-xl bg-muted/50 p-3 text-sm">
              <p className="font-medium">Filled in for each candidate</p>
              <dl className="mt-1 grid gap-x-4 gap-y-0.5 sm:grid-cols-[auto_1fr]">
                {PLACEHOLDERS.map(([p, what]) => (
                  <div key={p} className="contents">
                    <dt className="font-mono text-xs leading-5">{p}</dt>
                    <dd className="text-muted-foreground">{what}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div className="flex flex-wrap justify-between gap-3">
              {typeof editing === "number" ? (
                <Button type="button" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => remove.mutate(editing)} disabled={remove.isPending}>
                  <Trash2 />
                  Delete
                </Button>
              ) : <span />}
              <Button type="submit" disabled={save.isPending} data-testid="button-save-template">
                {save.isPending && <Loader2 className="animate-spin" />}
                Save template
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
