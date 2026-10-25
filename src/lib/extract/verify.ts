/**
 * Independent structural audit run AFTER parsing. A question can only stay
 * "verified" if it passes every check here; otherwise it is downgraded.
 */
import type { Question } from "../types";
import { normText } from "./rich";

export function auditQuestion(q: Question): string[] {
  const problems: string[] = [];
  if (q.text.trim().length < 8) problems.push("Question text is missing or too short.");
  if (q.options.length < 2) problems.push("Fewer than two options.");
  const norm = q.options.map((o) => normText(o.text));
  if (norm.some((n) => !n)) problems.push("An option is empty.");
  if (new Set(norm).size !== norm.length) problems.push("Duplicate option text.");
  const ids = new Set(q.options.map((o) => o.id));
  if (q.correctOptionIds.some((id) => !ids.has(id))) problems.push("Correct answer refers to a non-existent option.");
  if (q.verification.status === "verified") {
    if (q.correctOptionIds.length === 0) problems.push("Verified question has no correct answer.");
    if ((q.type === "single" || q.type === "true_false" || q.type === "fill_blank") && !q.acceptAny && q.correctOptionIds.length !== 1)
      problems.push("Single-answer question must have exactly one correct option.");
    if (q.type === "multi" && q.correctOptionIds.length < 2) problems.push("Multi-select question needs two or more correct options.");
    if (!q.source.file || q.source.page < 1) problems.push("Missing source reference.");
  }
  return problems;
}

export function auditQuestions(questions: Question[]): Question[] {
  return questions.map((q) => {
    const problems = auditQuestion(q);
    if (!problems.length) return q;
    const status = q.verification.status === "failed_extraction" ? "failed_extraction" : "needs_verification";
    return {
      ...q,
      correctOptionIds: status === "needs_verification" && q.correctOptionIds.length === 0 ? [] : q.correctOptionIds,
      verification: { ...q.verification, status, method: null, notes: [...q.verification.notes, ...problems.map((p) => `Audit: ${p}`)] },
    };
  });
}
