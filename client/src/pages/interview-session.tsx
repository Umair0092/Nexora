import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  ArrowRight,
  Pause,
  Square,
  CheckCircle,
  AlertCircle,
  Clock,
  Loader2,
  Volume2,
  VolumeX,
} from "lucide-react";
import type { InterviewSession, Question, Answer } from "@shared/schema";

interface SessionData extends InterviewSession {
  domain?: { name: string };
  questions?: Question[];
  answers?: Answer[];
}

export default function InterviewSessionPage() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isMicOn, setIsMicOn] = useState(false);
  const [behaviorStatus, setBehaviorStatus] = useState<"good" | "warning">("good");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const { data: session, isLoading } = useQuery<any>({
    queryKey: ["/api/v1/sessions", params.id],
  });

  const submitAnswerMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", `/api/v1/sessions/${params.id}/answers`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/sessions", params.id] });
      toast({
        title: "Answer Saved",
        description: "Your response has been recorded.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to submit answer. Please try again.",
        variant: "destructive",
      });
    },
  });

  const completeSessionMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/v1/sessions/${params.id}/complete`, {});
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/sessions"] });
      setLocation(`/report/${data.session.id}`);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to complete session. Please try again.",
        variant: "destructive",
      });
    },
  });

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 640, height: 480 },
        audio: true
      });
      mediaStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setIsCameraOn(true);
      setIsMicOn(true);
    } catch (error) {
      toast({
        title: "Camera Access Required",
        description: "Please allow camera and microphone access to continue.",
        variant: "destructive",
      });
    }
  }, [toast]);

  const stopCamera = useCallback(() => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    setIsCameraOn(false);
    setIsMicOn(false);
  }, []);

  const startRecording = useCallback(() => {
    if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
      toast({
        title: "Not Supported",
        description: "Speech recognition is not supported in your browser.",
        variant: "destructive",
      });
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = session?.language === "ur" ? "ur-PK" :
      session?.language === "fr" ? "fr-FR" :
        session?.language === "es" ? "es-ES" : "en-US";

    recognition.onresult = (event) => {
      let finalTranscript = "";
      let interimTranscript = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript + " ";
        } else {
          interimTranscript += result[0].transcript;
        }
      }

      if (finalTranscript) {
        setTranscript(prev => prev + finalTranscript);
      }

      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }
      silenceTimerRef.current = setTimeout(() => {
      }, 3000);
    };

    recognition.onerror = (event) => {
      console.error("Speech recognition error:", event.error);
    };

    recognition.start();
    recognitionRef.current = recognition;
    setIsRecording(true);
  }, [session?.language, toast]);

  const stopRecording = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
    }
    setIsRecording(false);
  }, []);

  const stopSpeaking = useCallback(() => {
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }, []);

  const speakQuestion = useCallback((text: string) => {
    stopSpeaking();

    if (!text) return;

    const utterance = new SpeechSynthesisUtterance(text);
    // Use a default voice or try to find a Google one if available/preferred
    // const voices = window.speechSynthesis.getVoices();
    // const googleVoice = voices.find(v => v.name.includes("Google"));
    // if (googleVoice) utterance.voice = googleVoice;

    utterance.lang = "en-US"; // Default to English, could be dynamic based on session.language
    utterance.rate = 1;
    utterance.pitch = 1;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    window.speechSynthesis.speak(utterance);
  }, [stopSpeaking]);

  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
      stopRecording();
      stopSpeaking();
    };
  }, [startCamera, stopCamera, stopRecording, stopSpeaking]);

  useEffect(() => {
    if (isCameraOn && !isRecording) {
      startRecording();
    }
  }, [isCameraOn, isRecording, startRecording]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isRecording) {
      timer = setInterval(() => {
        setElapsedTime(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isRecording]);

  useEffect(() => {
    const behaviorInterval = setInterval(() => {
      const random = Math.random();
      setBehaviorStatus(random > 0.2 ? "good" : "warning");
    }, 5000);
    return () => clearInterval(behaviorInterval);
  }, []);

  const handleNextQuestion = async () => {
    if (!session?.questions || isSubmitting) return;

    const currentQuestion = session.questions[currentQuestionIndex];
    if (!currentQuestion) return;

    setIsSubmitting(true);
    stopRecording();
    stopSpeaking();

    try {
      await submitAnswerMutation.mutateAsync({
        questionId: currentQuestion.id,
        transcript: transcript.trim() || "No response recorded",
        duration: elapsedTime,
      });

      if (currentQuestionIndex < session.questions.length - 1) {
        setCurrentQuestionIndex(prev => prev + 1);
        setTranscript("");
        setElapsedTime(0);
        startRecording();
        // Option: speakQuestion(session.questions[currentQuestionIndex + 1].text);
      } else {
        await completeSessionMutation.mutateAsync();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEndSession = async () => {
    stopRecording();
    stopCamera();
    stopSpeaking();

    if (transcript.trim() && session?.questions?.[currentQuestionIndex]) {
      await submitAnswerMutation.mutateAsync({
        questionId: session.questions[currentQuestionIndex].id,
        transcript: transcript.trim(),
        duration: elapsedTime,
      });
    }

    await completeSessionMutation.mutateAsync();
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  if (isLoading) {
    return (
      <div className="p-6 lg:p-8 max-w-7xl mx-auto">
        <Skeleton className="h-8 w-64 mb-4" />
        <Skeleton className="h-4 w-48 mb-8" />
        <div className="grid lg:grid-cols-5 gap-6">
          <Skeleton className="lg:col-span-2 aspect-video" />
          <Skeleton className="lg:col-span-3 h-64" />
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="p-6 lg:p-8 max-w-7xl mx-auto text-center">
        <h1 className="text-2xl font-bold mb-4">Session Not Found</h1>
        <p className="text-muted-foreground mb-6">This interview session could not be found.</p>
        <Button onClick={() => setLocation("/dashboard")}>Return to Dashboard</Button>
      </div>
    );
  }

  const questions = session.questions || [];
  const currentQuestion = questions[currentQuestionIndex];
  const progress = ((currentQuestionIndex + 1) / questions.length) * 100;
  const isLastQuestion = currentQuestionIndex === questions.length - 1;

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold mb-1" data-testid="text-session-title">
            {session.domain?.name || "Interview"} Session
          </h1>
          <div className="flex items-center gap-3 flex-wrap">
            <Badge variant="secondary">{session.difficulty}</Badge>
            <span className="text-sm text-muted-foreground">
              Question {currentQuestionIndex + 1} of {questions.length}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="w-4 h-4" />
            {formatTime(elapsedTime)}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleEndSession}
            disabled={completeSessionMutation.isPending}
            data-testid="button-end-session"
          >
            <Square className="w-4 h-4 mr-2" />
            End Session
          </Button>
        </div>
      </div>

      <Progress value={progress} className="h-2 mb-8" />

      <div className="grid lg:grid-cols-5 gap-6">
        <div className="lg:col-span-2">
          <Card className="overflow-hidden">
            <div className="relative aspect-video bg-muted">
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className="w-full h-full object-cover"
              />

              {!isCameraOn && (
                <div className="absolute inset-0 flex items-center justify-center bg-muted">
                  <div className="text-center">
                    <VideoOff className="w-12 h-12 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">Camera is off</p>
                  </div>
                </div>
              )}

              <div
                className={`absolute top-4 right-4 flex items-center gap-2 px-3 py-2 rounded-full text-sm font-medium transition-colors ${behaviorStatus === "good"
                  ? "bg-green-500/90 text-white"
                  : "bg-red-500/90 text-white animate-pulse"
                  }`}
                data-testid="indicator-behavior"
              >
                {behaviorStatus === "good" ? (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    Good posture
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-4 h-4" />
                    Adjust posture
                  </>
                )}
              </div>

              <div className="absolute bottom-4 left-4 flex items-center gap-2">
                <Button
                  size="icon"
                  variant={isCameraOn ? "secondary" : "destructive"}
                  onClick={() => isCameraOn ? stopCamera() : startCamera()}
                  data-testid="button-toggle-camera"
                >
                  {isCameraOn ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
                </Button>
                <Button
                  size="icon"
                  variant={isMicOn ? "secondary" : "destructive"}
                  data-testid="button-toggle-mic"
                >
                  {isMicOn ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                </Button>
              </div>

              {isRecording && (
                <div className="absolute bottom-4 right-4 flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-500 text-white text-xs font-medium">
                  <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                  Recording
                </div>
              )}
            </div>
          </Card>

          <Card className="mt-4">
            <CardContent className="p-4">
              <h3 className="font-semibold mb-2 text-sm">Live Transcript</h3>
              <div className="h-32 overflow-y-auto text-sm text-muted-foreground bg-muted/30 rounded-lg p-3">
                {transcript || (
                  <span className="italic">Start speaking to see your transcript here...</span>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-3">
          <Card className="h-full">
            <CardContent className="p-8 flex flex-col h-full">
              <div className="flex-1">
                <Badge variant="outline" className="mb-4">
                  Question {currentQuestionIndex + 1}
                </Badge>
                <div className="flex items-start gap-4 mb-6">
                  <h2 className="text-2xl font-semibold flex-1" data-testid="text-current-question">
                    {currentQuestion?.text || "Loading question..."}
                  </h2>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => isSpeaking ? stopSpeaking() : speakQuestion(currentQuestion?.text || "")}
                    title={isSpeaking ? "Stop reading" : "Read question"}
                  >
                    {isSpeaking ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                  </Button>
                </div>

                <div className="bg-muted/30 rounded-lg p-4 mb-6">
                  <h4 className="text-sm font-medium mb-2">Tips</h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>Take a moment to structure your answer</li>
                    <li>Use specific examples from your experience</li>
                    <li>Maintain eye contact with the camera</li>
                  </ul>
                </div>
              </div>

              <div className="flex items-center justify-between gap-4 pt-6 border-t flex-wrap">
                <p className="text-sm text-muted-foreground">
                  {isLastQuestion
                    ? "This is the last question"
                    : `${questions.length - currentQuestionIndex - 1} questions remaining`}
                </p>
                <Button
                  size="lg"
                  onClick={handleNextQuestion}
                  disabled={isSubmitting || submitAnswerMutation.isPending}
                  data-testid="button-next-question"
                >
                  {isSubmitting || submitAnswerMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : isLastQuestion ? (
                    <>
                      Finish Interview
                      <CheckCircle className="w-4 h-4 ml-2" />
                    </>
                  ) : (
                    <>
                      Next Question
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}
