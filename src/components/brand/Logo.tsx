import Link from "next/link";
import clsx from "clsx";

/** SellNow mark: a blue "spark" tile with a white bolt + wordmark. Original mark, no third-party assets. */
export function Logo({ href = "/", className, compact }: { href?: string; className?: string; compact?: boolean }) {
  return (
    <Link href={href} className={clsx("inline-flex items-center gap-2 font-extrabold tracking-tight text-ink", className)} aria-label="SellNow">
      <span className="relative grid size-8 place-items-center rounded-[10px] bg-gradient-to-br from-primary to-primary-strong shadow-[0_6px_14px_-6px_rgb(31_131_216/0.8),inset_0_1px_0_rgb(255_255_255/0.3)]">
        <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
          <path d="M13.5 2 5 13.2h5.6L9.8 22 19 10.2h-5.7L13.5 2Z" fill="#fff" />
        </svg>
        <span className="absolute -right-1 -top-1 size-2.5 rounded-full bg-ai ring-2 ring-white" />
      </span>
      {!compact && <span className="text-[19px]">SellNow</span>}
    </Link>
  );
}
