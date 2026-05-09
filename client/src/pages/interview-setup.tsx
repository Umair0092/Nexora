import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Code,
  Briefcase,
  DollarSign,
  UserCheck,
  LineChart,
  Megaphone,
  Stethoscope,
  Scale,
  FileText,
  User,
  Upload,
  Loader2,
  Save,
  Layers,
} from "lucide-react";
import type { Domain } from "@shared/schema";

const domainIcons: Record<string, any> = {
  "software-engineering": Code,
  "marketing": Megaphone,
  "finance": DollarSign,
  "human-resources": UserCheck,
  "data-science": LineChart,
  "business": Briefcase,
  "healthcare": Stethoscope,
  "legal": Scale,
};

// Map domains to quiz API categories
const domainToQuizCategory: Record<string, string> = {
  "Software Engineering": "General Software Engineering",
  "Product Management": "General Software Engineering",
  "Data Science": "AI (Data Science)",
  "Marketing": "General Software Engineering",
  "Finance": "General Software Engineering",
  "Human Resources": "General Software Engineering",
};

// Map difficulty levels
const difficultyMapping: Record<string, string> = {
  "beginner": "easy",
  "intermediate": "medium",
  "advanced": "hard",
};

const difficulties = [
  { id: "beginner", label: "Beginner", description: "Basic entry-level" },
  { id: "intermediate", label: "Intermediate", description: "Standard interview" },
  { id: "advanced", label: "Advanced", description: "Senior roles" },
];

const languages = [
  { code: "en", name: "English", flag: "🇺🇸" },
  { code: "ur", name: "Urdu", flag: "🇵🇰" },
  { code: "fr", name: "French", flag: "🇫🇷" },
  { code: "es", name: "Spanish", flag: "🇪🇸" },
];

// The 5 quiz categories available for role-based and complete interviews
const quizRoles = [
  { id: "General Software Engineering", label: "Software Engineering", icon: Code },
  { id: "AI (Data Science)", label: "AI / Data Science", icon: LineChart },
  { id: "SQL", label: "SQL", icon: DollarSign },
  { id: "DevOps", label: "DevOps", icon: Briefcase },
  { id: "Containers and Cloud", label: "Containers & Cloud", icon: Megaphone },
];

type InterviewType = "role" | "cv" | "complete" | "behavioral" | null;
type Step = "type" | "domain" | "difficulty" | "language" | "cv_setup" | "complete_role" | "confirm";

export default function InterviewSetup() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  
  const [interviewType, setInterviewType] = useState<InterviewType>(null);
  const [step, setStep] = useState<Step>("type");
  const [selectedDomain, setSelectedDomain] = useState<Domain | null>(null);
  const [selectedDifficulty, setSelectedDifficulty] = useState("intermediate");
  const [selectedLanguage, setSelectedLanguage] = useState("en");
  
  // CV setup states
  const [targetRole, setTargetRole] = useState("Software Engineer");
  const [candidateData, setCandidateData] = useState<any>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Complete interview: selected quiz role
  const [selectedQuizRole, setSelectedQuizRole] = useState("General Software Engineering");

  const { data: domains, isLoading: domainsLoading } = useQuery<Domain[]>({
    queryKey: ["/api/v1/domains"],
  });

  const parseResumeMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      // Calls FastAPI parse logic via the Node proxy
      const res = await fetch("/api/ai/v1/parse-resume", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Failed to parse resume");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setCandidateData(data.candidate_data);
      if (data.target_role) setTargetRole(data.target_role);
      toast({
        title: "Resume Parsed Successfully!",
        description: "We extracted your details.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error Parsing Resume",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("PUT", "/api/v1/profile", { user: data });
      return res.json();
    },
    onSuccess: (updatedUser) => {
      queryClient.setQueryData(["/api/v1/me"], updatedUser);
      toast({
        title: "Saved to Profile",
        description: "Your extracted details have been saved to your profile DB.",
      });
    }
  });

  const createSessionMutation = useMutation({
    mutationFn: async () => {
      if (interviewType === "role") {
        // Use Quiz API for role-based interviews
        const quizCategory = domainToQuizCategory[selectedDomain?.name || ""] || "General Software Engineering";
        const quizDifficulty = difficultyMapping[selectedDifficulty] || "medium";

        const res = await fetch("/api/quiz", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            target_role: quizCategory,
            num_questions: 5,
            difficulty: quizDifficulty,
            language: selectedLanguage || "en",
          }),
        });
        if (!res.ok) throw new Error("Failed to start role-based interview");
        return res.json();
      }

      if (interviewType === "complete") {
        // Complete interview: create BOTH CV session (5 Qs) and Quiz session (5 Qs)
        const [cvRes, quizRes] = await Promise.all([
          fetch("/api/ai/v1/interviews", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              candidate_data: candidateData,
              target_role: targetRole,
              num_questions: 5,
              language: selectedLanguage || "en",
            }),
          }),
          fetch("/api/quiz", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              target_role: selectedQuizRole,
              num_questions: 5,
              difficulty: "medium",
              language: selectedLanguage || "en",
            }),
          }),
        ]);
        if (!cvRes.ok) throw new Error("Failed to start CV-based interview");
        if (!quizRes.ok) throw new Error("Failed to start role-based interview");
        const cvData = await cvRes.json();
        const quizData = await quizRes.json();
        return { cvSession: cvData, quizSession: quizData };
      }

      // CV-based uses existing AI interview service
      const res = await fetch("/api/ai/v1/interviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidate_data: candidateData,
          target_role: targetRole,
          num_questions: 5,
          language: selectedLanguage || "en",
        }),
      });
      if (!res.ok) throw new Error("Failed to start CV-based interview");
      return res.json();
    },
    onSuccess: (data: any) => {
      if (interviewType === "role") {
        setLocation(`/interview/session/${data.session_id}?type=role&lang=${selectedLanguage}`);
      } else if (interviewType === "complete") {
        // Pass both session IDs via URL params
        setLocation(`/interview/session/${data.cvSession.session_id}?type=complete&lang=${selectedLanguage}&quizSessionId=${data.quizSession.session_id}`);
      } else if (interviewType === "behavioral") {
        setLocation(`/interview/session/${data.session_id}?type=behavioral&lang=${selectedLanguage}`);
      } else {
        setLocation(`/interview/session/${data.session_id}?type=cv&lang=${selectedLanguage}`);
      }
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to start AI interview session. Please try again.",
        variant: "destructive",
      });
    },
  });

  const steps: Step[] = interviewType === "complete"
    ? ["type", "cv_setup", "complete_role", "language", "confirm"]
    : interviewType === "cv" || interviewType === "behavioral"
    ? ["type", "cv_setup", "language", "confirm"]
    : ["type", "domain", "difficulty", "language", "confirm"];

  const currentStepIndex = steps.indexOf(step);

  const goNext = () => {
    if (step === "type" && !interviewType) return;
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < steps.length) {
      setStep(steps[nextIndex]);
    }
  };

  const goBack = () => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      setStep(steps[prevIndex]);
    }
  };

  const canProceed = () => {
    switch (step) {
      case "type": return interviewType !== null;
      case "domain": return selectedDomain !== null;
      case "cv_setup": return candidateData !== null;
      case "complete_role": return selectedQuizRole !== "";
      case "difficulty": return selectedDifficulty !== "";
      case "language": return selectedLanguage !== "";
      default: return true;
    }
  };

  const getIconComponent = (domain: Domain) => {
    const iconKey = domain.name.toLowerCase().replace(/\s+/g, "-");
    return domainIcons[iconKey] || Briefcase;
  };

  const handleResumeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    await parseResumeMutation.mutateAsync(file);
    setIsUploading(false);
  };

  const loadProfileAsCV = () => {
    if (!user) return;
    setCandidateData({
      name: user.username || "Candidate",
      degree: "Not specified",
      summary: user.bio || "No summary provided",
      skills: user.skills || [],
      work_experience: (user.experience || []).map((exp: any) => ({
        company: exp.company || "",
        role: exp.title || exp.role || "Employee",
        duration: exp.duration || "",
        description: exp.description || ""
      })),
      education: [],
      projects_done: [],
      achievements: []
    });
    toast({ title: "Profile Loaded", description: "Using your saved profile as context." });
  };

  const saveExtractedToProfile = () => {
    if (!candidateData) return;
    updateProfileMutation.mutate({
      bio: candidateData.summary || "",
      skills: candidateData.skills || [],
      experience: candidateData.work_experience || []
    });
  };

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Interview Setup</h1>
        <p className="text-muted-foreground">Configure your AI practice session</p>
      </div>

      <div className="mb-8">
        <div className="flex items-center justify-between gap-2">
          {steps.map((s, index) => (
            <div key={s} className="flex items-center flex-1">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm transition-colors ${
                  index <= currentStepIndex
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {index < currentStepIndex ? <Check className="w-5 h-5" /> : index + 1}
              </div>
              {index < steps.length - 1 && (
                <div
                  className={`flex-1 h-1 mx-2 rounded transition-colors ${
                    index < currentStepIndex ? "bg-primary" : "bg-muted"
                  }`}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {step === "type" && (
        <div>
          <h2 className="text-xl font-semibold mb-2">How would you like to practice?</h2>
          <p className="text-muted-foreground mb-6">Choose the base context for your AI interview.</p>
          <div className="grid md:grid-cols-3 gap-4">
            <Card
              className={`cursor-pointer transition-all ${interviewType === "role" ? "ring-2 ring-primary border-primary" : "hover:shadow-md"}`}
              onClick={() => setInterviewType("role")}
            >
              <CardContent className="p-6 flex flex-col items-center text-center">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <Briefcase className="w-8 h-8 text-primary" />
                </div>
                <h3 className="font-semibold text-lg mb-2">Role Based</h3>
                <p className="text-sm text-muted-foreground">Practice standard questions for a specific domain.</p>
              </CardContent>
            </Card>

            <Card
              className={`cursor-pointer transition-all ${interviewType === "cv" ? "ring-2 ring-primary border-primary" : "hover:shadow-md"}`}
              onClick={() => setInterviewType("cv")}
            >
              <CardContent className="p-6 flex flex-col items-center text-center">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <FileText className="w-8 h-8 text-primary" />
                </div>
                <h3 className="font-semibold text-lg mb-2">CV Based</h3>
                <p className="text-sm text-muted-foreground">Upload your resume for highly personalized questions.</p>
              </CardContent>
            </Card>

            <Card
              className={`cursor-pointer transition-all ${interviewType === "complete" ? "ring-2 ring-primary border-primary" : "hover:shadow-md"}`}
              onClick={() => setInterviewType("complete")}
            >
              <CardContent className="p-6 flex flex-col items-center text-center">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <Layers className="w-8 h-8 text-primary" />
                </div>
                <h3 className="font-semibold text-lg mb-2">Complete Interview</h3>
                <p className="text-sm text-muted-foreground">5 CV-based + 5 role-based questions for a full assessment.</p>
              </CardContent>
            </Card>

            <Card
              className={`cursor-pointer transition-all ${interviewType === "behavioral" ? "ring-2 ring-primary border-primary" : "hover:shadow-md"}`}
              onClick={() => {
                setInterviewType("behavioral");
                setTargetRole("Behavioral Interview");
              }}
            >
              <CardContent className="p-6 flex flex-col items-center text-center">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <UserCheck className="w-8 h-8 text-primary" />
                </div>
                <h3 className="font-semibold text-lg mb-2">Behavioral</h3>
                <p className="text-sm text-muted-foreground">Focus on soft skills, situational questions, and STAR method.</p>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {step === "cv_setup" && (
        <div className="space-y-6">
          <h2 className="text-xl font-semibold mb-2">Provide your CV Context</h2>
          
          <div className="grid md:grid-cols-2 gap-4">
            <Card className="border-dashed cursor-pointer hover:bg-muted/50 transition-colors relative">
              <input
                type="file"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                accept=".pdf"
                onChange={handleResumeUpload}
                disabled={isUploading || parseResumeMutation.isPending}
              />
              <CardContent className="p-6 flex flex-col items-center text-center">
                 {isUploading || parseResumeMutation.isPending ? (
                    <Loader2 className="w-8 h-8 text-primary animate-spin mb-4" />
                 ) : (
                    <Upload className="w-8 h-8 text-primary mb-4" />
                 )}
                <h3 className="font-semibold">Upload PDF Resume</h3>
                <p className="text-xs text-muted-foreground mt-1">Our AI will extract your details instantly</p>
              </CardContent>
            </Card>

            <Card className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={loadProfileAsCV}>
              <CardContent className="p-6 flex flex-col items-center text-center">
                <User className="w-8 h-8 text-primary mb-4" />
                <h3 className="font-semibold">Use Profile Data</h3>
                <p className="text-xs text-muted-foreground mt-1">Populate from your saved Nexora profile</p>
              </CardContent>
            </Card>
          </div>

          {candidateData && (
            <Card className="bg-green-50/50 border-green-200">
              <CardContent className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-green-800 flex items-center gap-2">
                      <Check className="w-5 h-5" /> Extracted Successfully
                    </h3>
                    <p className="text-sm text-green-600 mt-1">Found {candidateData.skills?.length || 0} skills and {candidateData.work_experience?.length || 0} roles.</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={saveExtractedToProfile} disabled={updateProfileMutation.isPending}>
                    {updateProfileMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                    Save Info to DB
                  </Button>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <Label>Target Interview Role</Label>
                    <Input value={targetRole} onChange={(e) => setTargetRole(e.target.value)} placeholder="e.g. Frontend Developer" className="mt-1" />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {step === "complete_role" && (
        <div>
          <h2 className="text-xl font-semibold mb-2">Select Role for Technical Questions</h2>
          <p className="text-muted-foreground mb-6">The last 5 questions will be role-specific technical questions.</p>
          <div className="grid md:grid-cols-2 gap-4">
            {quizRoles.map((role) => {
              const IconComponent = role.icon;
              const isSelected = selectedQuizRole === role.id;
              return (
                <Card
                  key={role.id}
                  className={`cursor-pointer transition-all ${isSelected ? "ring-2 ring-primary border-primary" : "hover:shadow-md"}`}
                  onClick={() => setSelectedQuizRole(role.id)}
                >
                  <CardContent className="p-6">
                    <div className="flex items-start gap-4">
                      <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${isSelected ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"}`}>
                        <IconComponent className="w-6 h-6" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold mb-1">{role.label}</h3>
                      </div>
                      {isSelected && <Check className="w-5 h-5 text-primary" />}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {step === "domain" && (
        <div>
          <h2 className="text-xl font-semibold mb-2">Select Interview Domain</h2>
          {domainsLoading ? (
            <div className="grid md:grid-cols-2 gap-4">
              {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-32" />)}
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              {domains?.map((domain) => {
                const IconComponent = getIconComponent(domain);
                const isSelected = selectedDomain?.id === domain.id;
                return (
                  <Card
                    key={domain.id}
                    className={`cursor-pointer transition-all ${isSelected ? "ring-2 ring-primary border-primary" : "hover:shadow-md"}`}
                    onClick={() => setSelectedDomain(domain)}
                  >
                    <CardContent className="p-6">
                      <div className="flex items-start gap-4">
                        <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${isSelected ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"}`}>
                          <IconComponent className="w-6 h-6" />
                        </div>
                        <div className="flex-1">
                          <h3 className="font-semibold mb-1">{domain.name}</h3>
                          <p className="text-sm text-muted-foreground">{domain.description}</p>
                        </div>
                        {isSelected && <Check className="w-5 h-5 text-primary" />}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {step === "difficulty" && (
        <div>
          <h2 className="text-xl font-semibold mb-2">Select Difficulty Level</h2>
          <RadioGroup value={selectedDifficulty} onValueChange={setSelectedDifficulty} className="space-y-4">
            {difficulties.map((difficulty) => (
              <Card
                key={difficulty.id}
                className={`cursor-pointer transition-all ${selectedDifficulty === difficulty.id ? "ring-2 ring-primary border-primary" : "hover:shadow-md"}`}
                onClick={() => setSelectedDifficulty(difficulty.id)}
              >
                <CardContent className="p-6 flex items-center gap-4">
                  <RadioGroupItem value={difficulty.id} id={difficulty.id} />
                  <div className="flex-1">
                    <Label htmlFor={difficulty.id} className="font-semibold cursor-pointer">{difficulty.label}</Label>
                    <p className="text-sm text-muted-foreground mt-1">{difficulty.description}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </RadioGroup>
        </div>
      )}

      {step === "language" && (
        <div>
          <h2 className="text-xl font-semibold mb-2">Select Language</h2>
          <div className="grid md:grid-cols-2 gap-4 mt-4">
            {languages.map((lang) => (
              <Card
                key={lang.code}
                className={`cursor-pointer transition-all ${selectedLanguage === lang.code ? "ring-2 ring-primary border-primary" : "hover:shadow-md"}`}
                onClick={() => setSelectedLanguage(lang.code)}
              >
                <CardContent className="p-6 flex items-center gap-4">
                  <span className="text-3xl">{lang.flag}</span>
                  <div className="flex-1">
                    <h3 className="font-semibold">{lang.name}</h3>
                  </div>
                  {selectedLanguage === lang.code && <Check className="w-5 h-5 text-primary" />}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {step === "confirm" && (
        <div>
          <h2 className="text-xl font-semibold mb-6">Confirm Your Settings</h2>
          <Card className="mb-6">
            <CardContent className="p-6 space-y-4">
              <div className="flex justify-between border-b pb-4">
                <span className="text-muted-foreground">Interview Mode</span>
                <Badge>{interviewType === "complete" ? "Complete Interview" : interviewType === "behavioral" ? "Behavioral" : interviewType === "cv" ? "CV Based" : "Role Based"}</Badge>
              </div>
              {interviewType === "complete" ? (
                <>
                  <div className="flex justify-between border-b pb-4">
                    <span className="text-muted-foreground">CV Target Role</span>
                    <span className="font-semibold">{targetRole}</span>
                  </div>
                  <div className="flex justify-between border-b pb-4">
                    <span className="text-muted-foreground">Technical Role</span>
                    <span className="font-semibold">{quizRoles.find(r => r.id === selectedQuizRole)?.label}</span>
                  </div>
                  <div className="flex justify-between border-b pb-4">
                    <span className="text-muted-foreground">Questions</span>
                    <span className="font-semibold">5 CV + 5 Role = 10 Total</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex justify-between border-b pb-4">
                    <span className="text-muted-foreground">Target Role</span>
                    <span className="font-semibold">
                      {interviewType === "cv" ? targetRole : selectedDomain?.name}
                    </span>
                  </div>
                  <div className="flex justify-between border-b pb-4">
                    <span className="text-muted-foreground">Difficulty</span>
                    <span className="font-semibold capitalize">{selectedDifficulty}</span>
                  </div>
                </>
              )}
              <div className="flex justify-between pb-2">
                <span className="text-muted-foreground">Language</span>
                <span className="font-semibold">
                  {languages.find(l => l.code === selectedLanguage)?.name}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="flex items-center justify-between mt-8 pt-6 border-t flex-wrap">
        <Button variant="outline" onClick={goBack} disabled={currentStepIndex === 0}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Back
        </Button>
        {step === "confirm" ? (
          <Button onClick={() => createSessionMutation.mutate()} disabled={createSessionMutation.isPending}>
            {createSessionMutation.isPending ? "Starting AI Engine..." : "Start Interview"}
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        ) : (
          <Button onClick={goNext} disabled={!canProceed()}>
            Continue <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        )}
      </div>
    </div>
  );
}
