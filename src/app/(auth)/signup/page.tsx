import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { SocialButtons } from "@/components/auth/SocialButtons";
import { signupAction } from "@/app/actions/auth";
import { getT } from "@/lib/i18n/server";
import { getCurrentUser } from "@/lib/auth/session";
import { oauthConfigured } from "@/lib/auth/oauth";
import { Notice } from "@/components/ui";

export const metadata = { title: "Sign up" };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  if (await getCurrentUser()) redirect(next?.startsWith("/") ? next : "/onboarding");
  const { t } = await getT();
  return (
    <>
      <div className="mb-7 text-center">
        <h1 className="text-balance text-[28px] font-extrabold leading-tight tracking-tight">{t("auth2.signupTitle")}</h1>
        <p className="mt-2 text-[15px] text-muted">{t("auth2.signupSub")}</p>
      </div>
      {error && <Notice tone="danger" className="mb-4">{t(error)}</Notice>}
      <SocialButtons mode="signup" providers={{ google: oauthConfigured("google"), facebook: oauthConfigured("facebook") }} next={next} emailForm={<AuthForm mode="signup" action={signupAction} next={next ?? "/onboarding"} />} />
      <p className="mt-6 text-center text-sm text-muted">
        {t("auth.haveAccount")}{" "}
        <Link href={`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-semibold text-primary-strong underline-offset-4 hover:underline">
          {t("nav.login")}
        </Link>
      </p>
      <p className="mt-4 text-center text-xs text-muted">{t("auth2.terms")}</p>
    </>
  );
}
