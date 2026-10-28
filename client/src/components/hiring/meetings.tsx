import { useState } from "react";
import { Link } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { Bot, CalendarClock, CalendarPlus, ExternalLink, FileText, Loader2, Video } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { ScheduleDialog } from "@/components/hiring/schedule-dialog";
import { useToast } from "@/hooks/use-toast";
import { api, errorMessage } from "@/lib/api";
import { meetingTime, NOTETAKER_LABELS, PROVIDER_LABELS, type Meeting } from "@/lib/hiring";
import { cn } from "@/lib/utils";

const isPast = (m: Meeting) => new Date(m.endsAt).getTime() < Date.now();

/** A candidate's interviews, with join, change and cancel. */
export function CandidateMeetings({
  candidate,
  meetings,
  onChanged,
  canSchedule,
}: {
  candidate: { id: number; name: string; jobTitle: string };
  meetings: Meeting[];
  onChanged: () => void;
  canSchedule: boolean;
}) {
  const { toast } = useToast();
  const [editing, setEditing] = useState<Meeting | undefined>();
  const [scheduling, setScheduling] = useState(false);
  const [cancelling, setCancelling] = useState<Meeting | null>(null);
  const cancel = useMutation({
    mutationFn: (m: Meeting) => api<Meeting>(`/api/v1/meetings/${m.id}/cancel`, { method: "POST" }),
    onSuccess: () => {
      toast({ title: "Interview cancelled", description: "Everyone on the invite has been told." });
      onChanged();
    },
    onError: (error) => toast({ title: "Couldn't cancel the interview", description: errorMessage(error), variant: "destructive" }),
    onSettled: () => setCancelling(null),
  });

  const live = meetings.filter((m) => m.status === "scheduled" && !isPast(m));
  const earlier = meetings.filter((m) => !live.includes(m));

  return (
    <section aria-labelledby="meetings-heading" className="rounded-2xl border bg-card p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 id="meetings-heading" className="flex items-center gap-2 text-lg font-semibold">
          <CalendarClock className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          Interviews
        </h2>
        {canSchedule && (
          <Button size="sm" variant="outline" onClick={() => setScheduling(true)} data-testid="button-schedule-interview">
            <CalendarPlus />
            Schedule
          </Button>
        )}
      </div>

      {meetings.length === 0 && (
        <p className="mt-2 text-sm text-muted-foreground">
          No live interviews yet. Schedule one and the candidate and your panel get a calendar invite with the video link.
        </p>
      )}

      <ul className="mt-3 space-y-3">
        {live.map((m) => (
          <li key={m.id} className="rounded-xl border p-3.5" data-testid={`meeting-${m.id}`}>
            <MeetingSummary meeting={m} />
            <div className="mt-3 flex flex-wrap gap-2">
              {m.meetingUrl && (
                <Button asChild size="sm">
                  <a href={m.meetingUrl} target="_blank" rel="noreferrer">
                    <Video />
                    Join {PROVIDER_LABELS[m.provider]}
                  </a>
                </Button>
              )}
              <Button asChild size="sm" variant="outline">
                <Link href={`/hiring/meetings/${m.id}`}>{m.minutesStatus === "done" ? "Minutes" : "Notes"}</Link>
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditing(m)}>Change</Button>
              <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => setCancelling(m)}>Cancel interview</Button>
            </div>
          </li>
        ))}
      </ul>
      {earlier.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">Earlier and cancelled ({earlier.length})</summary>
          <ul className="mt-2 space-y-2">
            {earlier.map((m) => (
              <li key={m.id} className={cn("rounded-xl bg-muted/50 p-3 text-sm", m.status === "cancelled" && "text-muted-foreground")}>
                <MeetingSummary meeting={m} compact />
                {m.status === "scheduled" && (
                  <Link href={`/hiring/meetings/${m.id}`} className="mt-1.5 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                    <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                    {m.minutesStatus === "done" ? "Read the minutes" : m.hasTranscript ? "See the transcript" : "Add the recording for minutes"}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}

      <ScheduleDialog candidate={candidate} open={scheduling} onOpenChange={setScheduling} onSaved={onChanged} />
      <ScheduleDialog candidate={candidate} meeting={editing} open={!!editing} onOpenChange={(o) => !o && setEditing(undefined)} onSaved={onChanged} />
      <AlertDialog open={!!cancelling} onOpenChange={(o) => !o && setCancelling(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this interview?</AlertDialogTitle>
            <AlertDialogDescription>
              {cancelling && `${meetingTime(cancelling)}. ${candidate.name} and the panel get a cancellation, and it's removed from their calendars.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={() => cancelling && cancel.mutate(cancelling)} disabled={cancel.isPending}>
              {cancel.isPending && <Loader2 className="animate-spin" />}
              Cancel interview
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function MeetingSummary({ meeting: m, compact }: { meeting: Meeting; compact?: boolean }) {
  return (
    <div>
      <p className={cn("font-medium", m.status === "cancelled" && "line-through")}>{meetingTime(m)}</p>
      <p className="mt-0.5 text-sm text-muted-foreground">
        {m.status === "cancelled" ? "Cancelled" : PROVIDER_LABELS[m.provider]}
        {m.panel.length > 0 && `, with ${m.panel.map((p) => p.name).join(", ")}`}
      </p>
      {!compact && m.agenda && <p className="mt-2 whitespace-pre-line text-sm">{m.agenda}</p>}
      {m.notetakerStatus && m.status === "scheduled" && (
        <p className={cn("mt-2 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium", m.notetakerStatus === "failed" ? "bg-destructive/10 text-destructive" : "bg-accent text-accent-foreground")}>
          <Bot className="h-3.5 w-3.5" aria-hidden="true" />
          {NOTETAKER_LABELS[m.notetakerStatus]}
        </p>
      )}
      {m.minutesSummary && <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{m.minutesSummary}</p>}
    </div>
  );
}

/** The next few interviews across the company, for the hiring home. */
export function UpcomingMeetings({ meetings }: { meetings: Meeting[] }) {
  return (
    <section aria-labelledby="upcoming-heading" className="rounded-2xl border bg-card p-5">
      <h2 id="upcoming-heading" className="text-lg font-semibold">Upcoming interviews</h2>
      {meetings.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">Nothing in the next two weeks. Schedule interviews from a candidate's page.</p>
      ) : (
        <ul className="mt-3 divide-y">
          {meetings.map((m) => (
            <li key={m.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
              <div className="min-w-0 flex-1">
                <Link href={`/hiring/candidates/${m.candidate.id}`} className="block truncate font-medium hover:text-primary">
                  {m.candidate.name}
                </Link>
                <p className="truncate text-sm text-muted-foreground">{meetingTime(m)}</p>
              </div>
              {m.meetingUrl && (
                <Button asChild size="icon" variant="ghost" aria-label={`Join ${PROVIDER_LABELS[m.provider]} with ${m.candidate.name}`}>
                  <a href={m.meetingUrl} target="_blank" rel="noreferrer">
                    <ExternalLink />
                  </a>
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
