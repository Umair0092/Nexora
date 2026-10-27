import { useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { OptionCard, OptionGroup } from "@/components/option-card";
import { displayName, type InterviewType, type User } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  ArrowRight,
  Code,
  Database,
  FileText,
  Layers,
  Loader2,
  Server,
  Cloud,
  Brain,
  Upload,
  UserRound,
  Users,
  CheckCircle2,
} from "lucide-react";

const TYPES: { id: InterviewType; title: string; body: string; meta: string; icon: JSX.Element }[] = [
  { id: "cv", title: "CV interview", body: "Questions about your own projects and experience.", meta: "5 questions, about 10 minutes", icon: <FileText /> },
  { id: "role", title: "Technical quiz", body: "Knowledge questions for one track, marked against model answers.", meta: "5 questions, about 8 minutes", icon: <Code /> },
  { id: "complete", title: "Full interview", body: "Five CV questions, then five technical ones.", meta: "10 questions, about 20 minutes", icon: <Layers /> },
  { id: "behavioral", title: "Behavioral", body: "\"Tell me about a time…\" questions, scored on how well you use STAR.", meta: "5 questions, about 10 minutes", icon: <Users /> },
];

const TRACK_ICONS: Record<string, JSX.Element> = {
  "General Software Engineering": <Code />,
  "AI (Data Science)": <Brain />,
  SQL: <Database />,
  DevOps: <Server />,
  "Containers and Cloud": <Cloud />,
};

const TRACK_LABELS: Record<string, string> = {
  "General Software Engineering": "Software Engineering",
  "AI (Data Science)": "AI and Data Science",
  "Containers and Cloud": "Containers and Cloud",
};

const DIFFICULTIES = [
  { id: "easy", title: "Easy", body: "Fundamentals and definitions" },
  { id: "medium", title: "Medium", body: "What most interviews ask" },
  { id: "hard", title: "Hard", body: "Senior-level depth" },
];

const MAX_JOB_DESCRIPTION = 6000;

const LANGUAGES = [
  { code: "en", name: "English", native: "English" },
  { code: "ur", name: "Urdu", native: "اردو" },
  { code: "fr", name: "French", native: "Français" },
  { code: "es", name: "Spanish", native: "Español" },
];

type Step = "type" | "cv" | "track" | "language" | "confirm";
const STEP_LABELS: Record<Step, string> = {
  type: "Format",
  cv: "Your CV",
  track: "Track",
  language: "Language",
  confirm: "Review",
};

function stepsFor(type: InterviewType | null): Step[] {
  switch (type) {
    case "role":
      return ["type", "track", "language", "confirm"];
    case "complete":
      return ["type", "cv", "track", "language", "confirm"];
    default:
      return ["type", "cv", "language", "confirm"];
  }
}

// Candidate data in the shape the resume service expects.
interface CandidateData {
  name: string;
  degree: string;
  summary?: string | null;
  skills: string[];
  work_experience?: { company: string; role: string; duration?: string | null; description?: string | null }[] | null;
  projects_done?: string[] | null;
  education?: unknown[] | null;
  achievements?: string[] | null;
}

function candidateFromProfile(user: User): CandidateData {
  return {
    name: displayName(user) || "Candidate",
    degree: "Not specified",
    summary: user.bio || null,
    skills: user.skills || [],
    work_experience: (user.experience || []).map((exp) => ({
      company: exp.company || "",
      role: exp.title || "",
      duration: exp.duration || null,
      description: exp.description || null,
    })),
    projects_done: [],
    education: [],
    achievements: [],
  };
}

export default function InterviewSetup() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const fileInput = useRef<HTMLInputElement>(null);

  const initialType = (() => {
    const t = new URLSearchParams(window.location.search).get("type");
    return TYPES.some((x) => x.id === t) ? (t as InterviewType) : null;
  })();

  const [interviewType, setInterviewType] = useState<InterviewType | null>(initialType);
  const [step, setStep] = useState<Step>(initialType ? stepsFor(initialType)[1] : "type");
  const [track, setTrack] = useState("General Software Engineering");
  const [difficulty, setDifficulty] = useState("medium");
  const [language, setLanguage] = useState("en");
  const [targetRole, setTargetRole] = useState("Software Engineer");
  const [jobDescription, setJobDescription] = useState("");
  const [candidate, setCandidate] = useState<CandidateData | null>(null);
  const [cvSource, setCvSource] = useState<"upload" | "profile" | null>(null);
  const [dragging, setDragging] = useState(false);

  const { data: categories, isLoading: categoriesLoading } = useQuery<{ categories: string[] }>({
    queryKey: ["/api/quiz/categories"],
    staleTime: Infinity,
  });

  const steps = stepsFor(interviewType);
  const stepIndex = steps.indexOf(step);
  const profileHasCv = !!user && ((user.skills?.length ?? 0) > 0 || (user.experience?.length ?? 0) > 0 || !!user.bio);

  const parseResume = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return api<{ candidate_data: CandidateData }>("/api/ai/v1/parse-resume", { method: "POST", body: form });
    },
    onSuccess: (data) => {
      setCandidate(data.candidate_data);
      setCvSource("upload");
    },
    onError: (error) => {
      toast({ title: "Couldn't read that CV", description: errorMessage(error), variant: "destructive" });
    },
  });

  const saveToProfile = useMutation({
    mutationFn: (c: CandidateData) =>
      api<User>("/api/v1/profile", {
        method: "PUT",
        body: {
          user: {
            bio: c.summary || "",
            skills: c.skills || [],
            experience: (c.work_experience || []).map((w) => ({
              title: w.role,
              company: w.company,
              duration: w.duration || "",
              description: w.description || "",
            })),
          },
        },
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(["/api/v1/me"], updated);
      toast({ title: "Saved to your profile", description: "Next time you can skip the upload." });
    },
    onError: (error) => {
      toast({ title: "Couldn't save to profile", description: errorMessage(error), variant: "destructive" });
    },
  });

  const startInterview = useMutation({
    mutationFn: async () => {
      const role = targetRole.trim() || "Software Engineer";
      const createCv = () =>
        api<{ session_id: string }>("/api/ai/v1/interviews", {
          method: "POST",
          body: {
            candidate_data: candidate,
            target_role: role,
            num_questions: 5,
            language,
            interview_style: interviewType === "behavioral" ? "behavioral" : "standard",
            job_description: jobDescription.trim() || null,
          },
        });
      const createQuiz = (level: string) =>
        api<{ session_id: string }>("/api/quiz", {
          method: "POST",
          body: { target_role: track, num_questions: 5, difficulty: level, language },
        });

      if (interviewType === "role") return { primary: await createQuiz(difficulty) };
      if (interviewType === "complete") {
        const [cv, quiz] = await Promise.all([createCv(), createQuiz("medium")]);
        return { primary: cv, quiz };
      }
      return { primary: await createCv() };
    },
    onSuccess: ({ primary, quiz }) => {
      const params = new URLSearchParams({ type: interviewType!, lang: language });
      if (quiz) params.set("quizSessionId", quiz.session_id);
      setLocation(`/interview/session/${primary.session_id}?${params}`);
    },
    onError: (error) => {
      toast({ title: "Couldn't start the interview", description: errorMessage(error), variant: "destructive" });
    },
  });

  const canProceed = (() => {
    switch (step) {
      case "type":
        return interviewType !== null;
      case "cv":
        return candidate !== null;
      case "track":
        return !!track;
      default:
        return true;
    }
  })();

  const goNext = () => {
    if (!canProceed) return;
    const next = steps[stepIndex + 1];
    if (next) setStep(next);
  };
  const goBack = () => {
    const prev = steps[stepIndex - 1];
    if (prev) setStep(prev);
  };

  const chooseType = (t: InterviewType) => {
    setInterviewType(t);
  };

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    if (file.type && file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      toast({ title: "Upload a PDF", description: "Nexora can only read CVs saved as PDF.", variant: "destructive" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "That file is too large", description: "Upload a PDF under 10 MB.", variant: "destructive" });
      return;
    }
    parseResume.mutate(file);
  };

  const trackLabel = TRACK_LABELS[track] || track;
  const langLabel = LANGUAGES.find((l) => l.code === language)?.name;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:py-10">
      <h1 className="text-3xl font-bold sm:text-4xl">New interview</h1>

      {/* Progress: full labels from sm up, compact counter on phones */}
      <nav aria-label="Setup progress" className="mt-6">
        <p className="text-sm text-muted-foreground sm:hidden">
          Step {stepIndex + 1} of {steps.length}: <span className="font-semibold text-foreground">{STEP_LABELS[step]}</span>
        </p>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted sm:hidden">
          <div className="h-full bg-primary transition-all" style={{ width: `${((stepIndex + 1) / steps.length) * 100}%` }} />
        </div>
        <ol className="hidden items-center gap-2 sm:flex">
          {steps.map((s, i) => (
            <li key={s} className="flex flex-1 items-center gap-2" aria-current={s === step ? "step" : undefined}>
              <span
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                  i < stepIndex && "bg-primary text-primary-foreground",
                  i === stepIndex && "bg-foreground text-background",
                  i > stepIndex && "bg-muted text-muted-foreground",
                )}
              >
                {i < stepIndex ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : i + 1}
              </span>
              <span className={cn("text-sm", i === stepIndex ? "font-semibold" : "text-muted-foreground")}>{STEP_LABELS[s]}</span>
              {i < steps.length - 1 && <span className={cn("h-px flex-1", i < stepIndex ? "bg-primary" : "bg-border")} />}
            </li>
          ))}
        </ol>
      </nav>

      <div className="mt-8 min-h-[22rem]">
        {step === "type" && (
          <section>
            <h2 className="text-xl font-semibold">What do you want to practise?</h2>
            <OptionGroup label="Interview format" className="mt-5 grid gap-3 sm:grid-cols-2">
              {TYPES.map((t) => (
                <OptionCard
                  key={t.id}
                  selected={interviewType === t.id}
                  onSelect={() => chooseType(t.id)}
                  icon={t.icon}
                  title={t.title}
                  description={t.body}
                  meta={t.meta}
                  testId={`option-type-${t.id}`}
                />
              ))}
            </OptionGroup>
          </section>
        )}

        {step === "cv" && (
          <section>
            <h2 className="text-xl font-semibold">Give the interviewer your CV</h2>
            <p className="mt-1 text-muted-foreground">Questions are based on what's in it, so the more detail the better.</p>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  handleFile(e.dataTransfer.files?.[0]);
                }}
                className={cn(
                  "flex flex-col items-center justify-center rounded-xl border-2 border-dashed bg-card p-6 text-center transition-colors",
                  dragging ? "border-primary bg-accent/50" : "border-input",
                  cvSource === "upload" && "border-solid border-primary",
                )}
              >
                {parseResume.isPending ? (
                  <>
                    <Loader2 className="h-7 w-7 animate-spin text-primary" aria-hidden="true" />
                    <p className="mt-3 font-semibold">Reading your CV…</p>
                    <p className="text-sm text-muted-foreground">This usually takes 10–20 seconds.</p>
                  </>
                ) : (
                  <>
                    <Upload className="h-7 w-7 text-primary" aria-hidden="true" />
                    <p className="mt-3 font-semibold">{cvSource === "upload" ? "Upload a different PDF" : "Upload your CV"}</p>
                    <p className="text-sm text-muted-foreground">PDF up to 10 MB. Drag it here or</p>
                    <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => fileInput.current?.click()}>
                      Choose file
                    </Button>
                    <input
                      ref={fileInput}
                      type="file"
                      accept="application/pdf,.pdf"
                      className="sr-only"
                      tabIndex={-1}
                      aria-label="CV PDF file"
                      onChange={(e) => {
                        handleFile(e.target.files?.[0]);
                        e.target.value = "";
                      }}
                    />
                  </>
                )}
              </div>

              <OptionGroup label="Use saved profile">
                <OptionCard
                  selected={cvSource === "profile"}
                  onSelect={() => {
                    if (!user || !profileHasCv) {
                      setLocation("/profile");
                      return;
                    }
                    setCandidate(candidateFromProfile(user));
                    setCvSource("profile");
                  }}
                  icon={<UserRound />}
                  title="Use my saved profile"
                  description={
                    profileHasCv
                      ? `${user?.skills?.length ?? 0} skills and ${user?.experience?.length ?? 0} ${user?.experience?.length === 1 ? "role" : "roles"} saved`
                      : "Your profile is empty. Fill it in first."
                  }
                  className="h-full"
                />
              </OptionGroup>
            </div>

            {candidate && (
              <div className="mt-6 rounded-xl border bg-card p-5" aria-live="polite">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="flex items-center gap-2 font-semibold">
                      <CheckCircle2 className="h-5 w-5 text-success" aria-hidden="true" />
                      {cvSource === "upload" ? "CV read" : "Profile loaded"}: {candidate.name}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {candidate.skills?.length || 0} skills, {candidate.work_experience?.length || 0}{" "}
                      {candidate.work_experience?.length === 1 ? "role" : "roles"}, {candidate.projects_done?.length || 0}{" "}
                      {candidate.projects_done?.length === 1 ? "project" : "projects"}
                    </p>
                  </div>
                  {cvSource === "upload" && (
                    <Button variant="outline" size="sm" onClick={() => saveToProfile.mutate(candidate)} disabled={saveToProfile.isPending}>
                      {saveToProfile.isPending && <Loader2 className="animate-spin" />}
                      Save to profile
                    </Button>
                  )}
                </div>
                {candidate.skills?.length > 0 && (
                  <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="Skills found">
                    {candidate.skills.slice(0, 12).map((s) => (
                      <li key={s} className="rounded-sm bg-muted px-2 py-0.5 text-xs">{s}</li>
                    ))}
                    {candidate.skills.length > 12 && (
                      <li className="px-1 text-xs text-muted-foreground">+{candidate.skills.length - 12} more</li>
                    )}
                  </ul>
                )}
                <div className="mt-5 space-y-2">
                  <Label htmlFor="target-role">Role you're interviewing for</Label>
                  <Input
                    id="target-role"
                    value={targetRole}
                    maxLength={100}
                    onChange={(e) => setTargetRole(e.target.value)}
                    placeholder="e.g. Frontend Developer"
                  />
                </div>
              </div>
            )}

            {candidate && (
              <div className="mt-4 rounded-xl border bg-card p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <Label htmlFor="job-description" className="text-base font-semibold">
                    Job description <span className="font-normal text-muted-foreground">(optional)</span>
                  </Label>
                  <span className="text-xs tabular-nums text-muted-foreground" aria-live="polite">
                    {jobDescription.length.toLocaleString()} / {MAX_JOB_DESCRIPTION.toLocaleString()}
                  </span>
                </div>
                <p id="job-description-hint" className="mt-1 text-sm text-muted-foreground">
                  Paste the job advert and the interviewer will focus on its requirements, especially the ones your CV covers least.
                </p>
                <Textarea
                  id="job-description"
                  aria-describedby="job-description-hint"
                  value={jobDescription}
                  maxLength={MAX_JOB_DESCRIPTION}
                  onChange={(e) => setJobDescription(e.target.value)}
                  className="mt-3 min-h-[8rem]"
                  placeholder="e.g. We're hiring a backend engineer to build payment APIs. You'll need 2+ years of Ruby on Rails, PostgreSQL, and experience running services in production…"
                  data-testid="input-job-description"
                />
              </div>
            )}
          </section>
        )}

        {step === "track" && (
          <section>
            <h2 className="text-xl font-semibold">
              {interviewType === "complete" ? "Pick the track for the technical half" : "Pick a technical track"}
            </h2>
            {categoriesLoading ? (
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
              </div>
            ) : (
              <OptionGroup label="Technical track" className="mt-5 grid gap-3 sm:grid-cols-2">
                {(categories?.categories ?? Object.keys(TRACK_ICONS)).map((c) => (
                  <OptionCard
                    key={c}
                    selected={track === c}
                    onSelect={() => setTrack(c)}
                    icon={TRACK_ICONS[c] ?? <Code />}
                    title={TRACK_LABELS[c] || c}
                    testId={`option-track-${c}`}
                  />
                ))}
              </OptionGroup>
            )}

            {interviewType === "role" && (
              <>
                <h3 className="mt-8 font-semibold">Difficulty</h3>
                <OptionGroup label="Difficulty" className="mt-3 grid gap-3 sm:grid-cols-3">
                  {DIFFICULTIES.map((d) => (
                    <OptionCard key={d.id} selected={difficulty === d.id} onSelect={() => setDifficulty(d.id)} title={d.title} description={d.body} />
                  ))}
                </OptionGroup>
              </>
            )}
          </section>
        )}

        {step === "language" && (
          <section>
            <h2 className="text-xl font-semibold">Which language will you answer in?</h2>
            <p className="mt-1 text-muted-foreground">
              Questions are read in English. Your spoken answers are transcribed and your feedback is written in this language.
            </p>
            <OptionGroup label="Answer language" className="mt-5 grid gap-3 sm:grid-cols-2">
              {LANGUAGES.map((l) => (
                <OptionCard
                  key={l.code}
                  selected={language === l.code}
                  onSelect={() => setLanguage(l.code)}
                  title={l.name}
                  description={<span lang={l.code} dir={l.code === "ur" ? "rtl" : undefined}>{l.native}</span>}
                />
              ))}
            </OptionGroup>
          </section>
        )}

        {step === "confirm" && (
          <section>
            <h2 className="text-xl font-semibold">Ready when you are</h2>
            <dl className="mt-5 divide-y rounded-xl border bg-card">
              {[
                ["Format", TYPES.find((t) => t.id === interviewType)?.title],
                ...(interviewType !== "role" ? [["Role", targetRole]] : []),
                ...(interviewType !== "role" ? [["Job description", jobDescription.trim() ? "Included" : "None"]] : []),
                ...(interviewType === "role" || interviewType === "complete" ? [["Track", trackLabel]] : []),
                ...(interviewType === "role" ? [["Difficulty", DIFFICULTIES.find((d) => d.id === difficulty)?.title]] : []),
                ["Answer language", langLabel],
                ["Questions", interviewType === "complete" ? "10" : "5"],
              ].map(([k, v]) => (
                <div key={k} className="flex items-center justify-between gap-4 px-5 py-3.5">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="text-right font-semibold">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-5 rounded-xl bg-muted/60 p-5 text-sm">
              <p className="font-semibold">Before you start</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                <li>Your browser will ask for camera and microphone access.</li>
                <li>Sit facing a light source, with the camera at eye level.</li>
                <li>Each question is read aloud. Recording starts when it finishes.</li>
              </ul>
            </div>
          </section>
        )}
      </div>

      <div className="sticky bottom-0 -mx-4 mt-8 flex items-center justify-between gap-3 border-t bg-background/95 px-4 py-4 backdrop-blur sm:static sm:mx-0 sm:bg-transparent sm:px-0">
        <Button variant="ghost" onClick={goBack} disabled={stepIndex === 0} className={cn(stepIndex === 0 && "invisible")}>
          <ArrowLeft />
          Back
        </Button>
        {step === "confirm" ? (
          <Button size="lg" onClick={() => startInterview.mutate()} disabled={startInterview.isPending} data-testid="button-start-interview">
            {startInterview.isPending ? <Loader2 className="animate-spin" /> : null}
            {startInterview.isPending ? "Preparing questions…" : "Start interview"}
          </Button>
        ) : (
          <Button size="lg" onClick={goNext} disabled={!canProceed} data-testid="button-continue">
            Continue
            <ArrowRight />
          </Button>
        )}
      </div>
    </div>
  );
}
