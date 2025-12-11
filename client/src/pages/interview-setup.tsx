import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
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

const difficulties = [
  { id: "beginner", label: "Beginner", description: "Basic questions for entry-level positions" },
  { id: "intermediate", label: "Intermediate", description: "Standard interview questions" },
  { id: "advanced", label: "Advanced", description: "Challenging questions for senior roles" },
];

const languages = [
  { code: "en", name: "English", flag: "🇺🇸" },
  { code: "ur", name: "Urdu", flag: "🇵🇰" },
  { code: "fr", name: "French", flag: "🇫🇷" },
  { code: "es", name: "Spanish", flag: "🇪🇸" },
];

type Step = "domain" | "difficulty" | "language" | "confirm";

export default function InterviewSetup() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [step, setStep] = useState<Step>("domain");
  const [selectedDomain, setSelectedDomain] = useState<Domain | null>(null);
  const [selectedDifficulty, setSelectedDifficulty] = useState("intermediate");
  const [selectedLanguage, setSelectedLanguage] = useState("en");

  const { data: domains, isLoading: domainsLoading } = useQuery<Domain[]>({
    queryKey: ["/api/v1/domains"],
  });

  const createSessionMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/v1/sessions", {
        domainId: selectedDomain?.id,
        difficulty: selectedDifficulty,
        language: selectedLanguage,
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/sessions"] });
      setLocation(`/interview/session/${data.id}`);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to start interview session. Please try again.",
        variant: "destructive",
      });
    },
  });

  const steps: Step[] = ["domain", "difficulty", "language", "confirm"];
  const currentStepIndex = steps.indexOf(step);

  const goNext = () => {
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
      case "domain":
        return selectedDomain !== null;
      case "difficulty":
        return selectedDifficulty !== "";
      case "language":
        return selectedLanguage !== "";
      default:
        return true;
    }
  };

  const getIconComponent = (domain: Domain) => {
    const iconKey = domain.name.toLowerCase().replace(/\s+/g, "-");
    const IconComponent = domainIcons[iconKey] || Briefcase;
    return IconComponent;
  };

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Interview Setup</h1>
        <p className="text-muted-foreground">
          Configure your practice session preferences
        </p>
      </div>

      <div className="mb-8">
        <div className="flex items-center justify-between gap-2">
          {steps.map((s, index) => (
            <div key={s} className="flex items-center flex-1">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm transition-colors ${index <= currentStepIndex
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
                  }`}
              >
                {index < currentStepIndex ? (
                  <Check className="w-5 h-5" />
                ) : (
                  index + 1
                )}
              </div>
              {index < steps.length - 1 && (
                <div
                  className={`flex-1 h-1 mx-2 rounded transition-colors ${index < currentStepIndex ? "bg-primary" : "bg-muted"
                    }`}
                />
              )}
            </div>
          ))}
        </div>
        <div className="flex justify-between mt-2 text-xs text-muted-foreground">
          <span>Domain</span>
          <span>Difficulty</span>
          <span>Language</span>
          <span>Confirm</span>
        </div>
      </div>

      {step === "domain" && (
        <div>
          <h2 className="text-xl font-semibold mb-2">Select Interview Domain</h2>
          <p className="text-muted-foreground mb-6">
            Choose the field you want to practice for
          </p>

          {domainsLoading ? (
            <div className="grid md:grid-cols-2 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-32" />
              ))}
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              {domains?.map((domain) => {
                const IconComponent = getIconComponent(domain);
                const isSelected = selectedDomain?.id === domain.id;

                return (
                  <Card
                    key={domain.id}
                    className={`cursor-pointer transition-all ${isSelected
                      ? "ring-2 ring-primary border-primary"
                      : "hover-elevate"
                      }`}
                    onClick={() => setSelectedDomain(domain)}
                    data-testid={`card-domain-${domain.id}`}
                  >
                    <CardContent className="p-6">
                      <div className="flex items-start gap-4">
                        <div
                          className={`w-12 h-12 rounded-lg flex items-center justify-center ${isSelected
                            ? "bg-primary text-primary-foreground"
                            : "bg-primary/10 text-primary"
                            }`}
                        >
                          <IconComponent className="w-6 h-6" />
                        </div>
                        <div className="flex-1">
                          <h3 className="font-semibold mb-1">{domain.name}</h3>
                          <p className="text-sm text-muted-foreground">
                            {domain.description || "Practice interview questions"}
                          </p>
                          {domain.questionCount && domain.questionCount > 0 && (
                            <Badge variant="secondary" className="mt-2 text-xs">
                              {domain.questionCount} questions
                            </Badge>
                          )}
                        </div>
                        {isSelected && (
                          <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                            <Check className="w-4 h-4" />
                          </div>
                        )}
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
          <p className="text-muted-foreground mb-6">
            Choose the complexity of interview questions
          </p>

          <RadioGroup
            value={selectedDifficulty}
            onValueChange={setSelectedDifficulty}
            className="space-y-4"
          >
            {difficulties.map((difficulty) => (
              <Card
                key={difficulty.id}
                className={`cursor-pointer transition-all ${selectedDifficulty === difficulty.id
                  ? "ring-2 ring-primary border-primary"
                  : "hover-elevate"
                  }`}
                onClick={() => setSelectedDifficulty(difficulty.id)}
                data-testid={`card-difficulty-${difficulty.id}`}
              >
                <CardContent className="p-6">
                  <div className="flex items-center gap-4">
                    <RadioGroupItem value={difficulty.id} id={difficulty.id} />
                    <div className="flex-1">
                      <Label htmlFor={difficulty.id} className="font-semibold cursor-pointer">
                        {difficulty.label}
                      </Label>
                      <p className="text-sm text-muted-foreground mt-1">
                        {difficulty.description}
                      </p>
                    </div>
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
          <p className="text-muted-foreground mb-6">
            Choose your preferred language for speech recognition
          </p>

          <div className="grid md:grid-cols-2 gap-4">
            {languages.map((lang) => (
              <Card
                key={lang.code}
                className={`cursor-pointer transition-all ${selectedLanguage === lang.code
                  ? "ring-2 ring-primary border-primary"
                  : "hover-elevate"
                  }`}
                onClick={() => setSelectedLanguage(lang.code)}
                data-testid={`card-language-${lang.code}`}
              >
                <CardContent className="p-6">
                  <div className="flex items-center gap-4">
                    <span className="text-3xl">{lang.flag}</span>
                    <div className="flex-1">
                      <h3 className="font-semibold">{lang.name}</h3>
                    </div>
                    {selectedLanguage === lang.code && (
                      <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                        <Check className="w-4 h-4" />
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {step === "confirm" && (
        <div>
          <h2 className="text-xl font-semibold mb-2">Confirm Your Settings</h2>
          <p className="text-muted-foreground mb-6">
            Review your selections before starting the interview
          </p>

          <Card className="mb-6">
            <CardContent className="p-6">
              <div className="space-y-6">
                <div className="flex items-center justify-between gap-4 pb-4 border-b">
                  <span className="text-muted-foreground">Domain</span>
                  <div className="flex items-center gap-2">
                    {selectedDomain && (() => {
                      const IconComponent = getIconComponent(selectedDomain);
                      return (
                        <>
                          <IconComponent className="w-5 h-5 text-primary" />
                          <span className="font-semibold">{selectedDomain.name}</span>
                        </>
                      );
                    })()}
                  </div>
                </div>
                <div className="flex items-center justify-between gap-4 pb-4 border-b">
                  <span className="text-muted-foreground">Difficulty</span>
                  <Badge variant="secondary">
                    {difficulties.find((d) => d.id === selectedDifficulty)?.label}
                  </Badge>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Language</span>
                  <div className="flex items-center gap-2">
                    <span>{languages.find((l) => l.code === selectedLanguage)?.flag}</span>
                    <span className="font-semibold">
                      {languages.find((l) => l.code === selectedLanguage)?.name}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-muted/50 border-dashed">
            <CardContent className="p-6">
              <h3 className="font-semibold mb-2">Before You Start</h3>
              <ul className="text-sm text-muted-foreground space-y-2">
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-500 mt-0.5" />
                  Ensure your webcam and microphone are working
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-500 mt-0.5" />
                  Find a quiet place with good lighting
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-500 mt-0.5" />
                  Allow browser permissions for camera and audio
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="flex items-center justify-between gap-4 mt-8 pt-6 border-t flex-wrap">
        <Button
          variant="outline"
          onClick={goBack}
          disabled={currentStepIndex === 0}
          data-testid="button-back"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>

        {step === "confirm" ? (
          <Button
            onClick={() => createSessionMutation.mutate()}
            disabled={createSessionMutation.isPending}
            data-testid="button-start-session"
          >
            {createSessionMutation.isPending ? "Starting..." : "Start Interview"}
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        ) : (
          <Button onClick={goNext} disabled={!canProceed()} data-testid="button-next">
            Continue
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        )}
      </div>
    </div>
  );
}
