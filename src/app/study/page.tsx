"use client";
import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Bookmark, Eye, EyeOff, Flag } from "lucide-react";
import { CorrectAnswerLine, Explanation, OptionList, SourceNote, typeHint } from "@/components/QuestionView";
import { Badge, Button, Card, EmptyState, PageHeader, ProgressBar, Skeleton, cx } from "@/components/ui";
import { markStudied, setStudyPos, toggleId } from "@/lib/actions";
import { useQuestions, WEEKS } from "@/lib/data";
import { eligibleQuestions } from "@/lib/session";
import { store, useHydrated, useProgress } from "@/lib/store";

export default function StudyPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Study />
    </Suspense>
  );
}

function Study() {
  const params = useSearchParams();
  const week = Number(params.get("week"));
  const questions = useQuestions();
  const ready = useHydrated();
  const progress = useProgress();

  if (!ready) return <Skeleton className="h-96" />;
  if (!WEEKS.includes(week)) return <WeekPicker questions={questions} lastWeek={progress.lastStudyWeek} />;
  return <StudyWeek week={week} />;
}

function WeekPicker({ questions, lastWeek }: { questions: ReturnType<typeof useQuestions>; lastWeek: number | null }) {
  const counts = WEEKS.map((w) => ({ w, n: eligibleQuestions(questions, [w]).length }));
  return (
    <>
      <PageHeader title="Study" subtitle="A calm, self-paced mode. No timer, no scoring — look at a question, think, and reveal the answer when you're ready." />
      {lastWeek && (
        <Link href={`/study?week=${lastWeek}`} className="mb-4 block rounded-2xl bg-lav-50 p-4 font-semibold text-lav-600 hover:bg-lav-100">
          Pick up where you left off → Week {lastWeek}
        </Link>
      )}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {counts.map(({ w, n }) => (
          <li key={w}>
            {n > 0 ? (
              <Link
                href={`/study?week=${w}`}
                className="flex h-full flex-col rounded-3xl border border-blush-200 bg-white/90 p-4 shadow-card transition hover:-translate-y-0.5"
              >
                <span className="font-display text-xl font-semibold text-rose-800">Week {w}</span>
                <span className="text-sm text-muted">{n} questions</span>
              </Link>
            ) : (
              <div className="flex h-full flex-col rounded-3xl border border-dashed border-blush-200 p-4 opacity-60">
                <span className="font-display text-xl font-semibold text-rose-800">Week {w}</span>
                <span className="text-sm text-muted">No verified questions</span>
              </div>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

function StudyWeek({ week }: { week: number }) {
  const questions = useQuestions();
  const progress = useProgress();
  const list = useMemo(() => eligibleQuestions(questions, [week]), [questions, week]);
  const saved = progress.studyPos[week] ?? 0;
  const [index, setIndex] = useState(() => Math.min(saved, Math.max(list.length - 1, 0)));
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    store.update((p) => setStudyPos(p, week, index));
  }, [week, index]);

  if (list.length === 0) {
    return (
      <EmptyState title={`Week ${week} has no verified questions yet`}>
        Study mode only shows questions whose answers are confirmed by the solution PDF.
      </EmptyState>
    );
  }
  const q = list[index];
  const go = (i: number) => {
    setIndex(Math.min(Math.max(0, i), list.length - 1));
    setRevealed(false);
  };
  const reveal = () => {
    setRevealed((r) => !r);
    if (!revealed) store.update((p) => markStudied(p, q.id, Date.now()));
  };
  const bookmarked = progress.bookmarks.includes(q.id);
  const flagged = progress.flagged.includes(q.id);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-3 flex items-center justify-between gap-2">
        <Link href="/study" className="text-sm font-semibold text-rose-700 underline underline-offset-2">
          ← All weeks
        </Link>
        <p className="text-sm font-semibold text-muted" aria-live="polite">
          Week {week} · Question {index + 1} of {list.length}
        </p>
      </div>
      <ProgressBar tone="lav" value={(index + 1) / list.length} label={`Study progress, question ${index + 1} of ${list.length}`} />

      <Card className="mt-5" as="section">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-lav-600">{typeHint(q)}</p>
          <Badge tone="lav">Study · no pressure</Badge>
        </div>
        <h2 className="mt-1 text-[1.35rem] font-medium leading-snug sm:text-2xl">{q.text}</h2>
        <OptionList key={q.id} q={q} name={`study-${q.id}`} order={q.options.map((o) => o.id)} selected={[]} locked reveal={revealed} />

        <div className="mt-5">
          <Button variant={revealed ? "soft" : "primary"} onClick={reveal} aria-expanded={revealed}>
            {revealed ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
            {revealed ? "Hide answer" : "Show me the answer"}
          </Button>
        </div>

        {revealed && (
          <div className="pop mt-4 rounded-2xl border border-blush-200 bg-blush-50 p-4">
            <CorrectAnswerLine q={q} />
            <Explanation q={q} />
            <SourceNote q={q} />
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <Button variant="soft" disabled={index === 0} onClick={() => go(index - 1)}>
            <ArrowLeft size={16} aria-hidden="true" /> Previous
          </Button>
          <Button variant="ghost" aria-pressed={bookmarked} onClick={() => store.update((p) => ({ ...p, bookmarks: toggleId(p.bookmarks, q.id) }))}>
            <Bookmark size={16} className={cx(bookmarked && "fill-rose-500")} aria-hidden="true" /> {bookmarked ? "Saved" : "Save"}
          </Button>
          <Button variant="ghost" aria-pressed={flagged} onClick={() => store.update((p) => ({ ...p, flagged: toggleId(p.flagged, q.id) }))}>
            <Flag size={16} className={cx(flagged && "fill-rose-500")} aria-hidden="true" /> {flagged ? "Marked tricky" : "Mark as tricky"}
          </Button>
          <div className="flex-1" />
          <Button disabled={index === list.length - 1} onClick={() => go(index + 1)}>
            Next <ArrowRight size={16} aria-hidden="true" />
          </Button>
        </div>
      </Card>
      <p className="mt-4 text-center text-sm text-muted">Take your time. A short break is okay. 🌱</p>
    </div>
  );
}
