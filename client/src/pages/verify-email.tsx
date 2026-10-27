import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuthShell, tokenFromUrl } from "@/components/auth-shell";
import { useAuth } from "@/hooks/useAuth";
import { api, errorMessage } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import type { User } from "@/lib/types";

export default function VerifyEmail() {
  const { isAuthenticated } = useAuth();
  const [token] = useState(tokenFromUrl);
  const started = useRef(false);
  const verify = useMutation({
    mutationFn: () => api<{ user: User }>("/api/v1/email/verify", { method: "POST", body: { token } }),
    onSuccess: ({ user }) => {
      if (isAuthenticated) queryClient.setQueryData(["/api/v1/me"], user);
    },
  });

  useEffect(() => {
    if (token && !started.current) {
      started.current = true;
      verify.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const next = (
    <Button asChild className="w-full">
      <Link href={isAuthenticated ? "/dashboard" : "/auth"}>{isAuthenticated ? "Go to your overview" : "Sign in"}</Link>
    </Button>
  );

  if (verify.isSuccess) {
    return (
      <AuthShell title="Email confirmed" description="You'll now get password reset emails, and practice reminders if you turn them on.">
        <CheckCircle2 className="mb-6 h-10 w-10 text-success" aria-hidden="true" />
        {next}
      </AuthShell>
    );
  }
  if (verify.isError || !token) {
    return (
      <AuthShell
        title="We couldn't confirm your email"
        description={token ? errorMessage(verify.error) : "This link is incomplete. Open it from your email again."}
      >
        {isAuthenticated ? (
          <Button asChild className="w-full">
            <Link href="/account">Send a new link from your account</Link>
          </Button>
        ) : next}
      </AuthShell>
    );
  }
  return (
    <AuthShell title="Confirming your email…">
      <Loader2 className="h-8 w-8 animate-spin text-primary" aria-label="Confirming" />
    </AuthShell>
  );
}
