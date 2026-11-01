"use client";
import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, Pause, Play, RotateCcw, Square, Trash2, Upload, X } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { addVoiceAction } from "@/app/actions/onboarding";
import { Button, Notice } from "@/components/ui";
import type { InputItem } from "./OnboardingWizard";

const MAX_SECONDS = 180;

function pickMime() {
  const options = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  return typeof MediaRecorder !== "undefined" ? options.find((m) => MediaRecorder.isTypeSupported(m)) ?? "" : "";
}

type Phase = "idle" | "denied" | "unsupported" | "recording" | "paused" | "review" | "uploading";

/** Browser voice-note recorder: permission → record (pause/resume) → playback → re-record/delete → submit. */
export function VoiceRecorder({ sessionId, sttAvailable, onClose, onSaved }: { sessionId: string; sttAvailable: boolean; onClose: () => void; onSaved: (i: InputItem) => void }) {
  const t = useT();
  const [phase, setPhase] = useState<Phase>("idle");
  const [seconds, setSeconds] = useState(0);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const blob = useRef<Blob | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTracks = () => stream.current?.getTracks().forEach((tr) => tr.stop());
  useEffect(() => () => {
    stopTracks();
    if (timer.current) clearInterval(timer.current);
  }, []);
  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);

  const tick = () => {
    timer.current = setInterval(() => {
      setSeconds((s) => {
        if (s + 1 >= MAX_SECONDS) rec.current?.stop();
        return s + 1;
      });
    }, 1000);
  };

  const startRecording = async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") return setPhase("unsupported");
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return setPhase("denied");
    }
    const mime = pickMime();
    const r = new MediaRecorder(stream.current, mime ? { mimeType: mime } : undefined);
    chunks.current = [];
    r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
    r.onstop = () => {
      if (timer.current) clearInterval(timer.current);
      stopTracks();
      blob.current = new Blob(chunks.current, { type: r.mimeType || "audio/webm" });
      setUrl(URL.createObjectURL(blob.current));
      setPhase("review");
    };
    rec.current = r;
    r.start(250);
    setSeconds(0);
    setPhase("recording");
    tick();
  };

  const pause = () => {
    rec.current?.pause();
    if (timer.current) clearInterval(timer.current);
    setPhase("paused");
  };
  const resume = () => {
    rec.current?.resume();
    tick();
    setPhase("recording");
  };
  const reset = () => {
    blob.current = null;
    setUrl(null);
    setSeconds(0);
    setPhase("idle");
  };

  const submit = async () => {
    if (!blob.current) return;
    setPhase("uploading");
    const fd = new FormData();
    fd.set("audio", new File([blob.current], "voice-note", { type: blob.current.type }));
    fd.set("duration", String(seconds));
    const r = await addVoiceAction(sessionId, fd);
    if (r.ok) onSaved(r.data);
    else {
      setError(t(r.error, r.params));
      setPhase("review");
    }
  };

  const mmss = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <div className="glass mt-4 rounded-[24px] p-5 animate-rise" role="region" aria-label={t("wizard.voice.title")}>
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 font-bold">
          <Mic className="size-5 text-primary" /> {t("wizard.voice.title")}
        </p>
        <button type="button" onClick={onClose} className="rounded-full p-1.5 text-muted hover:bg-white" aria-label={t("common.close")}>
          <X className="size-4" />
        </button>
      </div>
      {!sttAvailable && <p className="mt-2 text-sm text-muted">{t("wizard.voice.sttOff")}</p>}

      {phase === "denied" || phase === "unsupported" ? (
        <Notice tone="warning" className="mt-4">
          {t(phase === "denied" ? "wizard.voice.denied" : "wizard.voice.unsupported")}
        </Notice>
      ) : (
        <div className="mt-5 flex flex-col items-center gap-4">
          <div className="relative grid size-24 place-items-center">
            {phase === "recording" && <span className="absolute inset-0 animate-ping rounded-full bg-primary/20" />}
            <span className={`relative grid size-20 place-items-center rounded-full ${phase === "recording" ? "bg-danger text-white" : "bg-primary text-white"} shadow-glow`}>
              <Mic className="size-8" />
            </span>
          </div>
          <p className="font-mono text-2xl font-bold tabular-nums" aria-live="polite">
            {mmss}
            <span className="ml-2 text-sm font-medium text-muted">/ 3:00</span>
          </p>
          {phase === "idle" && (
            <Button onClick={startRecording}>
              <Mic className="size-4" /> {t("wizard.voice.start")}
            </Button>
          )}
          {(phase === "recording" || phase === "paused") && (
            <div className="flex gap-2">
              {phase === "recording" ? (
                <Button variant="secondary" onClick={pause}>
                  <Pause className="size-4" /> {t("wizard.voice.pause")}
                </Button>
              ) : (
                <Button variant="secondary" onClick={resume}>
                  <Play className="size-4" /> {t("wizard.voice.resume")}
                </Button>
              )}
              <Button variant="danger" onClick={() => rec.current?.stop()}>
                <Square className="size-4" /> {t("wizard.voice.stop")}
              </Button>
            </div>
          )}
          {(phase === "review" || phase === "uploading") && url && (
            <div className="flex w-full flex-col items-center gap-3">
              <audio controls src={url} className="w-full max-w-sm" />
              <div className="flex flex-wrap justify-center gap-2">
                <Button variant="ghost" size="sm" onClick={reset} disabled={phase === "uploading"}>
                  <RotateCcw className="size-4" /> {t("wizard.voice.rerecord")}
                </Button>
                <Button variant="ghost" size="sm" onClick={onClose} disabled={phase === "uploading"}>
                  <Trash2 className="size-4" /> {t("common.delete")}
                </Button>
                <Button size="sm" onClick={submit} disabled={phase === "uploading"}>
                  {phase === "uploading" ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />} {t(sttAvailable ? "wizard.voice.transcribe" : "wizard.voice.attach")}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
      {error && (
        <Notice tone="danger" className="mt-4">
          {error}
        </Notice>
      )}
    </div>
  );
}
