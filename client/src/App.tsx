import { Switch, Route, Redirect, Link, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth } from "@/hooks/useAuth";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { BrandMark } from "@/components/brand";
import AuthPage from "@/pages/auth";

import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";
import Dashboard from "@/pages/dashboard";
import { useOrganization } from "@/lib/hiring";
import InterviewSetup from "@/pages/interview-setup";
import InterviewSession from "@/pages/interview-session";
import PerformanceReport from "@/pages/performance-report";
import SessionHistory from "@/pages/session-history";
import ProfilePage from "@/pages/profile";
import AccountPage from "@/pages/account";
import SharedReport from "@/pages/shared-report";
import ForgotPassword from "@/pages/forgot-password";
import ResetPassword from "@/pages/reset-password";
import VerifyEmail from "@/pages/verify-email";
import Unsubscribe from "@/pages/unsubscribe";
import ApplyPage from "@/pages/apply";
import JoinPage from "@/pages/join";
import HiringHome from "@/pages/hiring/index";
import HiringTeam from "@/pages/hiring/team";
import JobForm from "@/pages/hiring/job-form";
import JobPage from "@/pages/hiring/job";
import MeetingPage from "@/pages/hiring/meeting";
import GoogleCallback from "@/pages/google-callback";
import AnalyticsPage from "@/pages/hiring/analytics";
import IntegrationsPage from "@/pages/hiring/integrations";
import BillingPage from "@/pages/hiring/billing";
import CandidatePage from "@/pages/hiring/candidate";
import ComparePage from "@/pages/hiring/compare";
import TemplatesPage from "@/pages/hiring/templates";

function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const sidebarStyle = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={sidebarStyle as React.CSSProperties}>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        Skip to content
      </a>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-40 flex h-14 print:hidden items-center justify-between gap-4 border-b bg-background/85 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/70 sm:px-4">
            <div className="flex items-center gap-2">
              <SidebarTrigger data-testid="button-sidebar-toggle" aria-label="Toggle navigation" />
              <Link href="/" className="md:hidden" aria-label="Nexora home">
                <BrandMark className="h-7 w-7" />
              </Link>
            </div>
            <ThemeToggle />
          </header>
          <main id="main" className="flex-1 bg-background">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

const matchRoute = (pattern: string, path: string) =>
  new RegExp(`^${pattern.replace(/:[^/]+/g, "[^/]+")}/?$`).test(path);

// Pages reached from emails and share links work whether or not you're signed in.
const PUBLIC_ROUTES: [string, () => JSX.Element | null][] = [
  ["/shared/:token", SharedReport],
  ["/reset-password", ResetPassword],
  ["/verify-email", VerifyEmail],
  ["/unsubscribe", Unsubscribe],
  ["/apply/:token", ApplyPage],
  ["/join", JoinPage],
  ["/auth/google", GoogleCallback],
];

// After signing in, go back to where a link sent you (/auth?next=/join?token=...).
function AfterSignIn() {
  const next = new URLSearchParams(window.location.search).get("next");
  const safe = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
  return <Redirect to={safe} />;
}

// People on a hiring team start on Hiring; everyone else on their practice overview.
function Home() {
  const { data: org, isLoading } = useOrganization();
  if (isLoading) return null;
  return org ? <Redirect to="/hiring" replace /> : <Dashboard />;
}

function Router() {
  const { isAuthenticated, isLoading } = useAuth();
  const [location] = useLocation();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background" role="status">
        <BrandMark className="h-10 w-10 animate-pulse" />
        <span className="sr-only">Loading</span>
      </div>
    );
  }

  const publicRoute = PUBLIC_ROUTES.find(([path]) => matchRoute(path, location));
  if (publicRoute) {
    return (
      <Switch>
        {PUBLIC_ROUTES.map(([path, Page]) => (
          <Route key={path} path={path} component={Page} />
        ))}
      </Switch>
    );
  }

  if (!isAuthenticated) {
    return (
      <Switch>
        <Route path="/" component={Landing} />
        <Route path="/auth" component={AuthPage} />
        <Route path="/forgot-password" component={ForgotPassword} />
        {/* Deep links to app pages land on sign-in rather than silently on the landing page. */}
        <Route>
          <Redirect to="/auth" />
        </Route>
      </Switch>
    );
  }

  return (
    <AuthenticatedLayout>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/auth" component={AfterSignIn} />
        <Route path="/interview/setup" component={InterviewSetup} />
        <Route path="/interview/session/:id" component={InterviewSession} />
        <Route path="/report/:id" component={PerformanceReport} />
        <Route path="/history" component={SessionHistory} />
        <Route path="/profile" component={ProfilePage} />
        <Route path="/account" component={AccountPage} />
        <Route path="/hiring" component={HiringHome} />
        <Route path="/hiring/team" component={HiringTeam} />
        <Route path="/hiring/jobs/new" component={JobForm} />
        <Route path="/hiring/jobs/:id/edit" component={JobForm} />
        <Route path="/hiring/jobs/:id/compare" component={ComparePage} />
        <Route path="/hiring/jobs/:id" component={JobPage} />
        <Route path="/hiring/templates" component={TemplatesPage} />
        <Route path="/hiring/candidates/:id" component={CandidatePage} />
        <Route path="/hiring/meetings/:id" component={MeetingPage} />
        <Route path="/hiring/analytics" component={AnalyticsPage} />
        <Route path="/hiring/integrations" component={IntegrationsPage} />
        <Route path="/hiring/billing" component={BillingPage} />
        <Route path="/forgot-password">
          <Redirect to="/account" />
        </Route>
        <Route component={NotFound} />
      </Switch>
    </AuthenticatedLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
