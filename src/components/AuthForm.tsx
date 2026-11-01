"use client";
import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { Button, Field, Input, Notice } from "@/components/ui";
import { useT } from "@/lib/i18n/client";
import type { AuthState } from "@/app/actions/auth";

export function AuthForm({ mode, action, next }: { mode: "login" | "signup"; action: (s: AuthState, f: FormData) => Promise<AuthState>; next?: string }) {
  const t = useT();
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className="space-y-4" noValidate={false}>
      {next ? <input type="hidden" name="next" value={next} /> : null}
      {state?.error ? <Notice tone="danger">{t(state.error)}</Notice> : null}
      {mode === "signup" && (
        <Field label={t("auth.name")} htmlFor="name" required>
          <Input id="name" name="name" autoComplete="name" required minLength={2} defaultValue={state?.fields?.name} />
        </Field>
      )}
      <Field label={t("auth.email")} htmlFor="email" required>
        <Input id="email" name="email" type="email" autoComplete="email" required defaultValue={state?.fields?.email} />
      </Field>
      <Field label={t("auth.password")} htmlFor="password" required hint={mode === "signup" ? t("auth.passwordHint") : undefined}>
        <Input id="password" name="password" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} required minLength={8} />
      </Field>
      <Button type="submit" className="w-full" size="lg" disabled={pending}>
        {pending && <Loader2 className="size-4 animate-spin" />}
        {mode === "signup" ? t("auth.signupCta") : t("auth.loginCta")}
      </Button>
    </form>
  );
}
