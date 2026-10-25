"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

/** A small hand-drawn style blossom. Decorative only. */
export function Flower({ className = "", size = 64 }: { className?: string; size?: number }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <g transform="translate(32 32)">
        {[0, 72, 144, 216, 288].map((r) => (
          <ellipse key={r} rx="9" ry="16" cy="-14" fill="#b4c0ff" stroke="#5f67e8" strokeWidth="1.2" transform={`rotate(${r})`} />
        ))}
        <circle r="8" fill="#ffd66b" stroke="#f0a92e" strokeWidth="1.2" />
      </g>
    </svg>
  );
}

export function Card({
  children,
  className = "",
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "article" | "li";
}) {
  return (
    <Tag className={cx("rounded-3xl border border-blush-200/80 bg-white/90 p-5 shadow-card backdrop-blur sm:p-6", className)}>
      {children}
    </Tag>
  );
}

type Variant = "primary" | "soft" | "ghost" | "lav";
const VARIANTS: Record<Variant, string> = {
  primary: "bg-rose-600 text-white shadow-soft hover:bg-rose-700 active:scale-[0.98] disabled:bg-blush-300 disabled:shadow-none",
  soft: "bg-blush-100 text-rose-800 hover:bg-blush-200 active:scale-[0.98] disabled:opacity-50",
  ghost: "bg-transparent text-rose-700 hover:bg-blush-100 disabled:opacity-50",
  lav: "bg-lav-100 text-lav-600 hover:bg-lav-300/60 active:scale-[0.98] disabled:opacity-50",
};
const BASE =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 py-2.5 text-[0.95rem] font-semibold transition disabled:cursor-not-allowed";

export function Button({ variant = "primary", className = "", ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button type="button" className={cx(BASE, VARIANTS[variant], className)} {...p} />;
}

export function ButtonLink({
  href,
  variant = "primary",
  className = "",
  children,
  disabled,
}: {
  href: string;
  variant?: Variant;
  className?: string;
  children: ReactNode;
  disabled?: boolean;
}) {
  if (disabled) {
    return (
      <span aria-disabled="true" className={cx(BASE, VARIANTS[variant], "cursor-not-allowed opacity-50", className)}>
        {children}
      </span>
    );
  }
  return (
    <Link href={href} className={cx(BASE, VARIANTS[variant], className)}>
      {children}
    </Link>
  );
}

export function ProgressBar({ value, label, tone = "rose" }: { value: number; label: string; tone?: "rose" | "lav" }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className="h-2.5 w-full overflow-hidden rounded-full bg-blush-100"
    >
      <div
        className={cx("h-full rounded-full transition-[width] duration-500", tone === "rose" ? "bg-gradient-to-r from-blush-400 to-rose-500" : "bg-gradient-to-r from-lav-300 to-lav-600")}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function Badge({ children, tone = "rose" }: { children: ReactNode; tone?: "rose" | "lav" | "sage" | "gray" }) {
  const tones = {
    rose: "bg-blush-100 text-rose-800",
    lav: "bg-lav-100 text-lav-600",
    sage: "bg-sage-100 text-sage-700",
    gray: "bg-gray-100 text-gray-700",
  };
  return <span className={cx("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold", tones[tone])}>{children}</span>;
}

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-3xl font-semibold text-rose-800 sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-prose text-[0.98rem] text-muted">{subtitle}</p>}
      </div>
      {children}
    </header>
  );
}

export function EmptyState({ icon = "🌱", title, children, action }: { icon?: string; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <Card className="text-center">
      <div className="float mx-auto mb-2 text-4xl" aria-hidden="true">
        {icon}
      </div>
      <h2 className="text-xl font-semibold text-rose-800">{title}</h2>
      {children && <div className="mx-auto mt-2 max-w-md text-muted">{children}</div>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </Card>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-2xl bg-blush-100", className)} aria-hidden="true" />;
}

/** Soft falling petals. Hidden entirely when motion is reduced/off (CSS). */
export function Petals({ burst, count = 16 }: { burst: number; count?: number }) {
  const [items, setItems] = useState<{ id: number; left: number; dx: number; rot: number; delay: number; dur: number; glyph: string }[]>([]);
  useEffect(() => {
    if (!burst) return;
    const glyphs = ["🌱", "✨", "🎉", "⭐", "💪"];
    const next = Array.from({ length: count }, (_, i) => ({
      id: burst * 1000 + i,
      left: Math.random() * 100,
      dx: (Math.random() - 0.5) * 160,
      rot: (Math.random() - 0.5) * 720,
      delay: Math.random() * 0.6,
      dur: 2.2 + Math.random() * 1.4,
      glyph: glyphs[i % glyphs.length],
    }));
    // State is set from timer callbacks (not synchronously in the effect body).
    const show = setTimeout(() => setItems(next), 0);
    const hide = setTimeout(() => setItems([]), 4500);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, [burst, count]);
  if (!items.length) return null;
  return (
    <div aria-hidden="true">
      {items.map((p) => (
        <span
          key={p.id}
          className="petal text-2xl"
          style={{ left: `${p.left}vw`, ["--dx" as string]: `${p.dx}px`, ["--rot" as string]: `${p.rot}deg`, ["--delay" as string]: `${p.delay}s`, ["--dur" as string]: `${p.dur}s` }}
        >
          {p.glyph}
        </span>
      ))}
    </div>
  );
}

export function ProgressRing({ value, size = 44, label }: { value: number; size?: number; label: string }) {
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.min(1, Math.max(0, value));
  return (
    <svg width={size} height={size} role="img" aria-label={`${label}: ${Math.round(pct * 100)}%`} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#d9e0ff" strokeWidth="5" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="#4a4ccf"
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - pct)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: "stroke-dashoffset 0.6s ease" }}
      />
    </svg>
  );
}

export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} className="pop w-full max-w-md rounded-3xl bg-white p-6 shadow-soft" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-xl font-semibold text-rose-800">{title}</h2>
        <div className="mt-2 text-muted">{children}</div>
      </div>
    </div>
  );
}
