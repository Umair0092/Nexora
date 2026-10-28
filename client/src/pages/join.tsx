import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuthShell, tokenFromUrl } from "@/components/auth-shell";
import { useAuth } from "@/hooks/useAuth";
import { api, errorMessage } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import type { Organization } from "@/lib/hiring";

// Accepting an emailed invitation to a company's hiring team.
export default function JoinPage() {
  const token = tokenFromUrl();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const next = encodeURIComponent(`/join?token=${encodeURIComponent(token)}`);

  const { data: invite, error, isLoading } = useQuery<{ company: string; email: string }>({
    queryKey: [`/api/v1/team_invitations/preview?token=${encodeURIComponent(token)}`],
    enabled: !!token,
  });
  const accept = useMutation({
    mutationFn: () => api<Organization>("/api/v1/team_invitations/accept", { method: "POST", body: { token } }),
    onSuccess: (org) => {
      queryClient.setQueryData(["/api/v1/organization"], org);
      setLocation("/hiring");
    },
  });

  if (isLoading) {
    return (
      <AuthShell title="Team invitation">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-label="Loading" />
      </AuthShell>
    );
  }
  if (!invite) {
    return (
      <AuthShell title="This invitation doesn't work" description={token ? errorMessage(error) : "The link is missing its code."}>
        <Button asChild variant="outline">
          <Link href="/">Go to Nexora</Link>
        </Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={`Join ${invite.company}`}
      description={
        <>
          You've been invited to {invite.company}'s hiring team on Nexora as <strong className="text-foreground">{invite.email}</strong>.
        </>
      }
    >
      {!user ? (
        <div className="flex flex-col gap-3">
          <Button asChild size="lg">
            <Link href={`/auth?next=${next}`}>Sign in to join</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href={`/auth?mode=register&next=${next}`}>Create an account</Link>
          </Button>
        </div>
      ) : user.email !== invite.email ? (
        <p className="rounded-xl bg-muted p-4 text-sm">
          You're signed in as {user.email}. Sign out, then open this link again and sign in as {invite.email}.
        </p>
      ) : (
        <>
          {accept.isError && <p className="mb-4 text-sm text-destructive" role="alert">{errorMessage(accept.error)}</p>}
          <Button size="lg" className="w-full" onClick={() => accept.mutate()} disabled={accept.isPending} data-testid="button-accept-invite">
            {accept.isPending && <Loader2 className="animate-spin" />}
            Join {invite.company}
          </Button>
        </>
      )}
    </AuthShell>
  );
}
