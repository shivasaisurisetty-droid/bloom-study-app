/** Shared domain types for Bloom. */

export type QuestionType = "single" | "multi" | "true_false" | "fill_blank";

/**
 * - verified: the answer key is explicitly supported by the source PDF and every
 *   automated check agreed. Only these appear in scored practice.
 * - needs_verification: extracted, but the answer is missing / ambiguous / contradictory.
 * - failed_extraction: the question could not be parsed with confidence.
 */
export type VerificationStatus = "verified" | "needs_verification" | "failed_extraction";

export type VerificationMethod =
  | "highlight" // exactly one option sits under the PDF's yellow highlight
  | "accepted-answer-line" // the PDF prints "Accepted Answers:" under the question
  | "answer-line+marker" // the PDF prints "Answer: (X)" and marks the option with a ✓
  | "trailing-answer" // the PDF prints T/F (or True/False) after the statement
  | "trailing-answer+highlight" // …and the same letter/word is also highlighted
  | "manual"; // a human confirmed it in the review dashboard

export interface QuestionOption {
  /** Stable id within the question: "A", "B", … (display order of the source). */
  id: string;
  text: string;
}

export interface SourceRef {
  /** Original PDF filename (upload hash prefix removed). */
  file: string;
  /** 1-based PDF page number on which the question starts. */
  page: number;
}

export interface Verification {
  status: VerificationStatus;
  method: VerificationMethod | null;
  /** Human-readable audit trail: what was checked, what was found. */
  notes: string[];
}

export interface Question {
  id: string;
  week: number;
  /** Section label inside the PDF, e.g. "mcq", "fill-blank", "true-false", "I". */
  section: string;
  /** Question number as printed in the source (restarts per section in some PDFs). */
  number: number;
  type: QuestionType;
  text: string;
  options: QuestionOption[];
  /** Correct option ids as given by the source. Empty when not verified. */
  correctOptionIds: string[];
  /**
   * When true, ANY single listed correct option is accepted (the source says
   * "Both options are correct"). When false, the answer set must match exactly.
   */
  acceptAny: boolean;
  /** Explanation text from the source PDF, or null if the PDF gives none. */
  explanation: string | null;
  source: SourceRef;
  verification: Verification;
  /** Raw extracted text of the question block, for inspection / manual review. */
  context: string;
}

export interface WeekMeta {
  week: number;
  file: string | null;
  /** Heading lines printed at the top of the PDF (not invented). */
  heading: string | null;
  pages: number;
  textChars: number;
  needsOcr: boolean;
  issues: string[];
}

export interface Dataset {
  generatedAt: string;
  weeks: WeekMeta[];
  questions: Question[];
}
