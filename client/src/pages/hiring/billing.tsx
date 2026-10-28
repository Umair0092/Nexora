import { useEffect } from "react";
import { Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Check, CreditCard, Loader2, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { api, errorMessage } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

interface PlanInfo { key: string; name: string; price: number | null; open_jobs: number | null; candidates_per_month: number | null; notetaker: boolean; webhooks: boolean; blurb: string }
interface Billing {
  enabled: boolean;
  plan: { key: string; name: string };
  status: string | null;
  periodEnd: string | null;
  usage: { openJobs: number; candidatesThisMonth: number };
  limits: { openJobs: number | null; candidatesPerMonth: number | null };
  plans: PlanInfo[];
  canManage: boolean;
  hasSubscription: boolean;
  contactEmail: string | null;
}

function Meter({ label, used, cap }: { label: string; used: number; cap: number | null }) {
  const share = cap ? Math.min(1, used / cap) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums">
          <span className="font-semibold">{used}</span>
          {cap != null && <span className="text-muted-foreground"> of {cap}</span>}
          {cap == null && <span className="text-muted-foreground">, no limit</span>}
        </span>
      </div>
      {cap != null && (
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted" role="meter" aria-valuemin={0} aria-valuemax={cap} aria-valuenow={used} aria-label={label}>
          <div className={cn("h-full rounded-full", share >= 1 ? "bg-destructive" : share >= 0.8 ? "bg-warning" : "bg-primary")} style={{ width: `${share * 100}%` }} />
        </div>
      )}
    </div>
  );
}

const included = (p: PlanInfo) => [
  [p.open_jobs == null ? "Unlimited open jobs" : `${p.open_jobs} open job`, true],
  [p.candidates_per_month == null ? "Unlimited candidates" : `${p.candidates_per_month} candidates a month`, true],
  ["Screening interviews, AI summaries and scorecards", true],
  ["Live interviews with calendar invites", true],
  ["AI notetaker and interview minutes", p.notetaker],
  ["Webhooks", p.webhooks],
] as const;

export default function BillingPage() {
  const { toast } = useToast();
  const { data, isLoading } = useQuery<Billing>({ queryKey: ["/api/v1/billing"] });

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("checkout") === "done") {
      toast({ title: "Thanks for subscribing", description: "Your Team plan is active as soon as Stripe confirms the payment, usually within seconds." });
      window.history.replaceState(null, "", "/hiring/billing");
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ["/api/v1/billing"] }), 3000);
    }
  }, [toast]);

  const go = (path: string) => () => api<{ url: string }>(path, { method: "POST" });
  const checkout = useMutation({ mutationFn: go("/api/v1/billing/checkout"), onSuccess: ({ url }) => window.location.assign(url), onError: (e) => toast({ title: "Couldn't open Checkout", description: errorMessage(e), variant: "destructive" }) });
  const portal = useMutation({ mutationFn: go("/api/v1/billing/portal"), onSuccess: ({ url }) => window.location.assign(url), onError: (e) => toast({ title: "Couldn't open billing", description: errorMessage(e), variant: "destructive" }) });

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <Link href="/hiring" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Hiring
      </Link>
      <h1 className="mt-3 text-3xl font-bold sm:text-4xl">Plan and billing</h1>

      {isLoading || !data ? (
        <Skeleton className="mt-8 h-64 w-full rounded-2xl" />
      ) : (
        <>
          {!data.enabled && (
            <p className="mt-4 rounded-xl bg-muted p-4 text-sm">
              Billing isn't switched on for this server, so every feature is available without limits. Set the Stripe keys to sell plans.
            </p>
          )}

          <section className="mt-6 grid gap-6 rounded-2xl border bg-card p-5 sm:p-6 md:grid-cols-[1fr_1.2fr]" aria-label="Current plan">
            <div>
              <p className="text-sm text-muted-foreground">Current plan</p>
              <p className="mt-1 font-display text-3xl font-bold">{data.plan.name}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {data.status === "past_due"
                  ? "The last payment didn't go through. Update the card to keep the plan."
                  : data.periodEnd
                    ? `Renews ${new Date(data.periodEnd).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}`
                    : data.plan.key === "free" ? "No card on file." : ""}
              </p>
              {data.canManage && data.hasSubscription && (
                <Button className="mt-4" variant="outline" onClick={() => portal.mutate()} disabled={portal.isPending}>
                  {portal.isPending ? <Loader2 className="animate-spin" /> : <CreditCard />}
                  Manage card and invoices
                </Button>
              )}
            </div>
            <div className="space-y-5">
              <Meter label="Open jobs" used={data.usage.openJobs} cap={data.limits.openJobs} />
              <Meter label="Candidates invited this month" used={data.usage.candidatesThisMonth} cap={data.limits.candidatesPerMonth} />
            </div>
          </section>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {data.plans.map((p) => {
              const current = p.key === data.plan.key;
              return (
                <section key={p.key} aria-label={`${p.name} plan`} className={cn("flex flex-col rounded-2xl border bg-card p-5", current && "border-primary ring-1 ring-primary")}>
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold">{p.name}</h2>
                    {current && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">Your plan</span>}
                  </div>
                  <p className="mt-3">
                    <span className="font-display text-3xl font-bold">{p.price == null ? "Let's talk" : p.price === 0 ? "$0" : `$${p.price}`}</span>
                    {p.price ? <span className="text-sm text-muted-foreground"> a month</span> : null}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">{p.blurb}</p>
                  <ul className="mt-4 flex-1 space-y-2 text-sm">
                    {included(p).map(([text, on]) => (
                      <li key={text} className={cn("flex gap-2", !on && "text-muted-foreground")}>
                        {on ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" /> : <Minus className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
                        <span>{text}{!on && <span className="sr-only"> (not included)</span>}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-5">
                    {p.key === "team" && !current && data.canManage && (
                      <Button className="w-full" onClick={() => checkout.mutate()} disabled={!data.enabled || checkout.isPending} data-testid="button-upgrade">
                        {checkout.isPending && <Loader2 className="animate-spin" />}
                        Upgrade to Team
                      </Button>
                    )}
                    {p.key === "business" && !current && data.contactEmail && (
                      <Button asChild variant="outline" className="w-full">
                        <a href={`mailto:${data.contactEmail}?subject=${encodeURIComponent("Nexora Business plan")}`}>Contact us</a>
                      </Button>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
          {!data.canManage && <p className="mt-4 text-sm text-muted-foreground">Only your company's owner can change the plan.</p>}
          <p className="mt-6 text-xs text-muted-foreground">Payments are handled by Stripe; Nexora never sees card numbers. Prices exclude tax.</p>
        </>
      )}
    </div>
  );
}
