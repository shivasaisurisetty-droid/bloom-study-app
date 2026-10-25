"use client";
import { useMemo, useState } from "react";
import { Card, Button, EmptyState, Modal, PageHeader, ProgressBar, Skeleton } from "@/components/ui";
import { useQuestions, WEEKS } from "@/lib/data";
import { currentStreak, EMPTY_PROGRESS, overallStats, studyDays, weekStats, WEEK_STATUS_LABEL } from "@/lib/progress";
import { store, useHydrated, useProgress } from "@/lib/store";

const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n * 100)}%`);

export default function ProgressPage() {
  const questions = useQuestions();
  const progress = useProgress();
  const ready = useHydrated();
  const [confirmReset, setConfirmReset] = useState(false);

  const overall = useMemo(() => overallStats(questions, progress, WEEKS), [questions, progress]);
  const weeks = useMemo(() => WEEKS.map((w) => weekStats(w, questions, progress)), [questions, progress]);
  const days = useMemo(() => studyDays(progress).size, [progress]);
  const [now] = useState(Date.now);
  const streak = currentStreak(progress, now);

  const sessions = progress.sessions.slice().reverse();
  const trend = progress.sessions
    .map((s) => (s.correct + s.incorrect > 0 ? s.correct / (s.correct + s.incorrect) : null))
    .filter((v): v is number => v !== null);

  // Insights come only from real attempts, and only once there is enough to say something.
  const rated = weeks.filter((w) => w.attempts >= 3 && w.accuracy !== null);
  const best = rated.length >= 2 ? [...rated].sort((a, b) => b.accuracy! - a.accuracy!)[0] : null;
  const gentle = rated.length >= 2 ? [...rated].sort((a, b) => a.accuracy! - b.accuracy!)[0] : null;
  const insights: string[] = [];
  if (best) insights.push(`Your strongest week so far is Week ${best.week} (${pct(best.accuracy)} across ${best.attempts} answers). 🌟`);
  if (gentle && best && gentle.week !== best.week) insights.push(`Week ${gentle.week} could use a gentle revisit (${pct(gentle.accuracy)} so far) — no rush.`);
  if (trend.length >= 3) {
    const half = Math.floor(trend.length / 2);
    const early = trend.slice(0, half).reduce((a, b) => a + b, 0) / half;
    const late = trend.slice(-half).reduce((a, b) => a + b, 0) / half;
    if (late > early + 0.02) insights.push("Your recent sessions are scoring higher than your earlier ones. You're getting stronger! 💪");
  }

  if (!ready) return <Skeleton className="h-96" />;

  return (
    <>
      <PageHeader title="Your progress" subtitle="Everything here comes from the questions you've really answered — nothing is made up." />
      {overall.attempts === 0 && progress.sessions.length === 0 ? (
        <EmptyState title="A fresh start" icon="🌱">
          Once you answer a few questions, your accuracy, weekly progress and session history will grow right here.
        </EmptyState>
      ) : (
        <div className="grid gap-5">
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile label="Accuracy" value={pct(overall.accuracy)} hint={`${overall.correct} of ${overall.attempts} answers`} />
            <Tile label="Questions tried" value={String(overall.questionsAttempted)} hint="different questions" />
            <Tile label="Sessions" value={String(overall.sessions)} hint="finished" />
            <Tile label="Study days" value={String(days)} hint={streak > 1 ? `${streak} in a row right now` : "every day counts"} />
          </section>

          {insights.length > 0 && (
            <Card className="!bg-gradient-to-r from-blush-100 to-lav-50">
              <h2 className="text-xl font-semibold text-rose-800">Little insights</h2>
              <ul className="mt-2 grid gap-1.5 text-ink">
                {insights.map((t) => (
                  <li key={t}>• {t}</li>
                ))}
              </ul>
            </Card>
          )}

          {trend.length >= 2 && (
            <Card>
              <h2 className="text-xl font-semibold text-rose-800">Session scores</h2>
              <Sparkline values={trend} />
              <p className="mt-1 text-xs text-muted">Percent correct of answered questions, oldest to newest.</p>
            </Card>
          )}

          <Card>
            <h2 className="text-xl font-semibold text-rose-800">Week by week</h2>
            <ul className="mt-3 grid gap-3">
              {weeks.map((w) => (
                <li key={w.week} className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-3 text-sm">
                  <span className="font-semibold text-rose-800">Week {w.week}</span>
                  <ProgressBar value={w.eligible ? w.attempted / w.eligible : 0} label={`Week ${w.week} attempted ${w.attempted} of ${w.eligible}`} />
                  <span className="w-28 text-right text-muted">
                    {w.eligible ? `${w.attempted}/${w.eligible} · ${pct(w.accuracy)}` : "no questions"}
                  </span>
                  <span className="col-span-3 -mt-2 pl-[4.75rem] text-xs text-muted">{WEEK_STATUS_LABEL[w.status]}</span>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <h2 className="text-xl font-semibold text-rose-800">Session history</h2>
            {sessions.length === 0 ? (
              <p className="mt-2 text-muted">No finished sessions yet.</p>
            ) : (
              <ul className="mt-3 grid gap-2">
                {sessions.slice(0, 30).map((s) => {
                  const ans = s.correct + s.incorrect;
                  return (
                    <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-blush-50 px-4 py-2.5 text-sm">
                      <span className="font-semibold text-rose-800">
                        {new Date(s.finishedAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })} ·{" "}
                        {s.weeks.length > 3 ? `${s.weeks.length} weeks` : `Week ${s.weeks.join(", ")}`}
                      </span>
                      <span className="text-muted">
                        {s.correct}/{s.total} correct{ans ? ` · ${pct(s.correct / ans)}` : ""}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      )}

      <div className="mt-8 text-center">
        <button type="button" onClick={() => setConfirmReset(true)} className="text-sm text-muted underline underline-offset-2 hover:text-rose-700">
          Start fresh (erase progress on this device)
        </button>
      </div>
      {confirmReset && (
        <Modal title="Erase your progress?" onClose={() => setConfirmReset(false)}>
          <p>This clears attempts, sessions, bookmarks and review marks saved on this device. It can&apos;t be undone.</p>
          <div className="mt-5 grid gap-2">
            <Button onClick={() => setConfirmReset(false)}>Keep my progress</Button>
            <Button
              variant="ghost"
              onClick={() => {
                store.set({ ...EMPTY_PROGRESS, settings: store.get().settings });
                setConfirmReset(false);
              }}
            >
              Erase everything
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Card className="!p-4">
      <p className="text-sm font-semibold text-muted">{label}</p>
      <p className="font-display text-3xl font-semibold text-rose-700">{value}</p>
      <p className="text-xs text-muted">{hint}</p>
    </Card>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const w = 320;
  const h = 80;
  const pts = values.map((v, i) => [(i / Math.max(values.length - 1, 1)) * (w - 16) + 8, h - 8 - v * (h - 16)] as const);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-2 w-full max-w-lg" role="img" aria-label={`Session scores: ${values.map((v) => Math.round(v * 100) + "%").join(", ")}`}>
      <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke="#5f67e8" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r="4" fill="#fff" stroke="#3b3bb3" strokeWidth="2.5" />
      ))}
    </svg>
  );
}
