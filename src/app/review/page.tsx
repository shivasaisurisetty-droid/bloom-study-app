"use client";
import { useMemo, useState } from "react";
import { Bookmark, Flag, RotateCcw, X } from "lucide-react";
import { CorrectAnswerLine, Explanation, SourceNote } from "@/components/QuestionView";
import { Badge, Button, Card, cx, EmptyState, PageHeader, Skeleton } from "@/components/ui";
import { toggleId } from "@/lib/actions";
import { questionById, useQuestions } from "@/lib/data";
import { incorrectQuestionIds } from "@/lib/progress";
import { store, useHydrated, useProgress } from "@/lib/store";
import { useStartSession } from "@/lib/useStartSession";
import type { Question } from "@/lib/types";

type Tab = "bookmarks" | "flagged" | "incorrect";

export default function ReviewPage() {
  const questions = useQuestions();
  const progress = useProgress();
  const ready = useHydrated();
  const { startIds } = useStartSession(questions);
  const [tab, setTab] = useState<Tab>("bookmarks");
  const byId = useMemo(() => questionById(questions), [questions]);

  const lists: Record<Tab, Question[]> = useMemo(() => {
    const pickQs = (ids: string[]) => ids.map((id) => byId.get(id)).filter((q): q is Question => !!q);
    return {
      bookmarks: pickQs(progress.bookmarks),
      flagged: pickQs(progress.flagged),
      incorrect: pickQs(incorrectQuestionIds(progress, questions)),
    };
  }, [progress, questions, byId]);

  if (!ready) return <Skeleton className="h-96" />;

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "bookmarks", label: "Bookmarked", icon: <Bookmark size={15} aria-hidden="true" /> },
    { id: "flagged", label: "Marked for review", icon: <Flag size={15} aria-hidden="true" /> },
    { id: "incorrect", label: "Incorrect answers", icon: <RotateCcw size={15} aria-hidden="true" /> },
  ];
  const items = lists[tab];
  const empty: Record<Tab, string> = {
    bookmarks: "Save a question while you practice or study and it will wait for you here.",
    flagged: "Mark a question for review whenever something feels tricky. It will be kept here.",
    incorrect: "No wrong answers waiting. Questions you last got wrong will appear here, ready for a gentle second try.",
  };

  return (
    <>
      <PageHeader title="Bookmarks & review" subtitle="Everything you've saved, flagged, or want to try again — all in one cozy spot." />
      <div role="tablist" aria-label="Review lists" className="mb-5 flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cx(
              "flex min-h-11 items-center gap-2 rounded-full border-2 px-4 text-sm font-semibold transition",
              tab === t.id ? "border-rose-600 bg-rose-600 text-white" : "border-blush-200 bg-white text-rose-800 hover:border-blush-300",
            )}
          >
            {t.icon}
            {t.label} <span className={cx("rounded-full px-1.5 text-xs", tab === t.id ? "bg-white/25" : "bg-blush-100")}>{lists[t.id].length}</span>
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <EmptyState title="Nothing here yet">{empty[tab]}</EmptyState>
      ) : (
        <>
          <div className="mb-4 flex justify-end">
            <Button onClick={() => startIds(items.map((q) => q.id), "review")}>
              <RotateCcw size={16} aria-hidden="true" /> Practice these {items.length}
            </Button>
          </div>
          <ul role="tabpanel" className="grid gap-3">
            {items.map((q) => (
              <li key={q.id}>
                <Card className="!p-4 sm:!p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <Badge tone="lav">Week {q.week}</Badge>
                      <p className="mt-1.5 font-medium">{q.text}</p>
                    </div>
                    {tab !== "incorrect" && (
                      <button
                        type="button"
                        aria-label={tab === "bookmarks" ? "Remove bookmark" : "Remove review mark"}
                        onClick={() =>
                          store.update((p) =>
                            tab === "bookmarks" ? { ...p, bookmarks: toggleId(p.bookmarks, q.id) } : { ...p, flagged: toggleId(p.flagged, q.id) },
                          )
                        }
                        className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted hover:bg-blush-100"
                      >
                        <X size={18} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                  <details className="mt-2">
                    <summary className="cursor-pointer text-sm font-semibold text-rose-700">Show answer</summary>
                    <div className="mt-2 rounded-2xl bg-blush-50 p-3">
                      <CorrectAnswerLine q={q} />
                      <Explanation q={q} />
                      <SourceNote q={q} />
                    </div>
                  </details>
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
