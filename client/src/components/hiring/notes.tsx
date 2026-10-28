import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { api, errorMessage } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { useOrganization, type CandidateDetail, type Note } from "@/lib/hiring";
import { cn } from "@/lib/utils";

const formatDate = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

// The "@word" being typed just before the caret, if any.
function mentionQuery(text: string, caret: number): { start: number; query: string } | null {
  const match = /(^|\s)@([^\s@]*)$/.exec(text.slice(0, caret));
  return match ? { start: caret - match[2].length - 1, query: match[2].toLowerCase() } : null;
}

// Highlights "@Full Name" for current teammates.
function NoteBody({ body, names }: { body: string; names: string[] }) {
  if (names.length === 0) return <>{body}</>;
  const escaped = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).sort((a, b) => b.length - a.length);
  const parts = body.split(new RegExp(`(@(?:${escaped.join("|")}))`, "g"));
  return <>{parts.map((p, i) => (i % 2 === 1 ? <strong key={i} className="font-semibold text-primary">{p}</strong> : p))}</>;
}

// Team notes on a candidate. Typing @ suggests teammates, who get an email.
export function Notes({ candidate }: { candidate: CandidateDetail }) {
  const { toast } = useToast();
  const { data: org } = useOrganization();
  const { user } = useAuth();
  const [body, setBody] = useState("");
  const [mention, setMention] = useState<{ start: number; query: string } | null>(null);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLTextAreaElement>(null);
  const key = ["/api/v1/candidates", String(candidate.id)];

  const members = org?.members ?? [];
  const names = members.map((m) => m.name);
  const suggestions = mention
    ? members.filter((m) => m.email !== user?.email && m.name.toLowerCase().includes(mention.query)).slice(0, 5)
    : [];

  const setNotes = (notes: Note[]) =>
    queryClient.setQueryData<CandidateDetail>(key, (old) => old && { ...old, notes, noteCount: notes.length });

  const add = useMutation({
    mutationFn: () => api<Note[]>(`/api/v1/candidates/${candidate.id}/notes`, { method: "POST", body: { body } }),
    onSuccess: (notes) => {
      setNotes(notes);
      setBody("");
      queryClient.invalidateQueries({ queryKey: ["/api/v1/jobs", String(candidate.job.id)] });
    },
    onError: (error) => toast({ title: "Couldn't add the note", description: errorMessage(error), variant: "destructive" }),
  });
  const remove = useMutation({
    mutationFn: (noteId: number) => api<Note[]>(`/api/v1/candidates/${candidate.id}/notes/${noteId}`, { method: "DELETE" }),
    onSuccess: setNotes,
    onError: (error) => toast({ title: "Couldn't delete the note", description: errorMessage(error), variant: "destructive" }),
  });

  const insert = (name: string) => {
    if (!mention) return;
    const caret = box.current?.selectionStart ?? body.length;
    const next = `${body.slice(0, mention.start)}@${name} ${body.slice(caret)}`;
    setBody(next);
    setMention(null);
    const pos = mention.start + name.length + 2;
    requestAnimationFrame(() => {
      box.current?.focus();
      box.current?.setSelectionRange(pos, pos);
    });
  };

  return (
    <section aria-labelledby="notes-heading" className="rounded-2xl border bg-card p-5">
      <h2 id="notes-heading" className="text-lg font-semibold">Notes</h2>
      <p className="text-sm text-muted-foreground">Visible to your team. Type @ to mention a teammate; they'll get an email.</p>

      {candidate.notes.length > 0 && (
        <ol className="mt-4 space-y-4 text-sm">
          {candidate.notes.map((n) => (
            <li key={n.id} className="group">
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-medium">
                  {n.by} <time className="font-normal text-muted-foreground" dateTime={n.at}>{formatDate(n.at)}</time>
                </p>
                {n.mine && (
                  <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Delete note" onClick={() => remove.mutate(n.id)} disabled={remove.isPending}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
              <p className="mt-0.5 whitespace-pre-line"><NoteBody body={n.body} names={names} /></p>
            </li>
          ))}
        </ol>
      )}

      <form
        className="relative mt-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (body.trim()) add.mutate();
        }}
      >
        <label htmlFor="note-body" className="sr-only">Add a note</label>
        <Textarea
          id="note-body"
          ref={box}
          value={body}
          rows={3}
          maxLength={5000}
          placeholder="Add a note"
          role="combobox"
          aria-expanded={suggestions.length > 0}
          aria-controls="mention-list"
          aria-autocomplete="list"
          aria-activedescendant={suggestions.length > 0 ? `mention-${suggestions[active]?.userId}` : undefined}
          onChange={(e) => {
            setBody(e.target.value);
            setMention(mentionQuery(e.target.value, e.target.selectionStart));
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (suggestions.length > 0) {
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => (a + (e.key === "ArrowDown" ? 1 : suggestions.length - 1)) % suggestions.length);
              } else if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault();
                insert(suggestions[active].name);
              } else if (e.key === "Escape") {
                setMention(null);
              }
            } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && body.trim()) {
              add.mutate();
            }
          }}
          onBlur={() => setTimeout(() => setMention(null), 150)}
        />
        {suggestions.length > 0 && (
          <ul id="mention-list" role="listbox" className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-xl border bg-popover p-1 shadow-lg">
            {suggestions.map((m, i) => (
              <li
                key={m.userId}
                id={`mention-${m.userId}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => {
                  e.preventDefault();
                  insert(m.name);
                }}
                className={cn("cursor-pointer rounded-lg px-3 py-2 text-sm", i === active && "bg-accent text-accent-foreground")}
              >
                {m.name}
                <span className="ml-2 text-xs text-muted-foreground">{m.email}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-2 flex justify-end">
          <Button type="submit" size="sm" disabled={!body.trim() || add.isPending} data-testid="button-add-note">
            {add.isPending && <Loader2 className="animate-spin" />}
            Add note
          </Button>
        </div>
      </form>
    </section>
  );
}
