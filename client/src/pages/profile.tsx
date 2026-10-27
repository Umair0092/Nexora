import { useState, useRef, useEffect, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { api, errorMessage } from "@/lib/api";
import type { Experience, User } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Upload, Plus, X, Trash2 } from "lucide-react";

const emptyRole: Experience = { title: "", company: "", duration: "", description: "" };

interface ParsedCv {
  candidate_data: {
    name: string;
    summary?: string | null;
    skills: string[];
    work_experience?: { company: string; role: string; duration?: string | null; description?: string | null }[] | null;
  };
}

export default function ProfilePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const fileInput = useRef<HTMLInputElement>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [bio, setBio] = useState("");
  const [skills, setSkills] = useState<string[]>([]);
  const [newSkill, setNewSkill] = useState("");
  const [experience, setExperience] = useState<Experience[]>([]);
  const [importedFromCv, setImportedFromCv] = useState(false);

  const load = (u: User) => {
    setFirstName(u.firstName || "");
    setLastName(u.lastName || "");
    setBio(u.bio || "");
    setSkills(u.skills || []);
    setExperience(u.experience || []);
  };

  useEffect(() => {
    if (user) load(user);
  }, [user]);

  const dirty = useMemo(() => {
    if (!user) return false;
    return (
      firstName !== (user.firstName || "") ||
      lastName !== (user.lastName || "") ||
      bio !== (user.bio || "") ||
      JSON.stringify(skills) !== JSON.stringify(user.skills || []) ||
      JSON.stringify(experience) !== JSON.stringify(user.experience || [])
    );
  }, [user, firstName, lastName, bio, skills, experience]);

  const save = useMutation({
    mutationFn: () =>
      api<User>("/api/v1/profile", {
        method: "PUT",
        body: {
          user: {
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            bio,
            skills,
            experience: experience.filter((e) => e.title.trim() || e.company.trim()),
          },
        },
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(["/api/v1/me"], updated);
      setImportedFromCv(false);
      toast({ title: "Profile saved" });
    },
    onError: (error) => {
      toast({ title: "Couldn't save your profile", description: errorMessage(error), variant: "destructive" });
    },
  });

  // Real CV parsing via the resume service. Results fill the form for review; nothing is saved until "Save profile".
  const importCv = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return api<ParsedCv>("/api/v1/resume/parse", { method: "POST", body: form });
    },
    onSuccess: ({ candidate_data: c }) => {
      if (c.summary) setBio(c.summary);
      if (c.skills?.length) setSkills(Array.from(new Set([...skills, ...c.skills])).slice(0, 50));
      if (c.work_experience?.length) {
        setExperience(
          c.work_experience.map((w) => ({
            title: w.role || "",
            company: w.company || "",
            duration: w.duration || "",
            description: w.description || "",
          })),
        );
      }
      setImportedFromCv(true);
      toast({ title: "CV imported", description: "Check the details below, then save your profile." });
    },
    onError: (error) => {
      toast({ title: "Couldn't read that CV", description: errorMessage(error), variant: "destructive" });
    },
  });

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      toast({ title: "Upload a PDF", description: "Nexora can only read CVs saved as PDF.", variant: "destructive" });
      return;
    }
    importCv.mutate(file);
  };

  const addSkill = () => {
    const skill = newSkill.trim();
    if (skill && !skills.some((s) => s.toLowerCase() === skill.toLowerCase())) setSkills([...skills, skill]);
    setNewSkill("");
  };

  const updateRole = (index: number, field: keyof Experience, value: string) => {
    setExperience(experience.map((e, i) => (i === index ? { ...e, [field]: value } : e)));
  };

  if (!user) return null;

  return (
    <div className="mx-auto max-w-4xl px-4 pb-28 pt-8 sm:px-6 lg:px-8 lg:py-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold sm:text-4xl">Profile</h1>
          <p className="mt-2 max-w-lg text-muted-foreground">
            CV interviews can use this instead of an upload. The more specific it is, the sharper the questions.
          </p>
        </div>
        <Button variant="outline" onClick={() => fileInput.current?.click()} disabled={importCv.isPending}>
          {importCv.isPending ? <Loader2 className="animate-spin" /> : <Upload />}
          {importCv.isPending ? "Reading CV…" : "Fill from CV"}
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
      </div>

      {importedFromCv && (
        <p className="mt-6 rounded-xl border border-primary/40 bg-accent/60 p-4 text-sm" role="status">
          We filled in your details from the CV. Nothing is saved yet. Review them, then press Save profile.
        </p>
      )}

      <form
        className="mt-8 space-y-10"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <section aria-labelledby="about-heading" className="grid gap-6 md:grid-cols-[14rem_1fr]">
          <div>
            <h2 id="about-heading" className="text-lg font-semibold">About you</h2>
            <p className="mt-1 text-sm text-muted-foreground">Shown to the interviewer as your summary.</p>
          </div>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="first-name">First name</Label>
                <Input id="first-name" autoComplete="given-name" maxLength={50} value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="last-name">Last name</Label>
                <Input id="last-name" autoComplete="family-name" maxLength={50} value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" value={user.email} disabled />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bio">Summary</Label>
              <Textarea
                id="bio"
                value={bio}
                maxLength={2000}
                onChange={(e) => setBio(e.target.value)}
                className="min-h-[120px]"
                placeholder="e.g. Final-year CS student focused on backend systems. Built a payments API used by 3,000 students."
              />
            </div>
          </div>
        </section>

        <section aria-labelledby="skills-heading" className="grid gap-6 border-t pt-10 md:grid-cols-[14rem_1fr]">
          <div>
            <h2 id="skills-heading" className="text-lg font-semibold">Skills</h2>
            <p className="mt-1 text-sm text-muted-foreground">Tools and topics you're happy to be asked about.</p>
          </div>
          <div>
            {skills.length > 0 && (
              <ul className="mb-4 flex flex-wrap gap-2">
                {skills.map((skill) => (
                  <li key={skill} className="inline-flex items-center gap-1 rounded-md bg-muted py-1 pl-3 pr-1 text-sm">
                    {skill}
                    <button
                      type="button"
                      onClick={() => setSkills(skills.filter((s) => s !== skill))}
                      className="rounded p-1 text-muted-foreground hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={`Remove ${skill}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-2">
              <Label htmlFor="new-skill" className="sr-only">Add a skill</Label>
              <Input
                id="new-skill"
                value={newSkill}
                maxLength={100}
                onChange={(e) => setNewSkill(e.target.value)}
                placeholder="Add a skill, e.g. PostgreSQL"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addSkill();
                  }
                }}
              />
              <Button type="button" variant="outline" onClick={addSkill} disabled={!newSkill.trim()}>
                <Plus />
                Add
              </Button>
            </div>
          </div>
        </section>

        <section aria-labelledby="exp-heading" className="grid gap-6 border-t pt-10 md:grid-cols-[14rem_1fr]">
          <div>
            <h2 id="exp-heading" className="text-lg font-semibold">Experience</h2>
            <p className="mt-1 text-sm text-muted-foreground">Jobs, internships and major projects.</p>
          </div>
          <div className="space-y-4">
            {experience.map((exp, index) => (
              <fieldset key={index} className="rounded-xl border bg-card p-4 sm:p-5">
                <legend className="sr-only">Role {index + 1}</legend>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor={`title-${index}`}>Title</Label>
                    <Input id={`title-${index}`} value={exp.title} onChange={(e) => updateRole(index, "title", e.target.value)} placeholder="Backend intern" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`company-${index}`}>Company or project</Label>
                    <Input id={`company-${index}`} value={exp.company} onChange={(e) => updateRole(index, "company", e.target.value)} />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor={`duration-${index}`}>Dates</Label>
                    <Input id={`duration-${index}`} value={exp.duration || ""} onChange={(e) => updateRole(index, "duration", e.target.value)} placeholder="Jun 2025 – Aug 2025" />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor={`desc-${index}`}>What you did</Label>
                    <Textarea id={`desc-${index}`} value={exp.description || ""} onChange={(e) => updateRole(index, "description", e.target.value)} />
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mt-3 text-muted-foreground hover:text-destructive"
                  onClick={() => setExperience(experience.filter((_, i) => i !== index))}
                >
                  <Trash2 />
                  Remove role
                </Button>
              </fieldset>
            ))}
            {experience.length === 0 && (
              <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                No roles yet. Add one, or fill everything from your CV.
              </p>
            )}
            <Button type="button" variant="outline" onClick={() => setExperience([...experience, { ...emptyRole }])} disabled={experience.length >= 20}>
              <Plus />
              Add role
            </Button>
          </div>
        </section>

        <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 p-4 backdrop-blur md:static md:border-0 md:bg-transparent md:p-0 md:pt-4">
          <div className="mx-auto flex max-w-4xl items-center justify-end gap-3">
            {dirty && (
              <Button type="button" variant="ghost" onClick={() => { load(user); setImportedFromCv(false); }}>
                Discard changes
              </Button>
            )}
            <Button type="submit" size="lg" disabled={!dirty || save.isPending} className="flex-1 sm:flex-none">
              {save.isPending && <Loader2 className="animate-spin" />}
              Save profile
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
