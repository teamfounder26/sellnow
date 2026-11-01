"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { ensureWorkspaceAction } from "@/app/actions/onboarding";
import { useT } from "@/lib/i18n/client";
import { Button, Notice } from "@/components/ui";

export function EnsureWorkspace() {
  const t = useT();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const run = async () => {
    setError(null);
    const r = await ensureWorkspaceAction();
    if (r.ok) router.refresh();
    else setError(r.error);
  };
  useEffect(() => {
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="mx-auto mt-24 max-w-md px-4 text-center">
      {error ? (
        <>
          <Notice tone="danger">{t(error)}</Notice>
          <Button className="mt-4" onClick={run}>{t("common.retry")}</Button>
        </>
      ) : (
        <Loader2 className="mx-auto size-8 animate-spin text-muted" />
      )}
    </div>
  );
}
