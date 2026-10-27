import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Loader2, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell } from "@/components/auth-shell";
import { api, errorMessage } from "@/lib/api";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const send = useMutation({
    mutationFn: () => api<{ message: string }>("/api/v1/password/forgot", { method: "POST", body: { email: email.trim() } }),
  });

  if (send.isSuccess) {
    return (
      <AuthShell title="Check your email" description={send.data.message}>
        <MailCheck className="h-10 w-10 text-primary" aria-hidden="true" />
        <p className="mt-4 text-sm text-muted-foreground">
          Nothing arrived? Check your spam folder, or{" "}
          <button type="button" className="font-medium text-primary hover:underline" onClick={() => send.reset()}>
            try a different email
          </button>
          .
        </p>
        <Button asChild variant="outline" className="mt-8 w-full">
          <Link href="/auth">Back to sign in</Link>
        </Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Reset your password" description="Enter the email you signed up with and we'll send you a link to choose a new password.">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          send.mutate();
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="forgot-email">Email</Label>
          <Input id="forgot-email" type="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        {send.isError && <p className="text-sm text-destructive" role="alert">{errorMessage(send.error)}</p>}
        <Button type="submit" size="lg" className="w-full" disabled={send.isPending}>
          {send.isPending && <Loader2 className="animate-spin" />}
          Send reset link
        </Button>
        <p className="text-center text-sm">
          <Link href="/auth" className="font-medium text-primary hover:underline">Back to sign in</Link>
        </p>
      </form>
    </AuthShell>
  );
}
