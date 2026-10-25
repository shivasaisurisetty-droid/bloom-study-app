"use client";
import { BadgeCheck, CheckCircle2, ExternalLink, FileText, XCircle } from "lucide-react";
import type { Question, VerificationMethod } from "@/lib/types";
import { correctAnswerText } from "@/lib/scoring";
import { cx } from "./ui";

const METHOD_LABEL: Record<VerificationMethod, string> = {
  highlight: "the answer is highlighted in the source PDF",
  "accepted-answer-line": "the PDF prints this as the accepted answer",
  "answer-line+marker": "the PDF prints this answer and marks it with a ✓",
  "trailing-answer": "the PDF prints this answer after the statement",
  "trailing-answer+highlight": "the PDF prints this answer and highlights it",
  manual: "confirmed by hand against the PDF",
};

export function sourceHref(q: Question) {
  return `/sources/${encodeURIComponent(q.source.file)}#page=${q.source.page}`;
}

export function SourceNote({ q, showContext = true }: { q: Question; showContext?: boolean }) {
  const method = q.verification.method;
  return (
    <div className="mt-4 rounded-2xl bg-lav-50 p-3.5 text-sm text-ink">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <FileText size={15} className="text-lav-600" aria-hidden="true" />
        <span>
          Source: {q.source.file} · PDF page {q.source.page}
        </span>
        <a
          href={sourceHref(q)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 font-semibold text-lav-600 underline underline-offset-2"
        >
          Open page <ExternalLink size={13} aria-hidden="true" />
        </a>
      </p>
      {method && (
        <p className="mt-1.5 flex items-start gap-1.5 text-muted">
          <BadgeCheck size={15} className="mt-0.5 shrink-0 text-sage-700" aria-hidden="true" />
          <span>Answer key: {METHOD_LABEL[method]}.</span>
        </p>
      )}
      {showContext && q.context && (
        <details className="mt-2">
          <summary className="cursor-pointer font-semibold text-lav-600">See the original text from the PDF</summary>
          <pre className="mt-2 whitespace-pre-wrap rounded-xl bg-white p-3 font-body text-[0.85rem] leading-relaxed text-ink">{q.context}</pre>
        </details>
      )}
    </div>
  );
}

export function Explanation({ q }: { q: Question }) {
  return (
    <p className="mt-3 text-[0.95rem] text-ink">
      <span className="font-semibold">Explanation: </span>
      {q.explanation ? q.explanation : <span className="text-muted">No explanation provided in the source PDF.</span>}
    </p>
  );
}

export function typeHint(q: Question): string {
  if (q.type === "multi") return "Select all that apply";
  if (q.type === "true_false") return "True or false";
  if (q.type === "fill_blank") return "Choose the word or phrase that fits the blank";
  return "Choose one answer";
}

interface Props {
  q: Question;
  order: string[];
  selected: string[];
  onChange?: (next: string[]) => void;
  /** answers are frozen */
  locked: boolean;
  /** show right/wrong styling and labels */
  reveal: boolean;
  name: string;
}

export function OptionList({ q, order, selected, onChange, locked, reveal, name }: Props) {
  const multi = q.type === "multi";
  const byId = new Map(q.options.map((o) => [o.id, o]));
  const correct = new Set(q.correctOptionIds);

  const toggle = (id: string) => {
    if (locked || !onChange) return;
    if (multi) onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
    else onChange([id]);
  };

  return (
    <fieldset className="mt-5">
      <legend className="sr-only">{typeHint(q)}</legend>
      <ul className="grid gap-2.5">
        {order.map((id, pos) => {
          const o = byId.get(id);
          if (!o) return null;
          const isSel = selected.includes(id);
          const isRight = reveal && correct.has(id);
          const isWrong = reveal && isSel && !correct.has(id);
          return (
            <li key={id}>
              <label
                className={cx(
                  "flex min-h-14 cursor-pointer items-start gap-3 rounded-2xl border-2 px-4 py-3 transition has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-lav-600",
                  locked && "cursor-default",
                  !reveal && (isSel ? "border-rose-500 bg-blush-100" : "border-blush-200 bg-white hover:border-blush-300 hover:bg-blush-50"),
                  isRight && "border-sage-700 bg-sage-100",
                  isWrong && "border-rose-600 bg-blush-100",
                  reveal && !isRight && !isWrong && "border-blush-200 bg-white opacity-80",
                )}
              >
                <input
                  type={multi ? "checkbox" : "radio"}
                  name={name}
                  value={id}
                  checked={isSel}
                  disabled={locked}
                  onChange={() => toggle(id)}
                  className="sr-only-input"
                />
                <span
                  aria-hidden="true"
                  className={cx(
                    "mt-0.5 grid h-7 w-7 shrink-0 place-items-center border-2 text-sm font-bold",
                    multi ? "rounded-lg" : "rounded-full",
                    isSel || isRight ? "border-rose-600 bg-rose-600 text-white" : "border-blush-300 text-rose-700",
                    isRight && "border-sage-700 bg-sage-700",
                  )}
                >
                  {String.fromCharCode(65 + pos)}
                </span>
                <span className="flex-1 pt-0.5 text-[1.02rem] leading-snug">{o.text}</span>
                {isRight && (
                  <span className="flex items-center gap-1 pt-0.5 text-sm font-semibold text-sage-700">
                    <CheckCircle2 size={18} aria-hidden="true" /> <span className="hidden sm:inline">Correct answer</span>
                    <span className="sr-only sm:hidden">Correct answer</span>
                  </span>
                )}
                {isWrong && (
                  <span className="flex items-center gap-1 pt-0.5 text-sm font-semibold text-rose-700">
                    <XCircle size={18} aria-hidden="true" /> <span className="hidden sm:inline">Your answer</span>
                    <span className="sr-only sm:hidden">Your answer</span>
                  </span>
                )}
              </label>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}

export function CorrectAnswerLine({ q }: { q: Question }) {
  return (
    <p className="mt-3 text-[0.98rem]">
      <span className="font-semibold text-sage-700">Correct answer: </span>
      <span className="text-ink">{correctAnswerText(q)}</span>
    </p>
  );
}
