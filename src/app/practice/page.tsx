"use client";
import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, Info, PenLine, RotateCcw } from "lucide-react";
import { Button, ButtonLink, Card, cx, EmptyState, PageHeader, Skeleton } from "@/components/ui";
import { useQuestions, WEEKS } from "@/lib/data";
import { incorrectQuestionIds } from "@/lib/progress";
import { COUNT_PRESETS, eligibleQuestions, resolveCount, type CountChoice } from "@/lib/session";
import { useHydrated, useProgress } from "@/lib/store";
import { useStartSession } from "@/lib/useStartSession";

export default function PracticePage() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <PracticeSetup />
    </Suspense>
  );
}

function PracticeSetup() {
  const params = useSearchParams();
  const questions = useQuestions();
  const progress = useProgress();
  const ready = useHydrated();
  const { startWeeks, startIds } = useStartSession(questions);

  const initial = useMemo(() => {
    const raw = params.get("weeks");
    if (!raw) return [] as number[];
    return raw.split(",").map(Number).filter((n) => WEEKS.includes(n));
  }, [params]);
  const [selected, setSelected] = useState<number[]>(initial);
  const [choice, setChoice] = useState<CountChoice>(10);
  const [custom, setCustom] = useState("");

  const perWeek = useMemo(() => {
    const m = new Map<number, number>();
    for (const w of WEEKS) m.set(w, eligibleQuestions(questions, [w]).length);
    return m;
  }, [questions]);
  const available = selected.reduce((n, w) => n + (perWeek.get(w) ?? 0), 0);
  const customNum = Number(custom);
  const requested: CountChoice = custom !== "" && Number.isFinite(customNum) && customNum >= 1 ? Math.floor(customNum) : choice;
  const resolved = resolveCount(requested, available);
  const incorrect = incorrectQuestionIds(progress, questions);
  const reviewMode = params.get("mode") === "incorrect";

  const toggle = (w: number) => setSelected((s) => (s.includes(w) ? s.filter((x) => x !== w) : [...s, w].sort((a, b) => a - b)));
  const selectable = WEEKS.filter((w) => (perWeek.get(w) ?? 0) > 0);

  if (!ready) return <Skeleton className="h-96" />;

  if (selectable.length === 0) {
    return (
      <EmptyState title="No verified questions yet" action={<ButtonLink href="/admin">Go to import &amp; verify</ButtonLink>}>
        Practice only uses questions whose answers are confirmed by your solution PDFs. Import them first and they&apos;ll show up here.
      </EmptyState>
    );
  }

  return (
    <>
      <PageHeader title="Practice" subtitle="Choose any weeks you like — one, a few, or all twelve. We'll shuffle the questions so they come in a fresh, mixed-up order every time." />

      {reviewMode && (
        <Card className="mb-5 !bg-lav-50">
          <h2 className="flex items-center gap-2 text-xl font-semibold text-lav-600">
            <RotateCcw size={18} aria-hidden="true" /> Review incorrect answers
          </h2>
          <p className="mt-1 text-muted">
            {incorrect.length
              ? `${incorrect.length} question${incorrect.length > 1 ? "s" : ""} you last got wrong. A fresh shot at them — no pressure. 💪`
              : "Nothing to review right now — every question you've answered is currently right. 🌟"}
          </p>
          <Button className="mt-3" disabled={!incorrect.length} onClick={() => startIds(incorrect, "review")}>
            Start review
          </Button>
        </Card>
      )}

      <section aria-labelledby="pick-weeks">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 id="pick-weeks" className="text-2xl font-semibold text-rose-800">
            1 · Pick your weeks
          </h2>
          <div className="flex gap-2">
            <Button variant="soft" className="!min-h-10 !py-1.5" onClick={() => setSelected(selectable)}>
              Select all weeks
            </Button>
            <Button variant="ghost" className="!min-h-10 !py-1.5" onClick={() => setSelected([])}>
              Clear selection
            </Button>
          </div>
        </div>
        <ul className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 lg:grid-cols-6">
          {WEEKS.map((w) => {
            const n = perWeek.get(w) ?? 0;
            const on = selected.includes(w);
            return (
              <li key={w}>
                <label
                  className={cx(
                    "flex min-h-20 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 p-2 text-center transition has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-lav-600",
                    n === 0 && "cursor-not-allowed opacity-50",
                    on ? "border-rose-500 bg-blush-100 shadow-soft" : "border-blush-200 bg-white hover:border-blush-300",
                  )}
                >
                  <input
                    type="checkbox"
                    className="sr-only-input"
                    aria-label={`Week ${w}, ${n} verified question${n === 1 ? "" : "s"}`}
                    checked={on}
                    disabled={n === 0}
                    onChange={() => toggle(w)}
                  />
                  <span className="flex items-center gap-1 font-display text-lg font-semibold text-rose-800">
                    {on && <Check size={16} aria-hidden="true" />}Week {w}
                  </span>
                  <span className="text-xs text-muted">{n} question{n === 1 ? "" : "s"}</span>
                </label>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-[0.95rem] text-ink" aria-live="polite">
          {selected.length === 0 ? "Pick at least one week to begin. 👆" : <><strong>{available}</strong> verified question{available === 1 ? "" : "s"} across {selected.length} week{selected.length > 1 ? "s" : ""}.</>}
        </p>
      </section>

      <section aria-labelledby="pick-count" className="mt-8">
        <h2 id="pick-count" className="mb-3 text-2xl font-semibold text-rose-800">
          2 · How many questions?
        </h2>
        <div className="flex flex-wrap gap-2">
          {[...COUNT_PRESETS, "all" as const].map((c) => {
            const on = custom === "" && choice === c;
            return (
              <button
                key={c}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  setChoice(c);
                  setCustom("");
                }}
                className={cx(
                  "min-h-11 rounded-full border-2 px-5 text-[0.95rem] font-semibold transition",
                  on ? "border-rose-600 bg-rose-600 text-white" : "border-blush-200 bg-white text-rose-800 hover:border-blush-300",
                )}
              >
                {c === "all" ? "All available" : c}
              </button>
            );
          })}
          <label className="flex min-h-11 items-center gap-2 rounded-full border-2 border-blush-200 bg-white px-4 text-[0.95rem] font-semibold text-rose-800">
            Custom
            <input
              inputMode="numeric"
              pattern="[0-9]*"
              value={custom}
              onChange={(e) => setCustom(e.target.value.replace(/\D/g, "").slice(0, 3))}
              aria-label="Custom number of questions"
              placeholder="e.g. 12"
              className="w-20 rounded-lg border border-blush-200 px-2 py-1 text-center font-normal text-ink"
            />
          </label>
        </div>
        {selected.length > 0 && resolved.clamped && (
          <p className="mt-3 flex items-start gap-2 rounded-2xl bg-lav-50 p-3 text-sm text-ink" role="status">
            <Info size={16} className="mt-0.5 shrink-0 text-lav-600" aria-hidden="true" />
            You asked for {String(requested)}, but only {available} verified question{available === 1 ? " is" : "s are"} available in the weeks you picked — so this session will have {resolved.count}.
          </p>
        )}
      </section>

      <Card className="mt-8 !bg-gradient-to-r from-blush-100 to-lav-50">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="max-w-md text-[0.95rem] text-ink">
            {selected.length
              ? <>Ready? <strong>{resolved.count}</strong> question{resolved.count === 1 ? "" : "s"}, mixed from {selected.length === 1 ? `Week ${selected[0]}` : `${selected.length} weeks`}. You&apos;ve got this! 🚀</>
              : "Choose a week to see your session."}
          </p>
          <Button className="px-8 py-3 text-base" disabled={!selected.length || resolved.count === 0} onClick={() => startWeeks(selected, requested)}>
            <PenLine size={18} aria-hidden="true" /> Start practice
          </Button>
        </div>
      </Card>

      <details className="mt-5 rounded-2xl border border-blush-200 bg-white/80 p-4 text-sm text-ink">
        <summary className="cursor-pointer font-semibold text-rose-800">How scoring works</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
          <li>Only questions whose answers are confirmed by your solution PDFs are scored. Anything unclear is held back.</li>
          <li>Each question is worth one point. Skipped questions are never counted as correct.</li>
          <li>Where a question lets you choose several answers, you need exactly the right set — no missing and no extra.</li>
          <li>If the PDF says two answers are both acceptable, either one counts.</li>
          <li>Answer options may appear in a shuffled order; the right answer always follows the PDF.</li>
        </ul>
      </details>
    </>
  );
}
