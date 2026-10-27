import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell, tokenFromUrl } from "@/components/auth-shell";
import { useAuth, type AuthResponse } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { api, errorMessage } from "@/lib/api";

const MIN_PASSWORD = 8;

export default function ResetPassword() {
  const [, setLocation] = useLocation();
  const { signedIn } = useAuth();
  const { toast } = useToast();
  const [token] = useState(tokenFromUrl);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const reset = useMutation({
    mutationFn: () => api<AuthResponse>("/api/v1/password/reset", { method: "POST", body: { token, password } }),
    onSuccess: (data) => {
      signedIn(data);
      toast({ title: "Password changed", description: "You're signed in with your new password." });
      setLocation("/dashboard");
    },
  });

  if (!token) {
    return (
      <AuthShell title="This link is incomplete" description="Open the link from your email again, or request a new one.">
        <Button asChild className="w-full">
          <Link href="/forgot-password">Request a new link</Link>
        </Button>
      </AuthShell>
    );
  }

  const mismatch = confirm.length > 0 && confirm !== password;

  return (
    <AuthShell title="Choose a new password" description={`At least ${MIN_PASSWORD} characters. You'll be signed in straight after.`}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!mismatch) reset.mutate();
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="new-password">New password</Label>
          <Input id="new-password" type="password" autoComplete="new-password" minLength={MIN_PASSWORD} required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm-password">Repeat it</Label>
          <Input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            aria-invalid={mismatch}
            aria-describedby={mismatch ? "mismatch" : undefined}
            onChange={(e) => setConfirm(e.target.value)}
          />
          {mismatch && <p id="mismatch" className="text-sm text-destructive">The passwords don't match.</p>}
        </div>
        {reset.isError && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm" role="alert">
            {errorMessage(reset.error)}{" "}
            <Link href="/forgot-password" className="font-medium text-primary hover:underline">Request a new link</Link>
          </div>
        )}
        <Button type="submit" size="lg" className="w-full" disabled={reset.isPending || mismatch}>
          {reset.isPending && <Loader2 className="animate-spin" />}
          Change password
        </Button>
      </form>
    </AuthShell>
  );
}
