import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuthShell } from "@/components/auth-shell";
import { useAuth } from "@/hooks/useAuth";
import { api, errorMessage } from "@/lib/api";
import type { User } from "@/lib/types";

// Google sends people back to /auth/google#code=...&next=...; trade the code for a session.
export default function GoogleCallback() {
  const { signedIn } = useAuth();
  const [, setLocation] = useLocation();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const code = params.get("code");
    const next = params.get("next") ?? "/";
    window.history.replaceState(null, "", "/auth/google");
    if (!code) {
      setError("The sign-in link is incomplete.");
      return;
    }
    api<{ token: string; user: User }>("/api/v1/auth/google/exchange", { method: "POST", body: { code } })
      .then((data) => {
        signedIn(data);
        setLocation(next.startsWith("/") && !next.startsWith("//") ? next : "/", { replace: true });
      })
      .catch((e) => setError(errorMessage(e)));
    // Runs once: the code can only be used for a moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return error ? (
    <AuthShell title="Google sign-in didn't finish" description={error}>
      <Button asChild variant="outline">
        <Link href="/auth">Back to sign in</Link>
      </Button>
    </AuthShell>
  ) : (
    <AuthShell title="Signing you in">
      <Loader2 className="h-8 w-8 animate-spin text-primary" aria-label="Signing in" />
    </AuthShell>
  );
}
