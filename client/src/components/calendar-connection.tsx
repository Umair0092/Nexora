import { useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CalendarCheck2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CalendarStatus } from "@/components/hiring/schedule-dialog";
import { useToast } from "@/hooks/use-toast";
import { api, errorMessage } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";

/** Connect or disconnect Google Calendar, so interviews can get Meet links. */
export function CalendarConnection() {
  const { toast } = useToast();
  const { data } = useQuery<CalendarStatus>({ queryKey: ["/api/v1/calendar"] });

  // Google sends people back here with ?calendar=connected or ?calendar=failed.
  useEffect(() => {
    const result = new URLSearchParams(window.location.search).get("calendar");
    if (!result) return;
    if (result === "connected") toast({ title: "Google Calendar connected", description: "New interviews can get a Google Meet link." });
    else toast({ title: "Google Calendar wasn't connected", description: "Try again, and allow access to your calendar when Google asks.", variant: "destructive" });
    window.history.replaceState(null, "", window.location.pathname + "#calendar");
  }, [toast]);

  const connect = useMutation({
    mutationFn: () => api<{ url: string }>("/api/v1/calendar/google", { method: "POST" }),
    onSuccess: ({ url }) => window.location.assign(url),
    onError: (error) => toast({ title: "Couldn't start connecting", description: errorMessage(error), variant: "destructive" }),
  });
  const disconnect = useMutation({
    mutationFn: () => api("/api/v1/calendar", { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/calendar"] });
      toast({ title: "Google Calendar disconnected", description: "Interviews already booked stay in your calendar." });
    },
    onError: (error) => toast({ title: "Couldn't disconnect", description: errorMessage(error), variant: "destructive" }),
  });

  if (!data) return null;
  if (!data.available) {
    return (
      <p className="text-sm text-muted-foreground">
        Google Calendar isn't set up on this server. You can still schedule interviews with any video link, and everyone gets a calendar invite by email.
      </p>
    );
  }
  return data.connected ? (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
      <p className="flex items-center gap-2 text-sm">
        <CalendarCheck2 className="h-4 w-4 text-success" aria-hidden="true" />
        Connected as <strong className="font-semibold">{data.email}</strong>
      </p>
      <Button variant="outline" size="sm" onClick={() => disconnect.mutate()} disabled={disconnect.isPending}>
        {disconnect.isPending && <Loader2 className="animate-spin" />}
        Disconnect
      </Button>
    </div>
  ) : (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Connect your Google account to create interviews with a Google Meet link. They go in your calendar and Google sends the invitations. Nexora only adds and changes the interviews it creates.
      </p>
      <Button onClick={() => connect.mutate()} disabled={connect.isPending} data-testid="button-connect-calendar">
        {connect.isPending && <Loader2 className="animate-spin" />}
        Connect Google Calendar
      </Button>
    </div>
  );
}
