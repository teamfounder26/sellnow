"use client";
import { useT } from "@/lib/i18n/client";
import { Button } from "@/components/ui";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  const t = useT();
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <p className="text-xl font-bold">{t("errors.unexpected")}</p>
      <Button className="mt-4" onClick={reset}>{t("common.retry")}</Button>
    </div>
  );
}
