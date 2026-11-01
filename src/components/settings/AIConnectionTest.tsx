"use client";
import { useState } from "react";
import { CheckCircle2, CircleDashed, Loader2, PlugZap, XCircle } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { testAIConnectionAction } from "@/app/actions/settings";
import type { ConnectionReport } from "@/lib/ai/connection-test";
import { Button } from "@/components/ui";

/** Runs the real server-side provider test and shows each check exactly as the provider answered. */
export function AIConnectionTest() {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<ConnectionReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="mt-4">
      <Button
        variant="secondary"
        size="sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const r = await testAIConnectionAction();
          setBusy(false);
          if (r.ok) setReport(r.data);
          else setError(t(r.error));
        }}
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <PlugZap className="size-4" />} {t("aiSettings.test")}
      </Button>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      {report && (
        <div className="mt-4 rounded-2xl bg-canvas p-4">
          <p className={`text-sm font-bold ${report.ok ? "text-success" : "text-danger"}`}>{t(report.ok ? "aiSettings.passed" : "aiSettings.failed")}</p>
          <ul className="mt-2 space-y-1.5 text-sm">
            {report.checks.map((c) => (
              <li key={c.id} className="flex items-start gap-2">
                {c.ok === true ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" /> : c.ok === false ? <XCircle className="mt-0.5 size-4 shrink-0 text-danger" /> : <CircleDashed className="mt-0.5 size-4 shrink-0 text-muted" />}
                <span>
                  <span className="font-semibold">{t(`aiSettings.checks.${c.id}`)}</span>
                  {c.detail && <span className="block break-all text-xs text-muted">{c.detail}</span>}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">
            {report.provider} · {report.model} {report.latencyMs ? `· ${report.latencyMs}ms` : ""} · {new Date(report.testedAt).toLocaleString()}
          </p>
        </div>
      )}
    </div>
  );
}
