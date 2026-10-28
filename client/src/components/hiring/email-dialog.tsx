import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { api, errorMessage } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { fillPlaceholders, PLACEHOLDERS, type CandidateRow, type EmailTemplate } from "@/lib/hiring";

// Emails the chosen candidates, starting from a template. Placeholders are
// filled per candidate; the preview shows the first one.
export function EmailDialog({
  jobId,
  jobTitle,
  company,
  candidates,
  open,
  onOpenChange,
  onSent,
}: {
  jobId: number;
  jobTitle: string;
  company: string;
  candidates: CandidateRow[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSent: () => void;
}) {
  const { toast } = useToast();
  const { data: templates } = useQuery<EmailTemplate[]>({ queryKey: ["/api/v1/email_templates"], enabled: open });
  const [templateId, setTemplateId] = useState<string>("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  useEffect(() => {
    if (!open) return;
    setTemplateId("");
    setSubject("");
    setBody("");
  }, [open]);

  const pick = (id: string) => {
    const t = templates?.find((x) => String(x.id) === id);
    setTemplateId(id);
    if (t) {
      setSubject(t.subject);
      setBody(t.body);
    }
  };

  const send = useMutation({
    mutationFn: () =>
      api<{ sent: number }>(`/api/v1/jobs/${jobId}/emails`, { method: "POST", body: { candidateIds: candidates.map((c) => c.id), subject, body } }),
    onSuccess: ({ sent }) => {
      toast({ title: `Email sent to ${sent} ${sent === 1 ? "candidate" : "candidates"}`, description: "Replies come to your inbox." });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/jobs", String(jobId)] });
      onSent();
      onOpenChange(false);
    },
    onError: (error) => toast({ title: "Couldn't send the email", description: errorMessage(error), variant: "destructive" }),
  });

  const first = candidates[0];
  const names = candidates.map((c) => c.name);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Email {candidates.length === 1 ? first?.name : `${candidates.length} candidates`}</DialogTitle>
          <DialogDescription>
            {candidates.length > 1 && <>To {names.slice(0, 3).join(", ")}{names.length > 3 ? ` and ${names.length - 3} more` : ""}. </>}
            Each person gets their own copy, and replies come to you.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            send.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="email-template">Start from</Label>
            <Select value={templateId} onValueChange={pick}>
              <SelectTrigger id="email-template">
                <SelectValue placeholder="Choose a template, or write from scratch" />
              </SelectTrigger>
              <SelectContent>
                {templates?.map((t) => (
                  <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              <Link href="/hiring/templates" className="underline underline-offset-2 hover:text-foreground">Edit templates</Link>
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email-subject">Subject</Label>
            <Input id="email-subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email-body">Message</Label>
            <Textarea id="email-body" value={body} onChange={(e) => setBody(e.target.value)} rows={9} maxLength={10000} required />
            <p className="text-xs text-muted-foreground">
              Fills in per candidate: {PLACEHOLDERS.map(([p]) => p).join(", ")}
            </p>
          </div>

          {first && (subject || body) && (
            <section aria-label="Preview" className="rounded-xl border bg-muted/40 p-4 text-sm">
              <p className="text-xs text-muted-foreground">Preview for {first.name}</p>
              <p className="mt-2 font-semibold">{fillPlaceholders(subject, first, jobTitle, company)}</p>
              <p className="mt-2 whitespace-pre-line">{fillPlaceholders(body, first, jobTitle, company)}</p>
            </section>
          )}

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={!subject.trim() || !body.trim() || send.isPending} data-testid="button-send-email">
              {send.isPending ? <Loader2 className="animate-spin" /> : <Send />}
              Send {candidates.length > 1 ? `to ${candidates.length}` : ""}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
