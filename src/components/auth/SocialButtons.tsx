"use client";
import { useState } from "react";
import { Mail } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { cx } from "@/components/ui";

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.7v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8Z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8l4-3.1Z" />
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9Z" />
    </svg>
  );
}
function FacebookMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
      <circle cx="12" cy="12" r="12" fill="#1877F2" />
      <path fill="#fff" d="M15.1 12.5h-2.1V20h-3v-7.5H8.5V10H10V8.4C10 6.6 10.9 5 13.4 5c1 0 1.9.1 1.9.1v2.3h-1.2c-.9 0-1.1.5-1.1 1.1V10h2.4l-.3 2.5Z" />
    </svg>
  );
}

/** Continue with Google / Facebook / Email. Unconfigured providers are shown disabled with a reason (no fake buttons). */
export function SocialButtons({ providers, next, emailForm, mode }: { providers: { google: boolean; facebook: boolean }; next?: string; emailForm: React.ReactNode; mode: "signup" | "login" }) {
  const t = useT();
  const [email, setEmail] = useState(false);
  const q = next ? `?next=${encodeURIComponent(next)}` : "";
  const cls = "flex h-12 w-full items-center justify-center gap-3 rounded-2xl border border-line bg-white text-[15px] font-semibold transition hover:border-primary/40 hover:shadow-soft";
  return (
    <div className="space-y-2.5">
      {(["google", "facebook"] as const).map((p) =>
        providers[p] ? (
          <a key={p} href={`/api/auth/${p}/start${q}`} className={cls}>
            {p === "google" ? <GoogleMark /> : <FacebookMark />} {t(`auth2.continue.${p}`)}
          </a>
        ) : (
          <button key={p} type="button" disabled className={cx(cls, "cursor-not-allowed opacity-50")} title={t("auth2.notConfigured")}>
            {p === "google" ? <GoogleMark /> : <FacebookMark />} {t(`auth2.continue.${p}`)}
          </button>
        ),
      )}
      {!providers.google && !providers.facebook && <p className="text-center text-xs text-muted">{t("auth2.socialSoon")}</p>}
      {email ? (
        <div className="pt-3">
          <div className="mb-4 flex items-center gap-3 text-xs font-semibold text-muted">
            <span className="h-px flex-1 bg-line" /> {t(`auth2.withEmail.${mode}`)} <span className="h-px flex-1 bg-line" />
          </div>
          {emailForm}
        </div>
      ) : (
        <button type="button" onClick={() => setEmail(true)} className="flex h-12 w-full items-center justify-center gap-3 rounded-2xl bg-ink text-[15px] font-semibold text-white transition hover:bg-ink/90">
          <Mail className="size-5" /> {t("auth2.continue.email")}
        </button>
      )}
    </div>
  );
}
