import { useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { GoogleSignIn } from "@/components/google-sign-in";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Briefcase, Loader2, Mic } from "lucide-react";
import { OptionCard, OptionGroup } from "@/components/option-card";
import type { AccountType } from "@/lib/types";
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";

const MIN_PASSWORD = 8;

// ?as=employer, or a link into hiring (an invitation, "Set up your hiring team"), starts on the hiring side.
function initialAccountType(params: URLSearchParams): AccountType {
  const next = params.get("next") ?? "";
  return params.get("as") === "employer" || next.startsWith("/hiring") || next.startsWith("/join") ? "employer" : "candidate";
}

function PracticeStory() {
  return (
    <figure className="max-w-lg">
      <div className="mb-6 flex items-center gap-3 text-sm text-[hsl(216_33%_95%/.7)]">
        <span className="tally-light" aria-hidden="true" />
        Question 3 of 10
      </div>
      <blockquote className="cue-card text-4xl xl:text-5xl">
        "You mentioned migrating the payments service. What would you do differently if you did it again?"
      </blockquote>
      <figcaption className="mt-6 max-w-sm text-[hsl(216_33%_95%/.7)]">
        Nexora reads your CV and asks the follow-up a real interviewer would. Answer out loud, then see what landed.
      </figcaption>
    </figure>
  );
}

function HiringStory() {
  return (
    <figure className="max-w-lg">
      <div className="mb-6 flex items-center gap-3 text-sm text-[hsl(216_33%_95%/.7)]">
        <span className="h-2 w-2 rounded-full bg-[hsl(174_61%_45%)]" aria-hidden="true" />
        Interview minutes, Backend Engineer
      </div>
      <blockquote className="cue-card text-4xl xl:text-5xl">
        "Strong on API design and on-call experience. Follow-up: Daniel sends the system design task by Friday."
      </blockquote>
      <figcaption className="mt-6 max-w-sm text-[hsl(216_33%_95%/.7)]">
        Post a job, screen every candidate with the same spoken questions, and let the notetaker write up your live interviews.
      </figcaption>
    </figure>
  );
}

export default function AuthPage() {
  const { loginMutation, registerMutation } = useAuth();
  const params = new URLSearchParams(window.location.search);
  const [activeTab, setActiveTab] = useState(() => (params.get("mode") === "register" ? "register" : "login"));
  const [accountType, setAccountType] = useState<AccountType>(() => initialAccountType(params));
  const hiring = accountType === "employer";

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate({ email: loginEmail.trim(), password: loginPassword });
  };

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    registerMutation.mutate({
      email: registerEmail.trim(),
      password: registerPassword,
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      account_type: accountType,
    });
  };

  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-[hsl(224_48%_16%)] p-12 text-[hsl(216_33%_95%)] lg:flex">
        <Link href="/" aria-label="Nexora home" className="[&_.text-muted-foreground]:text-[hsl(216_33%_95%/.6)]">
          <Brand subtitle={hiring ? "Hiring" : "Interview rehearsal"} />
        </Link>
        {hiring ? <HiringStory /> : <PracticeStory />}
        <p className="text-sm text-[hsl(216_33%_95%/.5)]">
          {hiring ? "Candidates answer in English, Urdu, French or Spanish." : "Practice in English, Urdu, French or Spanish."}
        </p>
      </aside>

      <div className="flex flex-col px-4 py-6 sm:px-8">
        <div className="flex items-center justify-between">
          <Link href="/" className="lg:invisible" aria-label="Nexora home">
            <Brand />
          </Link>
          <ThemeToggle />
        </div>

        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
          <h1 className="text-3xl font-bold">{activeTab === "login" ? "Welcome back" : "Create your account"}</h1>
          <p className="mt-2 text-muted-foreground">
            {activeTab === "login"
              ? "Sign in to continue where you left off."
              : hiring
                ? "It takes a minute. Then add your company and post your first job."
                : "It takes a minute. Your first interview can start right after."}
          </p>

          <GoogleSignIn next={params.get("next")} accountType={accountType} />

          <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-8 w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Sign in</TabsTrigger>
              <TabsTrigger value="register">Create account</TabsTrigger>
            </TabsList>

            <TabsContent value="login" className="mt-6">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email">Email</Label>
                  <Input
                    id="login-email"
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    placeholder="you@example.com"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-baseline justify-between gap-3">
                    <Label htmlFor="login-password">Password</Label>
                    <Link href="/forgot-password" className="text-sm font-medium text-primary hover:underline" data-testid="link-forgot-password">
                      Forgot password?
                    </Link>
                  </div>
                  <Input
                    id="login-password"
                    type="password"
                    autoComplete="current-password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit" size="lg" className="w-full" disabled={loginMutation.isPending}>
                  {loginMutation.isPending && <Loader2 className="animate-spin" />}
                  Sign in
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="register" className="mt-6">
              <form onSubmit={handleRegister} className="space-y-4">
                <OptionGroup label="What will you use Nexora for?" className="grid gap-2">
                  <OptionCard
                    selected={!hiring}
                    onSelect={() => setAccountType("candidate")}
                    icon={<Mic />}
                    title="Practising for interviews"
                    description="Mock interviews from your CV, with feedback."
                    className="p-3 sm:p-3"
                    testId="option-account-candidate"
                  />
                  <OptionCard
                    selected={hiring}
                    onSelect={() => setAccountType("employer")}
                    icon={<Briefcase />}
                    title="Hiring for a company"
                    description="Jobs, candidates and interviews for your team."
                    className="p-3 sm:p-3"
                    testId="option-account-employer"
                  />
                </OptionGroup>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="first-name">First name</Label>
                    <Input
                      id="first-name"
                      autoComplete="given-name"
                      maxLength={50}
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="last-name">Last name</Label>
                    <Input
                      id="last-name"
                      autoComplete="family-name"
                      maxLength={50}
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="register-email">Email</Label>
                  <Input
                    id="register-email"
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    placeholder="you@example.com"
                    value={registerEmail}
                    onChange={(e) => setRegisterEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="register-password">Password</Label>
                  <Input
                    id="register-password"
                    type="password"
                    autoComplete="new-password"
                    minLength={MIN_PASSWORD}
                    aria-describedby="password-hint"
                    value={registerPassword}
                    onChange={(e) => setRegisterPassword(e.target.value)}
                    required
                  />
                  <p id="password-hint" className="text-xs text-muted-foreground">
                    At least {MIN_PASSWORD} characters.
                  </p>
                </div>
                <Button type="submit" size="lg" className="w-full" disabled={registerMutation.isPending}>
                  {registerMutation.isPending && <Loader2 className="animate-spin" />}
                  Create account
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
