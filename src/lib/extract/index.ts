import type { Question, WeekMeta } from "../types";
import { readPdf } from "./pdf";
import { parseQuestions } from "./parse";
import { auditQuestions } from "./verify";

export interface ExtractOptions {
  week: number;
  /** Display filename (hash prefix removed). */
  file: string;
}

export interface ExtractResult {
  meta: WeekMeta;
  questions: Question[];
}

const ROMAN: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10, XI: 11, XII: 12 };

/** "WEEK_4_ASSIGNMENT_4.pdf" → 4. Returns null if no week marker exists. */
export function inferWeekFromFilename(name: string): number | null {
  const m = name.match(/week[\s_-]*(\d{1,2})/i);
  return m ? Number(m[1]) : null;
}

/** Looks for "Week 4" / "Assignment 4" / "ASSIGNMENT IV" inside the printed heading. */
export function inferWeekFromHeading(heading: string): number | null {
  const wk = heading.match(/week\s*(\d{1,2})/i);
  if (wk) return Number(wk[1]);
  const as = heading.match(/assignment\s*(\d{1,2}|[IVX]{1,4})\b/i);
  if (!as) return null;
  return /^\d+$/.test(as[1]) ? Number(as[1]) : ROMAN[as[1].toUpperCase()] ?? null;
}

/** Remove the "<hash>-" prefix the upload step adds, so source labels read naturally. */
export function displayFilename(name: string): string {
  return name.replace(/^[0-9a-f]{8}-/i, "");
}

export async function extractPdf(data: Uint8Array, opts: ExtractOptions): Promise<ExtractResult> {
  const issues: string[] = [];
  const pdf = await readPdf(data);
  const needsOcr = pdf.pageCount > 0 && pdf.pages.some((p) => p.charCount < 20);
  if (needsOcr) {
    issues.push(
      "One or more pages have almost no selectable text (likely scanned). OCR is not built into this importer; those pages produce no questions.",
    );
  }
  const parsed = parseQuestions(pdf, { week: opts.week, file: opts.file });
  issues.push(...parsed.issues);
  if (parsed.heading) {
    const printed = inferWeekFromHeading(parsed.heading);
    if (printed !== null && printed !== opts.week) {
      issues.push(`Printed heading says week ${printed} but the file was assigned to week ${opts.week}. Check the assignment.`);
    }
  }
  if (parsed.questions.length === 0) issues.push("No questions could be extracted from this PDF.");
  for (const p of pdf.pages) {
    if (p.otherFills > 0) issues.push(`Page ${p.page}: ${p.otherFills} non-yellow coloured fill(s) ignored.`);
  }
  const questions = auditQuestions(parsed.questions);
  return {
    meta: {
      week: opts.week,
      file: opts.file,
      heading: parsed.heading,
      pages: pdf.pageCount,
      textChars: pdf.textChars,
      needsOcr,
      issues,
    },
    questions,
  };
}
