import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuthShell, tokenFromUrl } from "@/components/auth-shell";
import { api, errorMessage } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";

// Reached from the link in a reminder email. Needs a click (not automatic on load)
// so link scanners in mail clients don't unsubscribe people by visiting it.
export default function Unsubscribe() {
  const [token] = useState(tokenFromUrl);
  const unsubscribe = useMutation({
    mutationFn: () => api("/api/v1/reminders/unsubscribe", { method: "POST", body: { token } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/v1/me"] }),
  });

  if (unsubscribe.isSuccess) {
    return (
      <AuthShell title="Reminders turned off" description="You won't get practice reminder emails any more. You can turn them back on from your account page.">
        <Button asChild variant="outline" className="w-full">
          <Link href="/account">Go to your account</Link>
        </Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Turn off practice reminders?" description="We'll stop emailing you reminders to practise. Password and sign-in emails still arrive.">
      {unsubscribe.isError && <p className="mb-4 text-sm text-destructive" role="alert">{errorMessage(unsubscribe.error)}</p>}
      <Button className="w-full" size="lg" onClick={() => unsubscribe.mutate()} disabled={!token || unsubscribe.isPending} data-testid="button-unsubscribe">
        {unsubscribe.isPending && <Loader2 className="animate-spin" />}
        Turn off reminders
      </Button>
    </AuthShell>
  );
}
