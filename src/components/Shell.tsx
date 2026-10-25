"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { BookOpen, Bookmark, CalendarHeart, Heart, Home, LineChart, PenLine, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { store, useProgress } from "@/lib/store";
import { cx } from "./ui";

const NAV = [
  { href: "/", label: "Home", Icon: Home },
  { href: "/weeks", label: "Weeks", Icon: CalendarHeart },
  { href: "/practice", label: "Practice", Icon: PenLine },
  { href: "/study", label: "Study", Icon: BookOpen },
  { href: "/review", label: "Review", Icon: Bookmark },
  { href: "/progress", label: "Progress", Icon: LineChart },
] as const;

function isActive(path: string, href: string) {
  return href === "/" ? path === "/" : path === href || path.startsWith(href + "/");
}

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const progress = useProgress();
  const motionOff = progress.settings.motion === "off";

  useEffect(() => {
    document.documentElement.dataset.motion = motionOff ? "off" : "on";
  }, [motionOff]);

  const inQuiz = path.startsWith("/practice/session");

  return (
    <div className="mx-auto flex min-h-dvh max-w-5xl flex-col px-4 sm:px-6">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-white focus:px-4 focus:py-2">
        Skip to content
      </a>
      <header className="flex items-center justify-between gap-3 py-4">
        <Link href="/" className="flex items-center gap-2 rounded-full pr-2" aria-label="Bloom home">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-blush-200 to-lav-100 text-xl shadow-soft" aria-hidden="true">
            🌱
          </span>
          <span className="leading-tight">
            <span className="block font-display text-xl font-semibold text-rose-800">Bloom</span>
            <span className="hidden text-xs text-muted sm:block">your study buddy</span>
          </span>
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {NAV.map(({ href, label, Icon }) => {
            const active = isActive(path, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition",
                  active ? "bg-rose-600 text-white shadow-soft" : "text-rose-800 hover:bg-blush-100",
                )}
              >
                <Icon size={16} aria-hidden="true" />
                {label}
              </Link>
            );
          })}
        </nav>

        <button
          type="button"
          onClick={() => store.update((p) => ({ ...p, settings: { ...p.settings, motion: motionOff ? "system" : "off" } }))}
          aria-pressed={motionOff}
          title="Turn gentle animations on or off"
          className="flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-3 text-sm font-semibold text-muted hover:bg-blush-100"
        >
          <Sparkles size={16} aria-hidden="true" />
          <span className="hidden sm:inline">{motionOff ? "Animations off" : "Animations on"}</span>
          <span className="sr-only sm:hidden">{motionOff ? "Animations off" : "Animations on"}</span>
        </button>
      </header>

      <main id="main" className={cx("flex-1", inQuiz ? "pb-10" : "pb-28 md:pb-10")}>
        {children}
      </main>

      <footer className="pb-24 pt-6 text-center text-sm text-muted md:pb-8">
        <p className="inline-flex items-center gap-1">
          <Heart size={14} className="fill-rose-500 text-rose-500" aria-hidden="true" /> Small steps, every day. Keep growing.
        </p>
        <p className="mt-1">
          Answers come only from your solution PDFs · progress is saved on this device ·{" "}
          <Link href="/admin" className="underline decoration-blush-300 underline-offset-2">
            import &amp; verify
          </Link>
        </p>
      </footer>

      {!inQuiz && (
        <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 border-t border-blush-200 bg-white/95 backdrop-blur md:hidden">
          <ul className="mx-auto grid max-w-lg grid-cols-6 px-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] pt-1">
            {NAV.map(({ href, label, Icon }) => {
              const active = isActive(path, href);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={cx(
                      "flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-2xl text-[0.7rem] font-semibold",
                      active ? "text-rose-600" : "text-muted",
                    )}
                  >
                    <span className={cx("grid h-7 w-11 place-items-center rounded-full transition", active && "bg-blush-100")}>
                      <Icon size={20} aria-hidden="true" />
                    </span>
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
    </div>
  );
}
