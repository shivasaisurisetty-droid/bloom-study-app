"use client";
import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Flag, Home, RotateCcw, Shuffle, XCircle } from "lucide-react";
import { CorrectAnswerLine, SourceNote } from "@/components/QuestionView";
import { Badge, Button, ButtonLink, Card, EmptyState, Petals, ProgressRing, Skeleton } from "@/components/ui";
import { questionById, useQuestions } from "@/lib/data";
import { resultMessage } from "@/lib/copy";
import { weekStats } from "@/lib/progress";
import { useHydrated, useProgress } from "@/lib/store";
import { useStartSession } from "@/lib/useStartSession";

export default function ResultsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Results />
    </Suspense>
  );
}

function fmtTime(sec: number) {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  return `${m}m ${sec % 60}s`;
}

function Results() {
  const params = useSearchParams();
  const questions = useQuestions();
  const progress = useProgress();
  const ready = useHydrated();
  const { startWeeks, startIds } = useStartSession(questions);
  const byId = useMemo(() => questionById(questions), [questions]);
  const [burst, setBurst] = useState(0);

  const id = params.get("id");
  const sessions = progress.sessions;
  const idx = id ? sessions.findIndex((s) => s.id === id) : sessions.length - 1;
  const rec = idx >= 0 ? sessions[idx] : null;

  // Which weeks did this session take all the way to "Completed"?
  const completedWeeks = useMemo(() => {
    if (!rec) return [];
    return rec.weeks.filter((w) => weekStats(w, questions, progress).status === "completed");
  }, [rec, questions, progress]);

  const celebrate = !!rec && rec.total > 0 && (rec.correct / Math.max(rec.correct + rec.incorrect, 1) >= 0.85 || completedWeeks.length > 0);
  useEffect(() => {
    if (!rec || !celebrate) return;
    const key = `bloom:celebrated:${rec.id}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      /* fine */
    }
    const t = setTimeout(() => setBurst(1), 0);
    return () => clearTimeout(t);
  }, [rec, celebrate]);

  if (!ready) return <Skeleton className="h-96" />;
  if (!rec) {
    return (
      <EmptyState title="No results to show yet" action={<ButtonLink href="/practice">Start a practice session</ButtonLink>}>
        Finish a practice session and your results will be waiting here.
      </EmptyState>
    );
  }

  const answered = rec.correct + rec.incorrect;
  const pct = answered > 0 ? rec.correct / answered : null;
  const scoreOfTotal = rec.total ? rec.correct / rec.total : 0;
  const prev = idx > 0 ? sessions[idx - 1] : null;
  const prevAnswered = prev ? prev.correct + prev.incorrect : 0;
  const prevPct = prev && prevAnswered > 0 ? prev.correct / prevAnswered : null;

  const byWeek = [...new Set(rec.results.map((r) => r.week))].sort((a, b) => a - b).map((w) => {
    const rs = rec.results.filter((r) => r.week === w);
    return { week: w, total: rs.length, correct: rs.filter((r) => r.correct).length, answered: rs.filter((r) => r.answered).length };
  });
  const wrong = rec.results.filter((r) => r.answered && !r.correct);

  return (
    <div className="grid gap-5">
      <Petals burst={burst} count={22} />
      <Card className="relative overflow-hidden text-center !bg-gradient-to-br from-white via-blush-50 to-lav-50">
        <p className="text-sm font-semibold uppercase tracking-wide text-lav-600">Session complete</p>
        <div className="mt-3 flex flex-col items-center gap-2">
          <ProgressRing value={scoreOfTotal} size={120} label="Score" />
          <h1 className="font-display text-5xl font-semibold text-rose-700">
            {rec.correct} <span className="text-3xl text-muted">/ {rec.total}</span>
          </h1>
          <p className="text-lg text-ink">{pct === null ? "No answers submitted" : `${Math.round(pct * 100)}% of the questions you answered`}</p>
        </div>
        <p className="pop mx-auto mt-4 max-w-lg text-lg font-medium text-rose-800">{resultMessage(pct, prevPct)}</p>
        {completedWeeks.length > 0 && (
          <p className="mt-2 text-sage-700">
            🎉 {completedWeeks.length === 1 ? `Week ${completedWeeks[0]} is now complete!` : `Weeks ${completedWeeks.join(", ")} are now complete!`}
          </p>
        )}
      </Card>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Session numbers">
        <Num label="Correct" value={rec.correct} icon={<CheckCircle2 size={16} className="text-sage-700" aria-hidden="true" />} />
        <Num label="Incorrect" value={rec.incorrect} icon={<XCircle size={16} className="text-rose-600" aria-hidden="true" />} />
        <Num label="Unanswered" value={rec.unanswered} />
        <Num label="Time" value={rec.durationSec > 0 ? fmtTime(rec.durationSec) : "—"} />
      </section>

      <Card>
        <h2 className="text-2xl font-semibold text-rose-800">By week</h2>
        <ul className="mt-3 grid gap-2">
          {byWeek.map((w) => (
            <li key={w.week} className="flex items-center justify-between gap-3 rounded-2xl bg-blush-50 px-4 py-2.5">
              <span className="font-semibold text-rose-800">Week {w.week}</span>
              <span className="text-sm text-muted">
                {w.correct} of {w.total} correct{w.answered < w.total ? ` · ${w.total - w.answered} unanswered` : ""}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      {wrong.length > 0 && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-2xl font-semibold text-rose-800">Questions to look at again</h2>
            <Badge tone="rose">{wrong.length}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted">No judgment — these are just the ones worth a second look. 💪</p>
          <ul className="mt-3 grid gap-3">
            {wrong.map((r) => {
              const q = byId.get(r.qid);
              if (!q) return null;
              const mine = q.options.filter((o) => r.selected.includes(o.id)).map((o) => o.text).join(" + ");
              return (
                <li key={r.qid} className="rounded-2xl border border-blush-200 p-4">
                  <p className="text-xs font-semibold text-lav-600">Week {q.week}</p>
                  <p className="mt-0.5 font-medium">{q.text}</p>
                  <p className="mt-2 text-sm text-muted">
                    You answered: <span className="text-rose-700">{mine || "—"}</span>
                  </p>
                  <CorrectAnswerLine q={q} />
                  <SourceNote q={q} />
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {rec.flagged.length > 0 && (
        <Card>
          <h2 className="flex items-center gap-2 text-2xl font-semibold text-rose-800">
            <Flag size={20} aria-hidden="true" /> Marked for review
          </h2>
          <ul className="mt-3 grid gap-2">
            {rec.flagged.map((qid) => {
              const q = byId.get(qid);
              return q ? (
                <li key={qid} className="rounded-2xl bg-blush-50 px-4 py-2.5 text-sm">
                  <span className="font-semibold text-lav-600">Week {q.week} · </span>
                  {q.text}
                </li>
              ) : null;
            })}
          </ul>
          <Link href="/review" className="mt-3 inline-block text-sm font-semibold text-rose-700 underline underline-offset-2">
            Open all review items
          </Link>
        </Card>
      )}

      <div className="flex flex-wrap gap-3">
        <Button disabled={wrong.length === 0} onClick={() => startIds(wrong.map((r) => r.qid), "retry")}>
          <RotateCcw size={16} aria-hidden="true" /> Retry incorrect ({wrong.length})
        </Button>
        <Button variant="soft" disabled={rec.weeks.length === 0} onClick={() => startWeeks(rec.weeks, rec.requested)}>
          <Shuffle size={16} aria-hidden="true" /> Another randomized session
        </Button>
        <ButtonLink href="/" variant="ghost">
          <Home size={16} aria-hidden="true" /> Back home
        </ButtonLink>
      </div>
    </div>
  );
}

function Num({ label, value, icon }: { label: string; value: number | string; icon?: React.ReactNode }) {
  return (
    <Card className="!p-4 text-center">
      <p className="flex items-center justify-center gap-1.5 text-sm font-semibold text-muted">
        {icon}
        {label}
      </p>
      <p className="font-display text-3xl font-semibold text-rose-700">{value}</p>
    </Card>
  );
}
