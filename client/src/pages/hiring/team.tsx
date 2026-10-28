import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowLeft, Loader2, Mail, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { api, errorMessage } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { useOrganization, type Organization } from "@/lib/hiring";

export default function HiringTeam() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: org, isLoading } = useOrganization();
  const [email, setEmail] = useState("");

  const update = (org: Organization) => queryClient.setQueryData(["/api/v1/organization"], org);
  const onError = (error: unknown) => toast({ title: "That didn't work", description: errorMessage(error), variant: "destructive" });

  const invite = useMutation({
    mutationFn: () => api<Organization>("/api/v1/organization/invitations", { method: "POST", body: { email } }),
    onSuccess: (org) => {
      update(org);
      toast({ title: "Invitation sent", description: `${email} will get a link to join.` });
      setEmail("");
    },
    onError,
  });
  const cancel = useMutation({
    mutationFn: (id: number) => api<Organization>(`/api/v1/organization/invitations/${id}`, { method: "DELETE" }),
    onSuccess: update,
    onError,
  });
  const remove = useMutation({
    mutationFn: (id: number) => api<Organization>(`/api/v1/organization/members/${id}`, { method: "DELETE" }),
    onSuccess: update,
    onError,
  });

  if (isLoading || !org) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <Skeleton className="h-10 w-48" />
      </div>
    );
  }
  const isOwner = org.myRole === "owner";

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:py-10">
      <Link href="/hiring" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Hiring
      </Link>
      <h1 className="mt-3 text-3xl font-bold sm:text-4xl">Team</h1>
      <p className="mt-2 text-muted-foreground">Everyone here can see {org.name}'s jobs, candidates and scorecards.</p>

      <ul className="mt-8 divide-y rounded-2xl border bg-card">
        {org.members.map((m) => (
          <li key={m.id} className="flex items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="truncate font-semibold">{m.name}{m.userId === user?.id ? " (you)" : ""}</p>
              <p className="truncate text-sm text-muted-foreground">{m.email}</p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <span className="text-sm text-muted-foreground">{m.role === "owner" ? "Owner" : "Recruiter"}</span>
              {isOwner && m.userId !== user?.id && (
                <Button variant="ghost" size="icon" aria-label={`Remove ${m.name}`} onClick={() => remove.mutate(m.id)} disabled={remove.isPending}>
                  <Trash2 />
                </Button>
              )}
            </div>
          </li>
        ))}
        {org.invitations.map((i) => (
          <li key={`i-${i.id}`} className="flex items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="truncate font-semibold">{i.email}</p>
              <p className="text-sm text-muted-foreground">Invited, hasn't joined yet</p>
            </div>
            {isOwner && (
              <Button variant="ghost" size="sm" onClick={() => cancel.mutate(i.id)} disabled={cancel.isPending}>
                Cancel invite
              </Button>
            )}
          </li>
        ))}
      </ul>

      {isOwner ? (
        <form
          className="mt-8 rounded-2xl border bg-card p-5"
          onSubmit={(e) => {
            e.preventDefault();
            invite.mutate();
          }}
        >
          <Label htmlFor="invite-email" className="text-base font-semibold">Invite a teammate</Label>
          <p className="mt-1 text-sm text-muted-foreground">They'll get an email with a link that works for 7 days.</p>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <Input id="invite-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" />
            <Button type="submit" disabled={!email || invite.isPending} className="shrink-0" data-testid="button-invite-teammate">
              {invite.isPending ? <Loader2 className="animate-spin" /> : <Mail />}
              Send invite
            </Button>
          </div>
        </form>
      ) : (
        <p className="mt-6 text-sm text-muted-foreground">Ask the owner to invite more teammates.</p>
      )}
    </div>
  );
}
