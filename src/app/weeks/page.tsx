"use client";
import { useMemo } from "react";
import { BookOpen, PenLine } from "lucide-react";
import { Badge, ButtonLink, Card, PageHeader, ProgressBar, Skeleton } from "@/components/ui";
import { useQuestions, WEEKS } from "@/lib/data";
import { weekStats, WEEK_STATUS_LABEL, type WeekStatus } from "@/lib/progress";
import { useHydrated, useProgress } from "@/lib/store";

const TONE: Record<WeekStatus, "gray" | "lav" | "rose" | "sage"> = {
  "not-started": "gray",
  "in-progress": "lav",
  practiced: "rose",
  completed: "sage",
};

export default function WeeksPage() {
  const questions = useQuestions();
  const progress = useProgress();
  const ready = useHydrated();
  const stats = useMemo(() => WEEKS.map((w) => weekStats(w, questions, progress)), [questions, progress]);

  return (
    <>
      <PageHeader title="Your weeks" subtitle="Twelve weeks, one gentle step at a time. Pick any week to practice or to study at your own pace." />
      {!ready ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {WEEKS.map((w) => (
            <Skeleton key={w} className="h-56" />
          ))}
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {stats.map((s) => (
            <li key={s.week} id={`week-${s.week}`} className="scroll-mt-24">
              <Card className="flex h-full flex-col">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-2xl font-semibold text-rose-800">Week {s.week}</h2>
                  <Badge tone={TONE[s.status]}>{WEEK_STATUS_LABEL[s.status]}</Badge>
                </div>
                {s.eligible === 0 ? (
                  <p className="mt-3 flex-1 text-sm text-muted">No verified questions for this week yet. Nothing is guessed — they appear once the PDF is imported and verified.</p>
                ) : (
                  <>
                    <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                      <Metric label="Verified" value={String(s.eligible)} />
                      <Metric label="Attempted" value={`${s.attempted}`} />
                      <Metric label="Accuracy" value={s.accuracy === null ? "—" : `${Math.round(s.accuracy * 100)}%`} />
                    </dl>
                    <div className="mt-4">
                      <ProgressBar value={s.attempted / s.eligible} label={`Week ${s.week}: ${s.attempted} of ${s.eligible} questions attempted`} />
                      <p className="mt-1.5 text-xs text-muted">
                        {s.attempted} of {s.eligible} questions attempted
                      </p>
                    </div>
                    {s.unverified > 0 && (
                      <p className="mt-2 text-xs text-muted">
                        {s.unverified} question{s.unverified > 1 ? "s are" : " is"} held back until verified.
                      </p>
                    )}
                    <div className="flex-1" />
                  </>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  <ButtonLink href={`/practice?weeks=${s.week}`} disabled={s.eligible === 0} className="flex-1">
                    <PenLine size={16} aria-hidden="true" /> Practice
                  </ButtonLink>
                  <ButtonLink href={`/study?week=${s.week}`} variant="soft" disabled={s.eligible === 0} className="flex-1">
                    <BookOpen size={16} aria-hidden="true" /> Study
                  </ButtonLink>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
      <Card className="mt-6 !bg-lav-50 text-sm text-ink">
        <h2 className="font-display text-lg font-semibold text-lav-600">How a week gets its status</h2>
        <ul className="mt-2 grid gap-1 text-muted sm:grid-cols-2">
          <li><strong className="text-ink">Not started</strong> — no practice answers for this week yet.</li>
          <li><strong className="text-ink">In progress</strong> — some, but not all, of its questions answered.</li>
          <li><strong className="text-ink">Practiced</strong> — every question answered at least once; a few still need another look.</li>
          <li><strong className="text-ink">Completed</strong> — every question answered, and your latest answer to each one is right.</li>
        </ul>
        <p className="mt-2 text-muted">Only practice answers count. Having a PDF uploaded never marks a week complete.</p>
      </Card>
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-blush-50 px-1 py-2">
      <dd className="font-display text-xl font-semibold text-rose-700">{value}</dd>
      <dt className="text-xs text-muted">{label}</dt>
    </div>
  );
}
