import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { Brand } from "@/components/brand";
import { ScoreDial } from "@/components/score-dial";
import { FileText, Code, Layers, Users, Eye, Hand, ShieldCheck } from "lucide-react";

// The hero cycles through the kind of questions Nexora actually asks: CV follow-ups first.
const CUE_QUESTIONS = [
  { n: 1, q: "Your CV says you cut API latency by 40%. Walk me through how you found the bottleneck." },
  { n: 4, q: "What's the difference between a clustered and a non-clustered index?" },
  { n: 7, q: "Tell me about a time a teammate disagreed with your design. What happened next?" },
];

const formats = [
  {
    icon: FileText,
    title: "CV interview",
    body: "Upload your CV. The interviewer asks about your actual projects and follows up on what you say.",
    length: "5 questions",
  },
  {
    icon: Code,
    title: "Technical quiz",
    body: "Questions from a real bank for Software Engineering, Data Science, SQL, DevOps or Cloud, marked against model answers.",
    length: "5 questions",
  },
  {
    icon: Layers,
    title: "Full interview",
    body: "Five CV questions, then five technical ones. The closest thing to the real round.",
    length: "10 questions",
  },
  {
    icon: Users,
    title: "Behavioral",
    body: "Teamwork, conflict and ownership questions. Feedback checks whether your answers follow situation, task, action, result.",
    length: "5 questions",
  },
];

function CueCard() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % CUE_QUESTIONS.length), 6000);
    return () => clearInterval(timer);
  }, []);

  const cue = CUE_QUESTIONS[index];

  return (
    <div className="relative overflow-hidden rounded-2xl bg-[hsl(224_48%_16%)] p-6 text-[hsl(216_33%_95%)] shadow-xl ring-1 ring-transparent dark:ring-[hsl(216_33%_95%/.1)] sm:p-10">
      <div className="flex items-center justify-between gap-4 text-sm text-[hsl(216_33%_95%/.7)]">
        <span className="flex items-center gap-3">
          <span className="tally-light" aria-hidden="true" />
          Recording your answer
        </span>
        <span className="tabular-nums">Question {cue.n} of 10</span>
      </div>
      <p key={cue.q} className="cue-card mt-8 min-h-[4.6em] text-[1.65rem] animate-in fade-in duration-700 sm:mt-10 sm:text-4xl" aria-live="polite">
        "{cue.q}"
      </p>
      <dl className="mt-8 grid grid-cols-3 gap-4 border-t border-[hsl(216_33%_95%/.15)] pt-5 text-sm sm:mt-10">
        <div>
          <dt className="text-[hsl(216_33%_95%/.6)]">Eye contact</dt>
          <dd className="mt-1 font-semibold">Steady</dd>
        </div>
        <div>
          <dt className="text-[hsl(216_33%_95%/.6)]">Attention</dt>
          <dd className="mt-1 font-semibold tabular-nums">86</dd>
        </div>
        <div>
          <dt className="text-[hsl(216_33%_95%/.6)]">Hands</dt>
          <dd className="mt-1 font-semibold">Calm</dd>
        </div>
      </dl>
    </div>
  );
}

export default function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" aria-label="Nexora home">
            <Brand />
          </Link>
          <nav className="hidden items-center gap-8 text-sm md:flex" aria-label="Sections">
            <a href="#formats" className="text-muted-foreground transition-colors hover:text-foreground">Formats</a>
            <a href="#report" className="text-muted-foreground transition-colors hover:text-foreground">The report</a>
            <a href="#how" className="text-muted-foreground transition-colors hover:text-foreground">How it works</a>
          </nav>
          <div className="flex items-center gap-1 sm:gap-2">
            <ThemeToggle />
            <Button asChild variant="ghost" className="hidden sm:inline-flex" data-testid="button-login">
              <Link href="/auth">Sign in</Link>
            </Button>
            <Button asChild data-testid="button-get-started">
              <Link href="/auth?mode=register">Start practising</Link>
            </Button>
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 sm:px-6 md:py-20 lg:grid-cols-[0.9fr_1.1fr] lg:gap-14 lg:py-24">
          <div>
            <h1 className="text-[2.6rem] font-bold leading-[1.02] sm:text-6xl">
              Rehearse the interview before it happens.
            </h1>
            <p className="mt-6 max-w-md text-lg text-muted-foreground">
              Answer out loud to an AI interviewer that has read your CV. Afterwards you get a scored report on what you
              said and how you came across on camera.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="h-12 px-6 text-base" data-testid="button-hero-cta">
                <Link href="/auth?mode=register">Start a free practice interview</Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-12 px-6 text-base">
                <a href="#report">See a sample report</a>
              </Button>
            </div>
            <p className="mt-5 text-sm text-muted-foreground">Answer in English, Urdu, French or Spanish.</p>
          </div>
          <CueCard />
        </section>

        <section id="formats" className="border-t bg-card">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24">
            <div className="max-w-2xl">
              <h2 className="text-3xl font-bold sm:text-4xl">Pick the round you're worried about</h2>
              <p className="mt-4 text-muted-foreground">
                Each format is a full spoken interview with camera on. You can pause between answers.
              </p>
            </div>
            <ul className="mt-12 divide-y border-y">
              {formats.map((f) => (
                <li key={f.title} className="grid gap-3 py-6 sm:grid-cols-[2.75rem_14rem_1fr_auto] sm:items-baseline sm:gap-6">
                  <f.icon className="h-6 w-6 text-primary sm:translate-y-1" aria-hidden="true" />
                  <h3 className="text-xl font-semibold">{f.title}</h3>
                  <p className="max-w-xl text-muted-foreground">{f.body}</p>
                  <span className="text-sm text-muted-foreground sm:text-right">{f.length}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="report" className="border-t">
          <div className="mx-auto grid max-w-6xl gap-12 px-4 py-16 sm:px-6 md:py-24 lg:grid-cols-[1fr_1.15fr] lg:items-center">
            <div>
              <h2 className="text-3xl font-bold sm:text-4xl">Feedback you can act on tomorrow</h2>
              <p className="mt-4 max-w-md text-muted-foreground">
                Every answer gets a score, what worked, and what to change. The camera adds what you can't hear
                yourself: where you looked, when you drifted, and what your hands were doing.
              </p>
              <ul className="mt-8 space-y-4 text-sm">
                <li className="flex gap-3">
                  <Eye className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                  <span>Attention tracked from gaze, head position and blink rate, second by second.</span>
                </li>
                <li className="flex gap-3">
                  <Hand className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                  <span>Hand movement graded calm, moderate or excessive.</span>
                </li>
                <li className="flex gap-3">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                  <span>Video is analysed frame by frame and never saved. Only the scores are kept.</span>
                </li>
              </ul>
            </div>

            <figure className="rounded-2xl border bg-card p-5 shadow-lg sm:p-8" aria-label="Sample report excerpt">
              <div className="flex flex-wrap items-center gap-6">
                <ScoreDial score={78} size="md" label="Overall score" />
                <div>
                  <p className="font-display text-2xl font-semibold">Strong, with a few gaps</p>
                  <p className="text-sm text-muted-foreground">Full interview for a Backend Engineer role</p>
                </div>
              </div>
              <div className="mt-6 rounded-xl bg-muted/60 p-4 sm:p-5">
                <p className="text-sm text-muted-foreground">Question 4</p>
                <p className="mt-1 font-semibold">What's the difference between a clustered and a non-clustered index?</p>
                <div className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
                  <div>
                    <p className="font-semibold text-success">What worked</p>
                    <p className="mt-1 text-muted-foreground">Correct definition, and you tied it to a query you'd tuned.</p>
                  </div>
                  <div>
                    <p className="font-semibold text-warning">Change next time</p>
                    <p className="mt-1 text-muted-foreground">Mention the write cost of extra indexes before you're asked.</p>
                  </div>
                </div>
              </div>
            </figure>
          </div>
        </section>

        <section id="how" className="border-t bg-card">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24">
            <h2 className="text-3xl font-bold sm:text-4xl">How a session works</h2>
            <ol className="mt-12 grid gap-10 md:grid-cols-3">
              {[
                ["Choose a format", "Upload your CV or pick a technical track, then choose your answer language."],
                ["Answer out loud", "Each question is read aloud. Answer like it's real, then move to the next one when you're done."],
                ["Read your report", "Scores, per-question feedback and your camera summary are saved to your history."],
              ].map(([title, body], i) => (
                <li key={title}>
                  <span className="font-display text-5xl font-bold text-primary/30" aria-hidden="true">{i + 1}</span>
                  <h3 className="mt-3 text-xl font-semibold">{title}</h3>
                  <p className="mt-2 text-muted-foreground">{body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="border-t">
          <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 py-16 sm:px-6 md:flex-row md:items-center md:justify-between md:py-20">
            <h2 className="max-w-xl text-3xl font-bold sm:text-4xl">Your next interview is a rehearsal away.</h2>
            <Button asChild size="lg" className="h-12 px-6 text-base" data-testid="button-cta-final">
              <Link href="/auth?mode=register">Create a free account</Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <Brand className="text-foreground" />
          <p>© {new Date().getFullYear()} Nexora. Built as a final-year project.</p>
        </div>
      </footer>
    </div>
  );
}
