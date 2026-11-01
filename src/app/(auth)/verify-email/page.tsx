import { CheckCircle2, XCircle } from "lucide-react";
import { getDb } from "@/lib/db";
import { consumeEmailVerification } from "@/lib/auth/service";
import { getT } from "@/lib/i18n/server";
import { LinkButton } from "@/components/ui";

export default async function VerifyEmail({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const { t } = await getT();
  const ok = token ? await consumeEmailVerification(await getDb(), token) : false;
  return (
    <div className="text-center">
      {ok ? <CheckCircle2 className="mx-auto size-12 text-success" /> : <XCircle className="mx-auto size-12 text-danger" />}
      <h1 className="mt-4 text-xl font-extrabold">{ok ? t("auth.verified") : t("auth.verifyFailed")}</h1>
      <LinkButton href="/dashboard" className="mt-6">{t("nav.dashboard")}</LinkButton>
    </div>
  );
}
