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

  // Get interview type and language from URL query params
  const searchParams = new URLSearchParams(window.location.search);
  const interviewType = searchParams.get('type') || 'cv'; // 'role', 'cv', or 'complete'
  const isRoleBased = interviewType === 'role';
  const isCompleteMode = interviewType === 'complete';
  const quizSessionId = searchParams.get('quizSessionId') || '';
  const interviewLang = searchParams.get('lang') || 'en'; // 'en' or 'ur'

  // For complete interview: track which phase we're in
  const [completePhase, setCompletePhase] = useState<'cv' | 'role'>('cv');
  const [cvPhaseComplete, setCvPhaseComplete] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const [currentQuestionText, setCurrentQuestionText] = useState("");
  const [questionsAsked, setQuestionsAsked] = useState(1);
  const [numQuestions, setNumQuestions] = useState(5);
  const [isComplete, setIsComplete] = useState(false);
  const [targetRole, setTargetRole] = useState("Role");

  const [isRecording, setIsRecording] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isMicOn, setIsMicOn] = useState(false);
  const [behaviorStatus, setBehaviorStatus] = useState<"good" | "warning">("good");
  const [attentionScore, setAttentionScore] = useState<number | null>(null);
  const [attentionState, setAttentionState] = useState<string>("ATTENTIVE");
  const nonverbalReportRef = useRef<any>(null);

  // Nonverbal refs
  const wsRef = useRef<WebSocket | null>(null);
  const frameIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);

  // Fetch initial transcript - use different API based on interview type
  // For complete mode, start with CV session (phase 1)
  const { data: transcriptData, isLoading } = useQuery<any>({
    queryKey: [
      isCompleteMode
        ? (completePhase === 'cv' ? `/api/ai/v1/interviews/${params.id}/transcript` : `/api/quiz/${quizSessionId}/transcript`)
        : isRoleBased ? `/api/quiz/${params.id}/transcript` : `/api/ai/v1/interviews/${params.id}/transcript`
    ],
    queryFn: async () => {
      let endpoint: string;
      if (isCompleteMode) {
        endpoint = completePhase === 'cv'
          ? `/api/ai/v1/interviews/${params.id}/transcript`
          : `/api/quiz/${quizSessionId}/transcript`;
      } else {
        endpoint = isRoleBased
          ? `/api/quiz/${params.id}/transcript`
          : `/api/ai/v1/interviews/${params.id}/transcript`;
      }
      const res = await fetch(endpoint);
      if (!res.ok) throw new Error("Could not fetch session");
      return res.json();
    },
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!transcriptData) return;

    // Determine if we should parse as quiz format
    const useQuizFormat = isRoleBased || (isCompleteMode && completePhase === 'role');

    if (useQuizFormat) {
      // Quiz API format
      const trans = transcriptData.transcript || [];
      const currentQ = trans[transcriptData.questions_asked] || trans[trans.length - 1];
      if (currentQ && currentQ.question) {
        setCurrentQuestionText(currentQ.question);
        if (!currentQuestionText) {
          speakQuestion(currentQ.question);
        }
      }
      const asked = transcriptData.is_complete ? transcriptData.questions_asked : transcriptData.questions_asked + 1;
      // In complete mode phase 2, offset by 5 (CV questions already done)
      setQuestionsAsked(isCompleteMode ? asked + 5 : asked);
      setNumQuestions(isCompleteMode ? 10 : transcriptData.num_questions);
      setIsComplete(transcriptData.is_complete);
      setTargetRole(transcriptData.target_role);
    } else {
      // AI Interview API format (CV-based or complete mode phase 1)
      const conv = transcriptData.conversation;
      const lastQ = conv.filter((msg: any) => msg.role === "interviewer").pop();
      if (lastQ) {
        setCurrentQuestionText(lastQ.content);
        speakQuestion(lastQ.content);
      }
      setQuestionsAsked(transcriptData.questions_asked);
      setNumQuestions(isCompleteMode ? 10 : transcriptData.num_questions);
      setIsComplete(transcriptData.is_complete);
      setTargetRole(transcriptData.target_role);
    }
  }, [transcriptData, isRoleBased, isCompleteMode, completePhase]);

  // Submission mutation - use different API based on interview type
  const submitAnswerMutation = useMutation({
    mutationFn: async (answerText: string) => {
      let endpoint: string;
      if (isCompleteMode) {
        endpoint = completePhase === 'cv'
          ? `/api/ai/v1/interviews/${params.id}/answer`
          : `/api/quiz/${quizSessionId}/answer`;
      } else {
        endpoint = isRoleBased
          ? `/api/quiz/${params.id}/answer`
          : `/api/ai/v1/interviews/${params.id}/answer`;
      }

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer: answerText }),
      });
      if (!res.ok) throw new Error("Failed to submit answer");
      return res.json();
    },
    onSuccess: (data) => {
      if (data.is_complete) {
        if (isCompleteMode && completePhase === 'cv') {
          // CV phase done — transition to role-based phase
          setCvPhaseComplete(true);
          setCompletePhase('role');
          // Fetch the first quiz question from the quiz transcript
          fetch(`/api/quiz/${quizSessionId}/transcript`)
            .then(res => res.json())
            .then(quizData => {
              const trans = quizData.transcript || [];
              const firstQ = trans[0];
              if (firstQ && firstQ.question) {
                setCurrentQuestionText(firstQ.question);
                speakQuestion(firstQ.question);
              }
              setQuestionsAsked(6); // 5 CV done + 1st role question
              setIsComplete(false);
            });
        } else {
          setIsComplete(true);
          syncToRailsMutation.mutate();
        }
      } else {
        const nextQuestion = data.next_question;
        setCurrentQuestionText(nextQuestion);
        if (isCompleteMode) {
          if (completePhase === 'cv') {
            setQuestionsAsked(data.questions_asked);
          } else {
            setQuestionsAsked(data.questions_asked + 5); // offset by CV questions
          }
        } else {
          setQuestionsAsked(data.questions_asked);
        }
        speakQuestion(nextQuestion);
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

  // Nonverbal WebSocket connection
  const connectNonverbal = useCallback((sessionId: string) => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws/nonverbal`;
    const ws = new WebSocket(wsUrl);
    ws.onopen = () => {
      frameIntervalRef.current = setInterval(() => {
        if (!videoRef.current || !canvasRef.current || ws.readyState !== WebSocket.OPEN) return;
        const ctx = canvasRef.current.getContext("2d");
        canvasRef.current.width = 320;
        canvasRef.current.height = 240;
        ctx?.drawImage(videoRef.current, 0, 0, 320, 240);
        const b64 = canvasRef.current.toDataURL("image/jpeg", 0.7).split(",")[1];
        ws.send(JSON.stringify({ type: "frame", sessionId, timestamp: Date.now() / 1000, frameData: b64 }));
      }, 500);
    };
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === "result") {
        if (msg.faceDetected) {
          setAttentionScore(msg.attentionScore);
          setAttentionState(msg.attentionState);
          setBehaviorStatus(msg.attentionState === "ATTENTIVE" ? "good" : "warning");
        } else {
          setAttentionState("DISENGAGED");
          setBehaviorStatus("warning");
        }
      }
      if (msg.type === "session_report") {
        nonverbalReportRef.current = msg;
      }
    };
    ws.onerror = () => {
        console.warn("Nonverbal WS connection failed");
    };
    wsRef.current = ws;
  }, []);

  const endNonverbalSession = (sessionId: string): Promise<void> => {
    return new Promise((resolve) => {
      if (frameIntervalRef.current) clearInterval(frameIntervalRef.current);
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        resolve();
        return;
      }
      // Override onmessage to catch the session_report then resolve
      const prevOnMessage = ws.onmessage;
      const timeout = setTimeout(() => {
        ws.onmessage = prevOnMessage;
        resolve();
      }, 3000); // give server up to 3s to respond
      ws.onmessage = (e: MessageEvent) => {
        const msg = JSON.parse(e.data);
        if (msg.type === "session_report") {
          nonverbalReportRef.current = msg;
          clearTimeout(timeout);
          ws.onmessage = prevOnMessage;
          resolve();
        }
      };
      ws.send(JSON.stringify({ type: "end_session", sessionId }));
    });
  };

  // Sync to Rails mutation
  const syncToRailsMutation = useMutation({
    mutationFn: async () => {
      let evalData: any;
      let transData: any;

      if (isCompleteMode) {
        // Evaluate BOTH sessions and combine results
        const [cvEvalRes, quizEvalRes] = await Promise.all([
          fetch(`/api/ai/v1/interviews/${params.id}/evaluate`),
          fetch(`/api/quiz/${quizSessionId}/evaluate`),
        ]);
        if (!cvEvalRes.ok) throw new Error("Failed to evaluate CV session");
        if (!quizEvalRes.ok) throw new Error("Failed to evaluate quiz session");
        const cvEval = await cvEvalRes.json();
        const quizEval = await quizEvalRes.json();

        // Get both transcripts
        const [cvTransRes, quizTransRes] = await Promise.all([
          fetch(`/api/ai/v1/interviews/${params.id}/transcript`),
          fetch(`/api/quiz/${quizSessionId}/transcript`),
        ]);
        const cvTrans = await cvTransRes.json();
        const quizTrans = await quizTransRes.json();

        // Combine evaluations: merge per_question arrays, average scores
        const combinedPerQuestion = [
          ...(cvEval.per_question || []),
          ...(quizEval.per_question || []),
        ];
        evalData = {
          overall_score: Math.round((cvEval.overall_score + quizEval.overall_score) / 2),
          communication_score: Math.round((cvEval.communication_score + quizEval.communication_score) / 2),
          technical_score: Math.round((cvEval.technical_score + quizEval.technical_score) / 2),
          hire_recommendation: cvEval.hire_recommendation,
          top_strengths: [...(cvEval.top_strengths || []), ...(quizEval.top_strengths || [])].slice(0, 5),
          areas_to_improve: [...(cvEval.areas_to_improve || []), ...(quizEval.areas_to_improve || [])].slice(0, 5),
          summary: `CV Assessment: ${cvEval.summary || ''} Role Assessment: ${quizEval.summary || ''}`,
          recommendation_summary: cvEval.recommendation_summary || quizEval.recommendation_summary || '',
          improvement_points: [...(cvEval.improvement_points || []), ...(quizEval.improvement_points || [])].slice(0, 5),
          per_question: combinedPerQuestion,
        };

        // Combine transcripts — normalize quiz transcript to conversation format
        const quizAsConversation = (quizTrans.transcript || []).flatMap((entry: any) => [
          { role: "interviewer", content: entry.question },
          { role: "candidate", content: entry.answer || "" },
        ]);
        transData = {
          ...cvTrans,
          num_questions: 10,
          questions_asked: 10,
          conversation: [...(cvTrans.conversation || []), ...quizAsConversation],
        };

        console.log("Combined evaluation:", evalData);
      } else {
        // Standard single-session evaluation
        const evalEndpoint = isRoleBased
          ? `/api/quiz/${params.id}/evaluate`
          : `/api/ai/v1/interviews/${params.id}/evaluate`;

        console.log("Fetching evaluation from:", evalEndpoint);
        const evalRes = await fetch(evalEndpoint);
        if (!evalRes.ok) throw new Error("Failed to evaluate session");
        evalData = await evalRes.json();
        console.log("Evaluation data received:", evalData);

        const transEndpoint = isRoleBased
          ? `/api/quiz/${params.id}/transcript`
          : `/api/ai/v1/interviews/${params.id}/transcript`;
        const transRes = await fetch(transEndpoint);
        transData = await transRes.json();
        console.log("Transcript data received:", transData);
      }

      // End nonverbal session and wait for session_report to arrive
      await endNonverbalSession(params.id);
      // Close the WS now that we have the report
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      const finalNonverbal = nonverbalReportRef.current;

      console.log("Syncing to Rails with evaluation:", {
        overall_score: evalData.overall_score,
        communication_score: evalData.communication_score,
        technical_score: evalData.technical_score,
        per_question_count: evalData.per_question?.length || 0
      });

      // Post to Rails to create the Dashboard history
      const syncRes = await apiRequest("POST", "/api/v1/sessions/sync_ai_session", {
        sessionId: params.id,
        quizMode: isCompleteMode ? false : isRoleBased, // complete mode uses CV format for sync
        evaluation: evalData,
        transcript: transData,
        nonverbalReport: finalNonverbal
      });
      return syncRes.json();
    },
    onSuccess: (syncData) => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/sessions"] });
      setLocation(`/report/${syncData.report_id}`);
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
      connectNonverbal(params.id);
    } catch (error) {
      toast({
        title: "Camera Access Required",
        description: "Please allow camera and microphone access to continue.",
        variant: "destructive",
      });
    }
  }, [toast, connectNonverbal, params.id]);

  const stopCamera = useCallback(() => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    setIsCameraOn(false);
    setIsMicOn(false);
    if (frameIntervalRef.current) clearInterval(frameIntervalRef.current);
    if (wsRef.current) wsRef.current.close();
  }, []);

  const startRecording = useCallback(() => {
    if (!mediaStreamRef.current) {
      console.error("No media stream available");
      return;
    }
    
    // Check if audio tracks exist
    const audioTracks = mediaStreamRef.current.getAudioTracks();
    if (audioTracks.length === 0) {
      console.error("No audio tracks available in media stream");
      toast({
        title: "Microphone Error",
        description: "No audio tracks detected. Please check your microphone.",
        variant: "destructive",
      });
      return;
    }
    
    console.log("Audio tracks available:", audioTracks.map(t => ({
      label: t.label,
      enabled: t.enabled,
      muted: t.muted,
      readyState: t.readyState
    })));
    
    try {
      // Create a fresh MediaStream with only audio tracks for recording
      const audioOnlyStream = new MediaStream(audioTracks);
      console.log("Created audio-only stream");
      
      // Create MediaRecorder with NO options - let browser use defaults
      const recorder = new MediaRecorder(audioOnlyStream);
      audioChunksRef.current = [];
      
      console.log("MediaRecorder created, state:", recorder.state);

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          console.log("Audio chunk received, size:", e.data.size);
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onerror = (e) => {
        console.error("MediaRecorder error:", e);
      };

      recorder.onstart = () => {
        console.log("MediaRecorder started successfully");
        setIsRecording(true);
      };

      // Start with timeslice to collect data periodically
      console.log("Attempting to start MediaRecorder with timeslice...");
      recorder.start(1000);
      mediaRecorderRef.current = recorder;
    } catch (e) {
      console.error("MediaRecorder initialization failed:", e);
      
      // Try one more time with absolutely no options and no timeslice
      try {
        console.log("Retry: attempting basic MediaRecorder...");
        const audioTracks = mediaStreamRef.current.getAudioTracks();
        const audioOnlyStream = new MediaStream(audioTracks);
        const recorder = new MediaRecorder(audioOnlyStream);
        audioChunksRef.current = [];
        
        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            audioChunksRef.current.push(e.data);
          }
        };
        
        recorder.onstart = () => {
          console.log("MediaRecorder started (fallback mode)");
          setIsRecording(true);
        };
        
        // Start without ANY parameters
        recorder.start();
        mediaRecorderRef.current = recorder;
      } catch (e2) {
        console.error("Fallback MediaRecorder also failed:", e2);
        toast({
          title: "Recording Error",
          description: "Your browser doesn't support audio recording. Please try a different browser.",
          variant: "destructive",
        });
      }
    }
  }, [toast]);

  const stopRecordingAndGetBlob = (): Promise<Blob | null> => {
    return new Promise((resolve) => {
      if (!mediaRecorderRef.current) {
        console.log("No MediaRecorder instance");
        resolve(null);
        return;
      }

      const state = mediaRecorderRef.current.state;
      if (state === "inactive") {
        console.log("MediaRecorder already inactive");
        resolve(null);
        return;
      }

      mediaRecorderRef.current.onstop = () => {
        setIsRecording(false);
        console.log("Recording stopped, chunks collected:", audioChunksRef.current.length);
        
        if (audioChunksRef.current.length > 0) {
          // Calculate total size
          const totalSize = audioChunksRef.current.reduce((sum, chunk) => sum + chunk.size, 0);
          console.log("Total audio data size:", totalSize, "bytes");
          
          const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          console.log("Audio blob created, size:", blob.size);
          resolve(blob);
        } else {
          console.log("No audio chunks captured - possible silence or too short recording");
          resolve(null);
        }
      };

      try {
        mediaRecorderRef.current.stop();
      } catch (e) {
        console.error("Error stopping recorder:", e);
        setIsRecording(false);
        resolve(null);
      }
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
    utterance.lang = interviewLang === "ur" ? "ur-PK" : "en-US";
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

    if (audioBlob && audioBlob.size > 0) {
       try {
          console.log("Sending audio for transcription, size:", audioBlob.size);
          const formData = new FormData();
          formData.append("file", audioBlob, "answer.webm");
          const res = await fetch("/api/ai/v1/transcribe", { method: "POST", body: formData });
          const data = await res.json();
          console.log("Transcription response:", data);
          if (data.text && data.text.trim()) {
            text = data.text;
          } else if (data.detail) {
            console.error("Transcription failed:", data.detail);
          }
       } catch (e) {
          console.error("Transcription error:", e);
       }
    } else {
      console.log("No audio blob or empty blob, size:", audioBlob?.size || 0);
    }

    console.log("Submitting answer:", text);

    try {
      await submitAnswerMutation.mutateAsync(text);
      setElapsedTime(0);
    } finally {
      setIsSubmitting(false);
      // Recording should restart automatically via the effect at line ~337
    }
  };

  const handleEndSession = async () => {
    if (isSubmitting || syncToRailsMutation.isPending) return;
    setIsSubmitting(true);
    stopSpeaking();

    const audioBlob = await stopRecordingAndGetBlob();
    // Stop frame capture immediately so we don't send black frames,
    // but keep the WS open — syncToRailsMutation needs it for session_report.
    if (frameIntervalRef.current) clearInterval(frameIntervalRef.current);
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track: MediaStreamTrack) => track.stop());
      mediaStreamRef.current = null;
    }
    setIsCameraOn(false);
    setIsMicOn(false);

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
            {isCompleteMode ? "Complete Interview" : `${targetRole} Interview`}
          </h1>
          <div className="flex items-center gap-3 flex-wrap">
            <Badge variant="secondary">AI Assisted</Badge>
            {isCompleteMode && completePhase === 'cv' && (
              <Badge>CV Phase</Badge>
            )}
            {isCompleteMode && completePhase === 'role' && (
              <Badge variant="outline">Role Phase</Badge>
            )}
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
              <canvas ref={canvasRef} className="hidden" />

              {!isCameraOn && (
                <div className="absolute inset-0 flex items-center justify-center bg-muted">
                  <div className="text-center">
                    <VideoOff className="w-12 h-12 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">Camera is off</p>
                  </div>
                </div>
              )}

              <div className="absolute top-4 right-4 flex items-center gap-2 flex-col items-end">
                <div
                  className={`flex items-center gap-2 px-3 py-2 rounded-full text-sm font-medium transition-colors ${
                    behaviorStatus === "good" ? "bg-green-500/90 text-white" : "bg-red-500/90 text-white animate-pulse"
                  }`}
                >
                  {behaviorStatus === "good" ? <><CheckCircle className="w-4 h-4" /> {attentionState}</> : <><AlertCircle className="w-4 h-4" /> {attentionState}</>}
                </div>
                {attentionScore !== null && (
                   <Badge className="bg-primary/90">Attention: {Math.round(attentionScore)}%</Badge>
                )}
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
