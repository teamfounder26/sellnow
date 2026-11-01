import { getT } from "@/lib/i18n/server";
import { ResetForm } from "@/components/auth/ResetForms";
import { Notice } from "@/components/ui";

export const metadata = { title: "Reset password" };

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const { t } = await getT();
  return (
    <>
      <h1 className="mb-6 text-center text-2xl font-extrabold tracking-tight">{t("auth2.resetTitle")}</h1>
      {token ? <ResetForm token={token} /> : <Notice tone="danger">{t("auth.resetInvalid")}</Notice>}
    </>
  );
}
