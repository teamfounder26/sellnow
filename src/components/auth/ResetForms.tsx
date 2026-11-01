"use client";
import { useActionState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { requestResetAction, resetPasswordAction } from "@/app/actions/auth";
import { Button, Field, Input, Notice } from "@/components/ui";

export function ForgotForm({ devLink }: { devLink: string | null }) {
  const t = useT();
  const [state, action, pending] = useActionState(requestResetAction, undefined);
  if (state?.sent)
    return (
      <div className="space-y-4">
        <Notice tone="success">{t("auth2.resetSent")}</Notice>
        {devLink && (
          <Notice tone="blue">
            {t("auth2.devLink")}{" "}
            <a href={devLink} className="break-all font-semibold underline">
              {devLink}
            </a>
          </Notice>
        )}
      </div>
    );
  return (
    <form action={action} className="space-y-4">
      {state?.error && <Notice tone="danger">{t(state.error)}</Notice>}
      <Field label={t("auth.email")} htmlFor="email" required>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending && <Loader2 className="size-4 animate-spin" />} {t("auth2.sendReset")}
      </Button>
    </form>
  );
}

export function ResetForm({ token }: { token: string }) {
  const t = useT();
  const [state, action, pending] = useActionState(resetPasswordAction, undefined);
  if (state?.done)
    return (
      <div className="space-y-4 text-center">
        <Notice tone="success">{t("auth2.resetDone")}</Notice>
        <Link href="/login?reset=1" className="font-semibold text-primary-strong">
          {t("nav.login")}
        </Link>
      </div>
    );
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      {state?.error && <Notice tone="danger">{t(state.error)}</Notice>}
      <Field label={t("auth2.newPassword")} htmlFor="password" required hint={t("auth.passwordHint")}>
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} />
      </Field>
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending && <Loader2 className="size-4 animate-spin" />} {t("auth2.setPassword")}
      </Button>
    </form>
  );
}
