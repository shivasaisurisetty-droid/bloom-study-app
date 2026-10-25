"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, Flame, Heart, RotateCcw, Sparkles } from "lucide-react";
import { Badge, ButtonLink, Card, Flower, ProgressRing, Skeleton } from "@/components/ui";
import { dataset, useQuestions, WEEKS } from "@/lib/data";
import { ENCOURAGEMENTS, greeting, pick } from "@/lib/copy";
import { currentStreak, incorrectQuestionIds, overallStats, weekStats, WEEK_STATUS_LABEL } from "@/lib/progress";
import { eligibleQuestions } from "@/lib/session";
import { useHydrated, useProgress } from "@/lib/store";

export default function HomePage() {
  const questions = useQuestions();
  const progress = useProgress();
  const ready = useHydrated();
  const [nudge, setNudge] = useState(0);

  const eligible = useMemo(() => eligibleQuestions(questions), [questions]);
  const overall = useMemo(() => overallStats(questions, progress, WEEKS), [questions, progress]);
  const perWeek = useMemo(() => WEEKS.map((w) => weekStats(w, questions, progress)), [questions, progress]);
  const incorrect = useMemo(() => incorrectQuestionIds(progress, questions), [questions, progress]);

  if (!ready) {
    return (
      <div className="grid gap-4">
        <Skeleton className="h-64" />
        <Skeleton className="h-32" />
      </div>
    );
  }

  if (dataset.questions.length === 0) {
    return (
      <Card className="text-center">
        <Flower className="mx-auto" size={72} />
        <h1 className="mt-2 text-3xl font-semibold text-rose-800">Almost ready to bloom</h1>
        <p className="mx-auto mt-2 max-w-lg text-muted">
          No questions have been imported yet. Questions only ever come from the solution PDFs, so the app is waiting for them.
        </p>
        <div className="mt-4 flex justify-center">
          <ButtonLink href="/admin">Import the PDFs</ButtonLink>
        </div>
      </Card>
    );
  }

  const now = new Date();
  const streak = currentStreak(progress, now.getTime());
  const message = pick(ENCOURAGEMENTS, now.getDate() + progress.sessions.length * 3 + nudge);
  const active = progress.active;
  const continueHref = active ? "/practice/session" : progress.lastStudyWeek ? `/study?week=${progress.lastStudyWeek}` : null;
  const continueLabel = active
    ? `Continue practice · question ${Math.min(active.index + 1, active.questionIds.length)} of ${active.questionIds.length}`
    : progress.lastStudyWeek
      ? `Continue studying Week ${progress.lastStudyWeek}`
      : "Continue where you left off";

  return (
    <div className="grid gap-6">
      <section className="relative overflow-hidden rounded-[2rem] border border-blush-200 bg-gradient-to-br from-white via-blush-50 to-lav-50 p-6 shadow-card sm:p-10">
        <Flower className="sway absolute -right-4 -top-4 opacity-90 sm:right-8 sm:top-6" size={110} />
        <Flower className="float absolute bottom-3 right-24 hidden opacity-60 sm:block" size={48} />
        <div className="relative max-w-xl">
          <h1 className="text-4xl font-semibold text-rose-800 sm:text-5xl">{greeting(now.getHours())}</h1>
          <p className="mt-3 text-lg leading-relaxed text-ink/90">
            Ready to make some progress today? You don&apos;t have to learn everything at once — one question at a time, a little every day, adds up fast. 🚀
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <ButtonLink href="/practice" className="px-7 py-3 text-base">
              Start Practicing <ArrowRight size={18} aria-hidden="true" />
            </ButtonLink>
            <ButtonLink href={continueHref ?? "/practice"} variant="soft" disabled={!continueHref}>
              {continueLabel}
            </ButtonLink>
            <ButtonLink href="/practice?mode=incorrect" variant="lav" disabled={incorrect.length === 0}>
              <RotateCcw size={16} aria-hidden="true" /> Review Incorrect Answers{incorrect.length ? ` (${incorrect.length})` : ""}
            </ButtonLink>
          </div>
          {!continueHref && <p className="mt-3 text-sm text-muted">Nothing to continue yet — your first session will show up here.</p>}
        </div>
      </section>

      <section aria-label="Your numbers" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Verified questions" value={String(eligible.length)} hint="from your solution PDFs" />
        <Stat
          label="Weeks started"
          value={`${overall.weeksStarted} / 12`}
          hint={overall.weeksCompleted ? `${overall.weeksCompleted} completed 🎉` : "none completed yet"}
        />
        <Stat
          label="Practice accuracy"
          value={overall.accuracy === null ? "—" : `${Math.round(overall.accuracy * 100)}%`}
          hint={overall.accuracy === null ? "answer a question to see this" : `${overall.correct} of ${overall.attempts} answers`}
        />
        <Stat
          label="Study days in a row"
          value={streak > 0 ? String(streak) : "—"}
          hint={streak > 1 ? "nice consistency — rest days are fine too" : streak === 1 ? "great start" : "start whenever you like"}
          icon={streak > 1 ? <Flame size={16} className="text-rose-500" aria-hidden="true" /> : undefined}
        />
      </section>

      <Card className="flex items-center gap-4 bg-gradient-to-r from-blush-100 to-lav-50">
        <Sparkles className="shrink-0 text-rose-600" aria-hidden="true" />
        <p className="flex-1 text-lg font-medium text-rose-800" aria-live="polite">
          {message}
        </p>
        <button
          type="button"
          onClick={() => setNudge((n) => n + 1)}
          aria-label="Show another encouraging message"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-rose-600 hover:bg-white"
        >
          <Heart size={20} aria-hidden="true" />
        </button>
      </Card>

      <section aria-labelledby="weekly">
        <div className="mb-3 flex items-end justify-between">
          <h2 id="weekly" className="text-2xl font-semibold text-rose-800">
            Your weeks
          </h2>
          <Link href="/weeks" className="text-sm font-semibold text-rose-700 underline underline-offset-2">
            See all
          </Link>
        </div>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {perWeek.map((s) => (
            <li key={s.week}>
              <Link
                href={`/weeks#week-${s.week}`}
                className="flex items-center gap-3 rounded-2xl border border-blush-200 bg-white/90 p-3 shadow-card transition hover:-translate-y-0.5"
              >
                <ProgressRing value={s.eligible ? s.attempted / s.eligible : 0} label={`Week ${s.week} progress`} />
                <span className="min-w-0">
                  <span className="block font-semibold text-rose-800">Week {s.week}</span>
                  <span className="block truncate text-xs text-muted">{s.eligible ? WEEK_STATUS_LABEL[s.status] : "No questions yet"}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {overall.attempts === 0 && (
        <p className="text-center text-sm text-muted">
          Everything here starts at zero and grows only from what you really practice. <Badge tone="lav">no fake progress</Badge>
        </p>
      )}
    </div>
  );
}

function Stat({ label, value, hint, icon }: { label: string; value: string; hint: string; icon?: React.ReactNode }) {
  return (
    <Card className="!p-4">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-muted">
        {icon}
        {label}
      </p>
      <p className="mt-1 font-display text-3xl font-semibold text-rose-700">{value}</p>
      <p className="text-xs text-muted">{hint}</p>
    </Card>
  );
}
