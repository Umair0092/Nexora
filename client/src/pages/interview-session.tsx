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
  Square,
  CheckCircle,
  AlertCircle,
  Clock,
  Loader2,
  Volume2,
  VolumeX,
} from "lucide-react";

export default function InterviewSessionPage() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);

  const [currentQuestionText, setCurrentQuestionText] = useState("");
  const [questionsAsked, setQuestionsAsked] = useState(1);
  const [numQuestions, setNumQuestions] = useState(5);
  const [isComplete, setIsComplete] = useState(false);
  const [targetRole, setTargetRole] = useState("Role");

  const [isRecording, setIsRecording] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isMicOn, setIsMicOn] = useState(false);
  const [behaviorStatus, setBehaviorStatus] = useState<"good" | "warning">("good");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);

  // Fetch initial transcript directly from FastAPI
  const { data: transcriptData, isLoading } = useQuery<any>({
    queryKey: [`/api/ai/v1/interviews/${params.id}/transcript`],
    queryFn: async () => {
      const res = await fetch(`/api/ai/v1/interviews/${params.id}/transcript`);
      if (!res.ok) throw new Error("Could not fetch session");
      return res.json();
    },
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (transcriptData && transcriptData.conversation) {
      const conv = transcriptData.conversation;
      const lastQ = conv.filter((msg: any) => msg.role === "interviewer").pop();
      if (lastQ) {
        setCurrentQuestionText(lastQ.content);
        speakQuestion(lastQ.content);
      }
      setQuestionsAsked(transcriptData.questions_asked);
      setNumQuestions(transcriptData.num_questions);
      setIsComplete(transcriptData.is_complete);
      setTargetRole(transcriptData.target_role);
    }
  }, [transcriptData]);

  // Submission mutation to FastAPI
  const submitAnswerMutation = useMutation({
    mutationFn: async (answerText: string) => {
      const res = await fetch(`/api/ai/v1/interviews/${params.id}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer: answerText }),
      });
      if (!res.ok) throw new Error("Failed to submit answer");
      return res.json();
    },
    onSuccess: (data) => {
      if (data.is_complete) {
        setIsComplete(true);
        syncToRailsMutation.mutate();
      } else {
        setCurrentQuestionText(data.next_question);
        setQuestionsAsked(data.questions_asked);
        // Speak next question
        speakQuestion(data.next_question);
      }
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to submit answer. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Sync to Rails mutation
  const syncToRailsMutation = useMutation({
    mutationFn: async () => {
      // First, get the evaluation from FastAPI
      const evalRes = await fetch(`/api/ai/v1/interviews/${params.id}/evaluate`);
      if (!evalRes.ok) throw new Error("Failed to evaluate AI session");
      const evalData = await evalRes.json();

      // Get the transcript
      const transRes = await fetch(`/api/ai/v1/interviews/${params.id}/transcript`);
      const transData = await transRes.json();

      // Post both to Rails to create the Dashboard history
      const syncRes = await apiRequest("POST", "/api/v1/sessions/sync_ai_session", {
        sessionId: params.id,
        evaluation: evalData,
        transcript: transData
      });
      return syncRes.json();
    },
    onSuccess: (syncData) => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/sessions"] });
      setLocation(`/report/${syncData.report_id}`); // Route to the Rails report
    },
    onError: () => {
      toast({
        title: "Evaluation Sync Error",
        description: "Your session finished but failed to sync to Dashboard.",
        variant: "destructive",
      });
    }
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
    if (!mediaStreamRef.current) return;
    try {
      const recorder = new MediaRecorder(mediaStreamRef.current);
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } catch (e) {
      console.error("MediaRecorder start failed", e);
    }
  }, []);

  const stopRecordingAndGetBlob = (): Promise<Blob | null> => {
    return new Promise((resolve) => {
      if (!mediaRecorderRef.current || mediaRecorderRef.current.state === "inactive") {
        resolve(null);
        return;
      }

      mediaRecorderRef.current.onstop = () => {
        setIsRecording(false);
        if (audioChunksRef.current.length > 0) {
          resolve(new Blob(audioChunksRef.current));
        } else {
          resolve(null);
        }
      };

      mediaRecorderRef.current.stop();
    });
  };

  const stopSpeaking = useCallback(() => {
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }, []);

  const speakQuestion = useCallback((text: string) => {
    stopSpeaking();
    if (!text) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
  }, [stopSpeaking]);

  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      stopSpeaking();
    };
  }, [startCamera, stopCamera, stopSpeaking]);

  useEffect(() => {
    if (isCameraOn && !isRecording && !isSpeaking) {
      startRecording();
    }
  }, [isCameraOn, isRecording, isSpeaking, startRecording]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isRecording) {
      timer = setInterval(() => setElapsedTime(prev => prev + 1), 1000);
    }
    return () => clearInterval(timer);
  }, [isRecording]);

  const handleNextQuestion = async () => {
    if (isSubmitting || syncToRailsMutation.isPending) return;
    setIsSubmitting(true);
    stopSpeaking();

    const audioBlob = await stopRecordingAndGetBlob();
    let text = "No response recorded";

    if (audioBlob) {
       try {
          const formData = new FormData();
          formData.append("file", audioBlob, "answer.webm");
          const res = await fetch("/api/ai/v1/transcribe", { method: "POST", body: formData });
          const data = await res.json();
          if (data.text) text = data.text;
       } catch (e) {
          console.error(e);
       }
    }

    try {
      await submitAnswerMutation.mutateAsync(text);
      setElapsedTime(0);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEndSession = async () => {
    if (isSubmitting || syncToRailsMutation.isPending) return;
    setIsSubmitting(true);
    stopSpeaking();

    const audioBlob = await stopRecordingAndGetBlob();
    stopCamera();

    let text = "No response recorded";
    if (audioBlob) {
       try {
          const formData = new FormData();
          formData.append("file", audioBlob, "answer.webm");
          const res = await fetch("/api/ai/v1/transcribe", { method: "POST", body: formData });
          const data = await res.json();
          if (data.text) text = data.text;
       } catch (e) {}
    }

    await submitAnswerMutation.mutateAsync(text);
    
    // Evaluate if we didn't naturally hit is_complete
    if (!isComplete && !syncToRailsMutation.isPending) {
      syncToRailsMutation.mutate();
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  if (isLoading || syncToRailsMutation.isPending) {
    return (
      <div className="p-6 lg:p-8 max-w-7xl mx-auto text-center py-20">
        <Loader2 className="w-12 h-12 text-primary animate-spin mx-auto mb-4" />
        <h2 className="text-xl font-semibold">
          {syncToRailsMutation.isPending ? "Generating your AI Evaluation Scorecard..." : "Loading Interview Session..."}
        </h2>
      </div>
    );
  }

  if (!transcriptData) {
    return (
      <div className="p-6 lg:p-8 max-w-7xl mx-auto text-center py-20">
        <h1 className="text-2xl font-bold mb-4">Session Not Found</h1>
        <Button onClick={() => setLocation("/dashboard")}>Return to Dashboard</Button>
      </div>
    );
  }

  const progress = (questionsAsked / numQuestions) * 100;
  const isLastQuestion = questionsAsked >= numQuestions;

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold mb-1">
            {targetRole} Interview
          </h1>
          <div className="flex items-center gap-3 flex-wrap">
            <Badge variant="secondary">AI Assisted</Badge>
            <span className="text-sm text-muted-foreground">
              Question {questionsAsked} of {numQuestions}
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
            disabled={syncToRailsMutation.isPending || isSubmitting}
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
                className={`absolute top-4 right-4 flex items-center gap-2 px-3 py-2 rounded-full text-sm font-medium transition-colors ${
                  behaviorStatus === "good" ? "bg-green-500/90 text-white" : "bg-red-500/90 text-white animate-pulse"
                }`}
              >
                {behaviorStatus === "good" ? <><CheckCircle className="w-4 h-4" /> Good posture</> : <><AlertCircle className="w-4 h-4" /> Adjust posture</>}
              </div>

              <div className="absolute bottom-4 left-4 flex items-center gap-2">
                <Button
                  size="icon"
                  variant={isCameraOn ? "secondary" : "destructive"}
                  onClick={() => isCameraOn ? stopCamera() : startCamera()}
                >
                  {isCameraOn ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
                </Button>
                <Button
                  size="icon"
                  variant={isMicOn ? "secondary" : "destructive"}
                  onClick={() => setIsMicOn(!isMicOn)}
                >
                  {isMicOn ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                </Button>
              </div>

              {isRecording && !isSpeaking && (
                <div className="absolute bottom-4 right-4 flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-500 text-white text-xs font-medium">
                  <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                  Recording
                </div>
              )}
               {isSpeaking && (
                <div className="absolute bottom-4 right-4 flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500 text-white text-xs font-medium">
                  <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                  AI Speaking
                </div>
              )}
            </div>
          </Card>

          <Card className="mt-4">
            <CardContent className="p-4">
              <h3 className="font-semibold mb-2 text-sm">Recording Status</h3>
              <div className="h-32 flex items-center justify-center text-sm text-muted-foreground bg-muted/30 rounded-lg p-3">
                {isSubmitting ? (
                  <div className="text-center">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-primary" />
                    <p>Transcribing & Analyzing with AI...</p>
                  </div>
                ) : isRecording ? (
                  <div className="text-center w-full">
                    <div className="flex gap-1 justify-center mb-3 items-end h-8">
                       <span className="w-1.5 h-3 bg-red-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                       <span className="w-1.5 h-5 bg-red-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                       <span className="w-1.5 h-8 bg-red-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                       <span className="w-1.5 h-5 bg-red-500 rounded-full animate-bounce" style={{ animationDelay: '450ms' }} />
                       <span className="w-1.5 h-3 bg-red-400 rounded-full animate-bounce" style={{ animationDelay: '600ms' }} />
                    </div>
                    <p className="text-red-500 font-medium">Listening to your answer...</p>
                    <p className="text-xs mt-1">Click Submit when finished</p>
                  </div>
                ) : (
                  <span className="italic">Waiting for question...</span>
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
                  Question {questionsAsked}
                </Badge>
                <div className="flex items-start gap-4 mb-6">
                  <h2 className="text-2xl font-semibold flex-1">
                    {currentQuestionText || "Loading question..."}
                  </h2>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => isSpeaking ? stopSpeaking() : speakQuestion(currentQuestionText)}
                  >
                    {isSpeaking ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                  </Button>
                </div>

                <div className="bg-muted/30 rounded-lg p-4 mb-6">
                  <h4 className="text-sm font-medium mb-2">Tips</h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>The AI listens fully to your response</li>
                    <li>Wait for it to finish speaking before answering</li>
                    <li>Maintain eye contact with the camera</li>
                  </ul>
                </div>
              </div>

              <div className="flex items-center justify-between gap-4 pt-6 border-t flex-wrap">
                <p className="text-sm text-muted-foreground">
                  {isLastQuestion
                    ? "This is the last question"
                    : `${numQuestions - questionsAsked} questions remaining`}
                </p>
                <Button
                  size="lg"
                  onClick={handleNextQuestion}
                  disabled={isSubmitting || syncToRailsMutation.isPending || elapsedTime < 2}
                >
                  {isSubmitting || syncToRailsMutation.isPending ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Processing...</>
                  ) : isLastQuestion ? (
                    <>Finish Interview <CheckCircle className="w-4 h-4 ml-2" /></>
                  ) : (
                    <>Submit & Next <ArrowRight className="w-4 h-4 ml-2" /></>
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
