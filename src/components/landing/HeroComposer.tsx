"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Package, Sparkles, FileDown, Lightbulb } from "lucide-react";
import { AIComposer, PromptSuggestionChip } from "@/components/ai/AIComposer";
import { useT } from "@/lib/i18n/client";

export const IDEA_KEY = "sn_pending_idea";

/** Carries the visitor's idea into onboarding (after sign-up) via sessionStorage — never via the URL. */
export function HeroComposer({ signedIn }: { signedIn: boolean }) {
  const t = useT();
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const go = async ({ text, file }: { text: string; file: File | null }) => {
    setBusy(true);
    try {
      let image: string | null = null;
      if (file && file.type.startsWith("image/") && file.size < 2.5 * 1024 * 1024) {
        image = await new Promise<string>((res, rej) => {
          const r = new FileReader();
          r.onload = () => res(String(r.result));
          r.onerror = rej;
          r.readAsDataURL(file);
        });
      }
      sessionStorage.setItem(IDEA_KEY, JSON.stringify({ text, image, name: file?.name ?? null }));
    } catch {
      /* storage may be unavailable; the user can re-enter their idea */
    }
    router.push(signedIn ? "/onboarding" : "/signup?next=/onboarding");
  };

  const chips = [
    { k: "quickPhysical", p: "quickPhysicalPrompt", icon: <Package className="size-4 text-accent" /> },
    { k: "quickSkills", p: "quickSkillsPrompt", icon: <Sparkles className="size-4 text-ai-strong" /> },
    { k: "quickDigital", p: "quickDigitalPrompt", icon: <FileDown className="size-4 text-success" /> },
    { k: "quickIdea", p: "quickIdeaPrompt", icon: <Lightbulb className="size-4 text-warning" /> },
  ];
  return (
    <div className="mx-auto w-full max-w-2xl">
      <AIComposer placeholder={t("landing.composerPlaceholder")} onSubmit={go} busy={busy} value={text} onChange={setText} />
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {chips.map((c) => (
          <PromptSuggestionChip key={c.k} icon={c.icon} onClick={() => setText(t(`landing.${c.p}`))}>
            {t(`landing.${c.k}`)}
          </PromptSuggestionChip>
        ))}
      </div>
    </div>
  );
}
