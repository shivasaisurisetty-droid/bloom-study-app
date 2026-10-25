"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Bookmark, Flag, LogOut } from "lucide-react";
import { CorrectAnswerLine, Explanation, OptionList, SourceNote, typeHint } from "@/components/QuestionView";
import { Badge, Button, ButtonLink, Card, EmptyState, Modal, Petals, ProgressBar, Skeleton } from "@/components/ui";
import { addElapsed, finishSession, goTo, setSelection, submitAnswer, toggleId } from "@/lib/actions";
import { CORRECT_MESSAGES, INCORRECT_MESSAGES, pick } from "@/lib/copy";
import { questionById, useQuestions } from "@/lib/data";
import { store, useHydrated, useProgress } from "@/lib/store";

export default function SessionPage() {
  const router = useRouter();
  const questions = useQuestions();
  const progress = useProgress();
  const ready = useHydrated();
  const session = progress.active;
  const byId = useMemo(() => questionById(questions), [questions]);
  const [confirmExit, setConfirmExit] = useState(false);
  const [burst, setBurst] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Count time only while she is actually here and the tab is visible.
  useEffect(() => {
    if (!session) return;
    let last = Date.now();
    const flush = () => {
      const now = Date.now();
      const delta = Math.min(now - last, 60_000);
      last = now;
      if (document.visibilityState === "visible") store.update((p) => addElapsed(p, delta));
    };
    const id = setInterval(flush, 5000);
    const onVis = () => {
      if (document.visibilityState === "hidden") flush();
      else last = Date.now();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      flush();
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id]);

  const index = session?.index ?? 0;
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, [index, session?.id]);

  if (!ready) return <Skeleton className="h-96" />;

  if (!session) {
    return (
      <EmptyState title="No practice in progress" action={<ButtonLink href="/practice">Choose weeks to practice</ButtonLink>}>
        Start a session whenever you feel ready. There&apos;s no rush. 🌱
      </EmptyState>
    );
  }

  const total = session.questionIds.length;
  const qid = session.questionIds[index];
  const q = byId.get(qid);
  if (!q) {
    return (
      <EmptyState title="That question isn't available any more" action={<Button onClick={() => finish()}>Finish this session</Button>}>
        It may have been changed in the importer. You can wrap up what you&apos;ve done so far.
      </EmptyState>
    );
  }

  const answer = session.answers[qid];
  const submitted = !!answer?.submitted;
  const selected = answer?.selected ?? [];
  const answeredCount = Object.values(session.answers).filter((a) => a.submitted).length;
  const flagged = progress.flagged.includes(qid);
  const bookmarked = progress.bookmarks.includes(qid);
  const isLast = index === total - 1;
  const seed = index + session.startedAt;

  function finish() {
    const { progress: next, record } = finishSession(store.get(), questions);
    store.set(next);
    router.push(record ? `/practice/results?id=${record.id}` : "/practice");
  }

  function submit() {
    if (!q || selected.length === 0) return;
    const before = store.get().attempts.length;
    store.update((p) => submitAnswer(p, q, Date.now()));
    const after = store.get();
    if (after.attempts.length > before && after.attempts[after.attempts.length - 1].correct) setBurst((b) => b + 1);
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Petals burst={burst} count={9} />
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-muted" aria-live="polite">
          Question {index + 1} of {total}
        </p>
        <div className="flex items-center gap-2">
          <Badge tone="lav">Week {q.week}</Badge>
          <button
            type="button"
            onClick={() => setConfirmExit(true)}
            className="flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-muted hover:bg-blush-100"
          >
            <LogOut size={16} aria-hidden="true" /> Exit
          </button>
        </div>
      </div>
      <ProgressBar value={(index + (submitted ? 1 : 0)) / total} label={`Question ${index + 1} of ${total}`} />

      <Card className="mt-5 rise-in" as="section">
        <p className="text-sm font-semibold text-lav-600">{typeHint(q)}</p>
        <h2 ref={headingRef} tabIndex={-1} className="mt-1 text-[1.35rem] font-medium leading-snug text-ink outline-none sm:text-2xl">
          {q.text}
        </h2>

        <OptionList
          key={qid}
          q={q}
          name={`q-${qid}`}
          order={session.optionOrder[qid] ?? q.options.map((o) => o.id)}
          selected={selected}
          locked={submitted}
          reveal={submitted}
          onChange={(sel) => store.update((p) => setSelection(p, qid, sel))}
        />

        {submitted && (
          <div className="pop mt-5 rounded-2xl border border-blush-200 bg-blush-50 p-4" role="status">
            <p className={`text-lg font-semibold ${answer.correct ? "text-sage-700" : "text-rose-800"}`}>
              {answer.correct ? pick(CORRECT_MESSAGES, seed) : pick(INCORRECT_MESSAGES, seed)}
            </p>
            <p className="mt-1 text-sm font-semibold text-muted">{answer.correct ? "Correct" : "Not quite"}</p>
            <CorrectAnswerLine q={q} />
            <Explanation q={q} />
            <SourceNote q={q} />
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <Button variant="soft" disabled={index === 0} onClick={() => store.update((p) => goTo(p, index - 1))}>
            <ArrowLeft size={16} aria-hidden="true" /> Previous
          </Button>
          <Button
            variant="ghost"
            aria-pressed={flagged}
            onClick={() => store.update((p) => ({ ...p, flagged: toggleId(p.flagged, qid) }))}
          >
            <Flag size={16} className={flagged ? "fill-rose-500" : ""} aria-hidden="true" /> {flagged ? "Marked for review" : "Mark for review"}
          </Button>
          <Button
            variant="ghost"
            aria-pressed={bookmarked}
            onClick={() => store.update((p) => ({ ...p, bookmarks: toggleId(p.bookmarks, qid) }))}
          >
            <Bookmark size={16} className={bookmarked ? "fill-rose-500" : ""} aria-hidden="true" /> {bookmarked ? "Bookmarked" : "Bookmark"}
          </Button>
          <div className="flex-1" />
          {!submitted ? (
            <>
              <Button disabled={selected.length === 0} onClick={submit}>
                Submit answer
              </Button>
              {!isLast && (
                <Button variant="ghost" onClick={() => store.update((p) => goTo(p, index + 1))}>
                  Skip <ArrowRight size={16} aria-hidden="true" />
                </Button>
              )}
              {isLast && (
                <Button variant="soft" onClick={finish}>
                  Finish
                </Button>
              )}
            </>
          ) : isLast ? (
            <Button onClick={finish}>See my results 🎉</Button>
          ) : (
            <Button onClick={() => store.update((p) => goTo(p, index + 1))}>
              Next question <ArrowRight size={16} aria-hidden="true" />
            </Button>
          )}
        </div>
      </Card>

      <p className="mt-4 text-center text-sm text-muted">
        {answeredCount} answered so far · your progress is saved as you go.
      </p>

      {confirmExit && (
        <Modal title="Leave this session?" onClose={() => setConfirmExit(false)}>
          <p>Your answers are saved. You can pause and pick this up again from the Home screen, or wrap up now and see how you did.</p>
          <div className="mt-5 grid gap-2">
            <Button onClick={() => setConfirmExit(false)}>Keep going 💪</Button>
            <Button variant="soft" onClick={() => router.push("/")}>
              Pause &amp; leave
            </Button>
            <Button variant="ghost" onClick={finish}>
              End now &amp; see results
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
