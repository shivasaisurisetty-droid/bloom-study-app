import type { Question } from "./types";

/** A question may only be scored if the source gave an explicit, verified answer key. */
export function isScorable(q: Question): boolean {
  return q.verification.status === "verified" && q.correctOptionIds.length > 0;
}

export interface AnswerCheck {
  answered: boolean;
  correct: boolean;
}

/**
 * Scoring rules (shown to the student on the practice screen):
 *  - Unanswered is never correct.
 *  - Single answer: the one chosen option must be the source's correct option.
 *    If the source says "both options are correct" (acceptAny), either one counts.
 *  - Multi-select: the chosen set must match the source's answer set EXACTLY
 *    (no missing options, no extra options). No partial credit.
 *  - Unverified questions are never scored.
 */
export function checkAnswer(q: Question, selected: readonly string[]): AnswerCheck {
  const valid = new Set(q.options.map((o) => o.id));
  const chosen = [...new Set(selected)].filter((id) => valid.has(id));
  if (chosen.length === 0) return { answered: false, correct: false };
  if (!isScorable(q)) return { answered: true, correct: false };
  const key = new Set(q.correctOptionIds);
  if (q.type === "multi") {
    return { answered: true, correct: chosen.length === key.size && chosen.every((id) => key.has(id)) };
  }
  if (chosen.length !== 1) return { answered: true, correct: false };
  return { answered: true, correct: key.has(chosen[0]) };
}

export function correctAnswerText(q: Question): string {
  const parts = q.options.filter((o) => q.correctOptionIds.includes(o.id)).map((o) => o.text);
  return q.acceptAny ? parts.join("  /  ") + "  (either is accepted)" : parts.join("  +  ");
}
