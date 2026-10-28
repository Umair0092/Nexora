import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { CheckCircle2, Download, Loader2, Minus, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { api, errorMessage, getToken, setToken } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import type { User } from "@/lib/types";
import { CalendarConnection } from "@/components/calendar-connection";
import { useOrganization } from "@/lib/hiring";

const MAX_GOAL = 14;

function Section({ id, title, hint, children }: { id: string; title: string; hint: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="grid gap-6 border-t pt-10 first:border-t-0 first:pt-0 md:grid-cols-[14rem_1fr]">
      <div>
        <h2 id={id} className="text-lg font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
      </div>
      <div className="space-y-5">{children}</div>
    </section>
  );
}

export default function AccountPage() {
  const { user } = useAuth();
  const { data: org } = useOrganization();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [goal, setGoal] = useState(3);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (user) setGoal(user.weeklyGoal ?? 3);
  }, [user]);

  const saveSettings = useMutation({
    mutationFn: (settings: Partial<Pick<User, "remindersEnabled" | "weeklyGoal">>) =>
      api<User>("/api/v1/profile", { method: "PUT", body: { user: settings } }),
    onSuccess: (updated, settings) => {
      queryClient.setQueryData(["/api/v1/me"], updated);
      queryClient.invalidateQueries({ queryKey: ["/api/v1/sessions/stats"] });
      toast({
        title:
          "remindersEnabled" in settings
            ? settings.remindersEnabled ? "Reminders on" : "Reminders off"
            : "Weekly goal saved",
      });
    },
    onError: (error) => toast({ title: "Couldn't save that", description: errorMessage(error), variant: "destructive" }),
  });

  const resend = useMutation({
    mutationFn: () => api<{ message: string }>("/api/v1/email/resend", { method: "POST" }),
    onSuccess: (data) => toast({ title: "Check your inbox", description: data.message }),
    onError: (error) => toast({ title: "Couldn't send the email", description: errorMessage(error), variant: "destructive" }),
  });

  const exportData = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/v1/profile/export", { headers: { Authorization: `Bearer ${getToken()}` } });
      if (!res.ok) throw new Error("We couldn't prepare your download. Try again in a minute.");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `nexora-data-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    },
    onError: (error) => toast({ title: "Download failed", description: errorMessage(error), variant: "destructive" }),
  });

  const deleteAccount = useMutation({
    mutationFn: () => api("/api/v1/profile", { method: "DELETE", body: { password } }),
    onSuccess: () => {
      setToken(null);
      queryClient.clear();
      queryClient.setQueryData(["/api/v1/me"], null);
      toast({ title: "Account deleted", description: "Your interviews, reports and profile have been removed." });
      setLocation("/");
    },
  });

  if (!user) return null;
  const goalChanged = goal !== user.weeklyGoal;

  return (
    <div className="mx-auto max-w-4xl px-4 pb-16 pt-8 sm:px-6 lg:px-8 lg:py-10">
      <h1 className="text-3xl font-bold sm:text-4xl">Account</h1>
      <p className="mt-2 text-muted-foreground">Email, practice reminders and your data.</p>

      <div className="mt-10 space-y-10">
        <Section id="email-heading" title="Email" hint="Used for sign-in, password resets and reminders.">
          <div className="rounded-xl border bg-card p-4 sm:p-5">
            <p className="font-semibold break-all">{user.email}</p>
            {user.emailVerified ? (
              <p className="mt-1 flex items-center gap-1.5 text-sm text-success">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                Confirmed
              </p>
            ) : (
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <p className="text-sm text-warning">Not confirmed yet. Open the link we emailed you.</p>
                <Button variant="outline" size="sm" onClick={() => resend.mutate()} disabled={resend.isPending} data-testid="button-resend-verification">
                  {resend.isPending && <Loader2 className="animate-spin" />}
                  Send a new link
                </Button>
              </div>
            )}
          </div>
        </Section>

        <Section id="practice-heading" title="Practice" hint="A small, steady habit beats cramming before an interview.">
          <div className="rounded-xl border bg-card p-4 sm:p-5">
            <Label htmlFor="weekly-goal" className="text-base font-semibold">Weekly goal</Label>
            <p className="mt-1 text-sm text-muted-foreground">Interviews to finish each week, Monday to Sunday.</p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <div className="flex items-center rounded-lg border">
                <Button variant="ghost" size="icon" aria-label="One fewer" onClick={() => setGoal((g) => Math.max(1, g - 1))} disabled={goal <= 1}>
                  <Minus />
                </Button>
                <Input
                  id="weekly-goal"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={MAX_GOAL}
                  value={goal}
                  onChange={(e) => setGoal(Math.min(MAX_GOAL, Math.max(1, Number(e.target.value) || 1)))}
                  className="h-10 w-16 border-0 text-center font-display text-lg font-semibold tabular-nums shadow-none focus-visible:ring-0"
                />
                <Button variant="ghost" size="icon" aria-label="One more" onClick={() => setGoal((g) => Math.min(MAX_GOAL, g + 1))} disabled={goal >= MAX_GOAL}>
                  <Plus />
                </Button>
              </div>
              <span className="text-sm text-muted-foreground">{goal === 1 ? "interview" : "interviews"} a week</span>
              {goalChanged && (
                <Button size="sm" onClick={() => saveSettings.mutate({ weeklyGoal: goal })} disabled={saveSettings.isPending}>
                  Save goal
                </Button>
              )}
            </div>
          </div>

          <div className="flex items-start justify-between gap-4 rounded-xl border bg-card p-4 sm:p-5">
            <div>
              <Label htmlFor="reminders" className="text-base font-semibold">Email reminders</Label>
              <p id="reminders-hint" className="mt-1 text-sm text-muted-foreground">
                {user.emailVerified
                  ? "One email when you haven't practised for 3 days. Never more often than that."
                  : "Confirm your email first to turn on reminders."}
              </p>
            </div>
            <Switch
              id="reminders"
              aria-describedby="reminders-hint"
              checked={user.remindersEnabled}
              disabled={!user.emailVerified || saveSettings.isPending}
              onCheckedChange={(checked) => saveSettings.mutate({ remindersEnabled: checked })}
              data-testid="switch-reminders"
            />
          </div>
        </Section>

        {org && (
          <Section id="calendar" title="Calendar" hint="For live interviews with candidates.">
            <CalendarConnection />
          </Section>
        )}

        <Section id="data-heading" title="Your data" hint="Take a copy, or remove everything.">
          <div className="rounded-xl border bg-card p-4 sm:p-5">
            <p className="font-semibold">Download my data</p>
            <p className="mt-1 text-sm text-muted-foreground">Your profile and every interview, answer, retry and report, as a JSON file.</p>
            <Button variant="outline" className="mt-4" onClick={() => exportData.mutate()} disabled={exportData.isPending} data-testid="button-export">
              {exportData.isPending ? <Loader2 className="animate-spin" /> : <Download />}
              Download my data
            </Button>
          </div>
          <div className="rounded-xl border border-destructive/40 bg-card p-4 sm:p-5">
            <p className="font-semibold">Delete account</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Permanently removes your account, profile, every interview and report, and any share links. This can't be undone.
            </p>
            <Button variant="destructive" className="mt-4" onClick={() => setConfirmDelete(true)} data-testid="button-delete-account">
              <Trash2 />
              Delete account
            </Button>
          </div>
        </Section>
      </div>

      <AlertDialog
        open={confirmDelete}
        onOpenChange={(o) => {
          setConfirmDelete(o);
          if (!o) {
            setPassword("");
            deleteAccount.reset();
          }
        }}
      >
        <AlertDialogContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              deleteAccount.mutate();
            }}
          >
            <AlertDialogHeader>
              <AlertDialogTitle>Delete your account for good?</AlertDialogTitle>
              <AlertDialogDescription>
                Everything goes: your profile, all interviews and reports, retries and share links. Enter your password to confirm.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="mt-4 space-y-2">
              <Label htmlFor="delete-password">Password</Label>
              <Input id="delete-password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
              {deleteAccount.isError && <p className="text-sm text-destructive" role="alert">{errorMessage(deleteAccount.error)}</p>}
            </div>
            <AlertDialogFooter className="mt-6">
              <AlertDialogCancel type="button">Keep my account</AlertDialogCancel>
              <Button type="submit" variant="destructive" disabled={!password || deleteAccount.isPending} data-testid="button-confirm-delete">
                {deleteAccount.isPending && <Loader2 className="animate-spin" />}
                Delete everything
              </Button>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
