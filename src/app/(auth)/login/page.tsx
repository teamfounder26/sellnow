import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { SocialButtons } from "@/components/auth/SocialButtons";
import { loginAction } from "@/app/actions/auth";
import { getT } from "@/lib/i18n/server";
import { getCurrentUser } from "@/lib/auth/session";
import { oauthConfigured } from "@/lib/auth/oauth";
import { Notice } from "@/components/ui";

export const metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string; reset?: string }> }) {
  const { next, error, reset } = await searchParams;
  if (await getCurrentUser()) redirect(next?.startsWith("/") ? next : "/dashboard");
  const { t } = await getT();
  return (
    <>
      <div className="mb-7 text-center">
        <h1 className="text-[28px] font-extrabold tracking-tight">{t("auth2.loginTitle")}</h1>
        <p className="mt-2 text-[15px] text-muted">{t("auth2.loginSub")}</p>
      </div>
      {error && <Notice tone="danger" className="mb-4">{t(error)}</Notice>}
      {reset && <Notice tone="success" className="mb-4">{t("auth2.resetDone")}</Notice>}
      <SocialButtons
        mode="login"
        providers={{ google: oauthConfigured("google"), facebook: oauthConfigured("facebook") }}
        next={next}
        emailForm={
          <>
            <AuthForm mode="login" action={loginAction} next={next} />
            <p className="mt-3 text-center text-sm">
              <Link href="/forgot-password" className="font-semibold text-muted hover:text-ink">
                {t("auth2.forgot")}
              </Link>
            </p>
          </>
        }
      />
      <p className="mt-6 text-center text-sm text-muted">
        {t("auth.noAccount")}{" "}
        <Link href={`/signup${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-semibold text-primary-strong underline-offset-4 hover:underline">
          {t("nav.startNow")}
        </Link>
      </p>
    </>
  );
}
