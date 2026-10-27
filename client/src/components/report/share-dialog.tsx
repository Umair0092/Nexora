import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Check, Copy, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { api, errorMessage } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";

interface ShareState {
  shared: boolean;
  shareUrl: string | null;
}

// Create, copy or turn off the public read-only link to a report.
export function ShareDialog({
  sessionId,
  shareUrl,
  open,
  onOpenChange,
}: {
  sessionId: string;
  shareUrl: string | null | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const update = useMutation({
    mutationFn: (method: "POST" | "DELETE") => api<ShareState>(`/api/v1/sessions/${sessionId}/share`, { method }),
    onSuccess: (state) => {
      queryClient.setQueryData(["/api/v1/sessions", sessionId, "report"], (old: any) => (old ? { ...old, ...state } : old));
      toast({ title: state.shared ? "Link created" : "Link turned off", description: state.shared ? undefined : "Anyone with the old link can no longer open it." });
    },
    onError: (error) => toast({ title: "Couldn't update the link", description: errorMessage(error), variant: "destructive" }),
  });

  const copy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Couldn't copy automatically", description: "Select the link and copy it." });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Share this report</DialogTitle>
          <DialogDescription>
            Anyone with the link can read the report, including your answers, without signing in. Your email and job description stay private.
          </DialogDescription>
        </DialogHeader>

        {shareUrl ? (
          <div className="space-y-4">
            <div className="flex gap-2">
              <label htmlFor="share-url" className="sr-only">Share link</label>
              <Input id="share-url" readOnly value={shareUrl} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
              <Button onClick={copy} className="shrink-0" data-testid="button-copy-share">
                {copied ? <Check /> : <Copy />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <div className="flex justify-between gap-3 border-t pt-4">
              <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => update.mutate("DELETE")} disabled={update.isPending}>
                {update.isPending && <Loader2 className="animate-spin" />}
                Turn off link
              </Button>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Done</Button>
            </div>
          </div>
        ) : (
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={() => update.mutate("POST")} disabled={update.isPending} data-testid="button-create-share">
              {update.isPending && <Loader2 className="animate-spin" />}
              Create link
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
