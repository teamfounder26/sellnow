import Link from "next/link";
import { getT } from "@/lib/i18n/server";
import { readDevResetLink } from "@/app/actions/auth";
import { ForgotForm } from "@/components/auth/ResetForms";

export const metadata = { title: "Forgot password" };

export default async function ForgotPage() {
  const { t } = await getT();
  return (
    <>
      <h1 className="text-center text-2xl font-extrabold tracking-tight">{t("auth2.forgotTitle")}</h1>
      <p className="mb-6 mt-2 text-center text-[15px] text-muted">{t("auth2.forgotSub")}</p>
      <ForgotForm devLink={await readDevResetLink()} />
      <p className="mt-6 text-center text-sm">
        <Link href="/login" className="font-semibold text-muted hover:text-ink">
          ← {t("nav.login")}
        </Link>
      </p>
    </>
  );
}
