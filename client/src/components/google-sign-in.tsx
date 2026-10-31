import { useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { api, errorMessage } from "@/lib/api";
import type { AccountType } from "@/lib/types";

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path fill="#4285F4" d="M22.6 12.2c0-.8-.1-1.5-.2-2.2H12v4.2h6a5.1 5.1 0 0 1-2.2 3.4v2.8h3.6c2-1.9 3.2-4.7 3.2-8.2z" />
      <path fill="#34A853" d="M12 23c3 0 5.5-1 7.4-2.7l-3.6-2.8c-1 .7-2.3 1.1-3.8 1.1-2.9 0-5.4-2-6.3-4.6H2v2.9A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.7 14a6.6 6.6 0 0 1 0-4.2V7H2a11 11 0 0 0 0 9.9z" />
      <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2 7l3.7 2.9C6.6 7.3 9.1 5.4 12 5.4z" />
    </svg>
  );
}

/** "Continue with Google", shown only when the server has Google sign-in set up. A new account gets `accountType`. */
export function GoogleSignIn({ next, accountType = "candidate" }: { next?: string | null; accountType?: AccountType }) {
  const { toast } = useToast();
  const { data } = useQuery<{ google: boolean }>({ queryKey: ["/api/v1/auth/providers"], staleTime: Infinity });

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("error") === "google") {
      toast({ title: "Google sign-in didn't finish", description: "Try again, or use your email and password.", variant: "destructive" });
    }
  }, [toast]);

  const start = useMutation({
    mutationFn: () => api<{ url: string }>("/api/v1/auth/google", { method: "POST", body: { next: next ?? "/", accountType } }),
    onSuccess: ({ url }) => window.location.assign(url),
    onError: (error) => toast({ title: "Couldn't reach Google", description: errorMessage(error), variant: "destructive" }),
  });

  if (!data?.google) return null;
  return (
    <div className="mt-8">
      <Button type="button" variant="outline" size="lg" className="w-full" onClick={() => start.mutate()} disabled={start.isPending} data-testid="button-google-sign-in">
        {start.isPending ? <Loader2 className="animate-spin" /> : <GoogleMark />}
        Continue with Google
      </Button>
      <p className="mt-6 flex items-center gap-3 text-xs text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border">
        or with email
      </p>
    </div>
  );
}
