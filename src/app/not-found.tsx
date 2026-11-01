import { getT } from "@/lib/i18n/server";
import { LinkButton } from "@/components/ui";
import { Logo } from "@/components/brand/Logo";

export default async function NotFound() {
  const { t } = await getT();
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 text-center">
      <Logo />
      <h1 className="mt-8 text-4xl font-extrabold tracking-tight">404</h1>
      <p className="mt-2 text-muted">{t("errors.pageNotFound")} · {t("errors.storeNotFound")}</p>
      <LinkButton href="/" className="mt-6">{t("errors.goHome")}</LinkButton>
    </div>
  );
}
