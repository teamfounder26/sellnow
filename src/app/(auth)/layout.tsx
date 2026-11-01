import { Logo } from "@/components/brand/Logo";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

/** Centered, Nas-inspired premium auth shell over the ambient gradient. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="ambient relative flex min-h-dvh flex-col">
      <header className="flex h-16 items-center justify-between px-4 sm:px-6">
        <Logo />
        <LanguageSwitcher />
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-8">
        <div className="glass w-full max-w-[440px] rounded-[32px] p-2">
          <div className="rounded-[26px] bg-white p-6 sm:p-8">{children}</div>
        </div>
      </main>
    </div>
  );
}
