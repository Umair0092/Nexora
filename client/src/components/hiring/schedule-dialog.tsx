import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { api, errorMessage } from "@/lib/api";
import { MEETING_DURATIONS, meetingTime, useOrganization, type Meeting } from "@/lib/hiring";

export interface CalendarStatus {
  available: boolean;
  connected: boolean;
  email: string | null;
}

const pad = (n: number) => String(n).padStart(2, "0");
const dateValue = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const timeValue = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

// Tomorrow at 10:00, the usual first suggestion.
function defaultStart() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  return d;
}

/**
 * Books (or changes) a live interview. With a connected Google Calendar it can
 * create the Meet link; otherwise the recruiter pastes any video link.
 */
export function ScheduleDialog({
  candidate,
  meeting,
  open,
  onOpenChange,
  onSaved,
}: {
  candidate: { id: number; name: string; jobTitle: string };
  meeting?: Meeting;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (m: Meeting) => void;
}) {
  const { toast } = useToast();
  const { user } = useAuth();
  const { data: org } = useOrganization();
  const { data: calendar } = useQuery<CalendarStatus>({ queryKey: ["/api/v1/calendar"], enabled: open });
  const canCreateMeet = !!calendar?.available && !!calendar.connected;

  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [duration, setDuration] = useState("45");
  const [panel, setPanel] = useState<Set<number>>(new Set());
  const [where, setWhere] = useState<"meet" | "link">("link");
  const [url, setUrl] = useState("");
  const [agenda, setAgenda] = useState("");

  // Fill the form each time it opens.
  useEffect(() => {
    if (!open) return;
    const start = meeting ? new Date(meeting.startsAt) : defaultStart();
    setTitle(meeting?.title ?? "");
    setDate(dateValue(start));
    setTime(timeValue(start));
    setDuration(String(meeting?.durationMinutes ?? 45));
    const me = org?.members.find((m) => m.email === user?.email)?.userId;
    setPanel(new Set(meeting ? meeting.panel.map((p) => p.id) : me ? [me] : []));
    setUrl(meeting?.meetingUrl ?? "");
    setAgenda(meeting?.agenda ?? "");
  }, [open, meeting, org, user]);
  useEffect(() => {
    if (open && !meeting) setWhere(canCreateMeet ? "meet" : "link");
  }, [open, meeting, canCreateMeet]);

  const save = useMutation({
    mutationFn: () => {
      const body = {
        title,
        startsAt: new Date(`${date}T${time}`).toISOString(),
        durationMinutes: Number(duration),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        panelistIds: Array.from(panel),
        agenda,
        ...(meeting?.inGoogleCalendar ? {} : where === "meet" && !meeting ? { createMeet: true } : { meetingUrl: url }),
      };
      return meeting
        ? api<Meeting>(`/api/v1/meetings/${meeting.id}`, { method: "PATCH", body })
        : api<Meeting>(`/api/v1/candidates/${candidate.id}/meetings`, { method: "POST", body });
    },
    onSuccess: (m) => {
      toast({
        title: meeting ? "Interview updated" : "Interview scheduled",
        description: `${meetingTime(m)}. ${m.inGoogleCalendar ? "Google Calendar is sending the invitations." : "Everyone gets a calendar invite by email."}`,
      });
      onSaved(m);
      onOpenChange(false);
    },
    onError: (error) => toast({ title: meeting ? "Couldn't update the interview" : "Couldn't schedule the interview", description: errorMessage(error), variant: "destructive" }),
  });

  const toggle = (id: number) =>
    setPanel((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const needsUrl = !meeting?.inGoogleCalendar && (where === "link" || !!meeting);
  const ready = date && time && panel.size > 0 && (!needsUrl || /^https:\/\/\S+$/.test(url));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{meeting ? "Change the interview" : `Schedule an interview with ${candidate.name}`}</DialogTitle>
          <DialogDescription>
            {meeting ? "Everyone on the invite gets the update." : `A live interview for ${candidate.jobTitle}. The candidate and the panel get a calendar invite.`}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="meeting-title">Title</Label>
            <Input id="meeting-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder={`Interview: ${candidate.name}, ${candidate.jobTitle}`} />
          </div>
          <div className="grid grid-cols-[1fr_auto_auto] gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="meeting-date">Date</Label>
              <Input id="meeting-date" type="date" value={date} min={dateValue(new Date())} onChange={(e) => setDate(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="meeting-time">Start</Label>
              <Input id="meeting-time" type="time" step={300} value={time} onChange={(e) => setTime(e.target.value)} required className="w-28" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="meeting-duration">Length</Label>
              <Select value={duration} onValueChange={setDuration}>
                <SelectTrigger id="meeting-duration" className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MEETING_DURATIONS.map((d) => (
                    <SelectItem key={d} value={String(d)}>{d} min</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="-mt-3 text-xs text-muted-foreground">In your time zone ({Intl.DateTimeFormat().resolvedOptions().timeZone}). Calendars show it in each person's own.</p>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Panel</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {org?.members.map((m) => (
                <label key={m.userId} className="flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm has-[:checked]:border-primary/60 has-[:checked]:bg-accent/40">
                  <Checkbox checked={panel.has(m.userId)} onCheckedChange={() => toggle(m.userId)} />
                  <span className="truncate">{m.name}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {meeting?.inGoogleCalendar ? (
            <p className="flex items-center gap-2 rounded-lg bg-muted p-3 text-sm">
              <Video className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              The Google Meet link stays the same.
            </p>
          ) : (
            <fieldset className="space-y-3">
              <legend className="text-sm font-medium">Where</legend>
              {!meeting && (
                <RadioGroup value={where} onValueChange={(v) => setWhere(v as "meet" | "link")} className="gap-2">
                  <label className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm ${canCreateMeet ? "cursor-pointer" : "opacity-60"}`}>
                    <RadioGroupItem value="meet" disabled={!canCreateMeet} className="mt-0.5" />
                    <span>
                      Create a Google Meet link
                      <span className="block text-xs text-muted-foreground">
                        {canCreateMeet ? (
                          `Added to ${calendar?.email}'s calendar. Google sends the invitations.`
                        ) : calendar?.available ? (
                          <>
                            <Link href="/account#calendar" className="text-primary underline-offset-2 hover:underline">Connect Google Calendar</Link> on your Account page first.
                          </>
                        ) : (
                          "Not set up on this server yet."
                        )}
                      </span>
                    </span>
                  </label>
                  <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm">
                    <RadioGroupItem value="link" className="mt-0.5" />
                    <span>
                      Use a link I already have
                      <span className="block text-xs text-muted-foreground">Google Meet, Zoom, Teams or any https link.</span>
                    </span>
                  </label>
                </RadioGroup>
              )}
              {needsUrl && (
                <div className="space-y-1.5">
                  <Label htmlFor="meeting-url" className={meeting ? undefined : "sr-only"}>Meeting link</Label>
                  <Input id="meeting-url" type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://meet.google.com/abc-defg-hij" required />
                </div>
              )}
            </fieldset>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="meeting-agenda">Agenda for the invite <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Textarea id="meeting-agenda" value={agenda} onChange={(e) => setAgenda(e.target.value)} maxLength={2000} rows={3} placeholder="30 minutes on system design, then time for their questions." />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={!ready || save.isPending} data-testid="button-save-meeting">
              {save.isPending && <Loader2 className="animate-spin" />}
              {meeting ? "Save and send updates" : "Schedule and send invites"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
