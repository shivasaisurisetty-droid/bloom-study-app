import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseQuestions } from "../src/lib/extract/parse";
import { auditQuestion } from "../src/lib/extract/verify";
import { displayFilename, extractPdf, inferWeekFromFilename, inferWeekFromHeading } from "../src/lib/extract";
import type { Line, PageData, PdfData } from "../src/lib/extract/pdf";
import type { Dataset } from "../src/lib/types";

/** Build a fake PDF from text lines; «…» marks characters that sit under a highlight. */
function fakePdf(pages: string[][]): PdfData {
  const out: PageData[] = pages.map((lines, pi) => ({
    page: pi + 1,
    highlights: [],
    otherFills: 0,
    charCount: 100,
    lines: lines.map((text, li): Line => {
      const chars = [];
      let hl = false;
      for (const ch of text) {
        if (ch === "«") hl = true;
        else if (ch === "»") hl = false;
        else chars.push({ ch, x0: 0, x1: 1, y0: 0, y1: 1, color: [0, 0, 0], font: "Times", hl });
      }
      return { page: pi + 1, chars, y: 70 + li * 20, x: 72 };
    }),
  }));
  return { pages: out, pageCount: out.length, textChars: 1000 };
}
const ctx = { week: 9, file: "WEEK_9.pdf" };

describe("parser never guesses", () => {
  it("marks a question with no answer marking as needs_verification", () => {
    const r = parseQuestions(fakePdf([["MCQs:", "1. Which one is the capital of France?", "a) Paris b) Rome c) Oslo d) Bern"]]), ctx);
    expect(r.questions).toHaveLength(1);
    expect(r.questions[0].verification.status).toBe("needs_verification");
    expect(r.questions[0].correctOptionIds).toEqual([]);
  });

  it("verifies a single highlighted option and keeps source page", () => {
    const r = parseQuestions(fakePdf([["MCQs:", "1. Which one is the capital of France?", "a) Rome «b) Paris» c) Oslo d) Bern"]]), ctx);
    const q = r.questions[0];
    expect(q.verification).toMatchObject({ status: "verified", method: "highlight" });
    expect(q.correctOptionIds).toEqual(["B"]);
    expect(q.options.map((o) => o.text)).toEqual(["Rome", "Paris", "Oslo", "Bern"]);
    expect(q.source).toEqual({ file: "WEEK_9.pdf", page: 1 });
  });

  it("flags two highlighted options as ambiguous instead of treating it as multi-select", () => {
    const r = parseQuestions(fakePdf([["MCQs:", "1. Which one is the capital of France?", "a) «Rome» «b) Paris» c) Oslo d) Bern"]]), ctx);
    expect(r.questions[0].verification.status).toBe("needs_verification");
    expect(r.questions[0].correctOptionIds).toEqual([]);
  });

  it("flags a partial highlight spilling onto a neighbouring option", () => {
    const r = parseQuestions(fakePdf([["MCQs:", "1. Which one is the capital of France?", "a) Ro«me b) Par»is c) Oslo d) Bern"]]), ctx);
    expect(r.questions[0].verification.status).toBe("needs_verification");
  });

  it("treats 'Both options are correct' as accept-either", () => {
    const r = parseQuestions(
      fakePdf([["I. Fill in the blanks:", "1) The hormone is ______ . («epinephrine/adrenaline») [Both options are correct]"]]),
      ctx,
    );
    const q = r.questions[0];
    expect(q.verification.status).toBe("verified");
    expect(q.acceptAny).toBe(true);
    expect(q.correctOptionIds).toEqual(["A", "B"]);
  });

  it("reads printed True/False answers and cross-checks the highlight", () => {
    const r = parseQuestions(fakePdf([["True/False", "1. The sky is green and made of cheese. «False»", "2. Water is wet in most contexts. True"]]), ctx);
    expect(r.questions[0]).toMatchObject({ type: "true_false", correctOptionIds: ["B"] });
    expect(r.questions[0].verification.method).toBe("trailing-answer+highlight");
    expect(r.questions[1]).toMatchObject({ correctOptionIds: ["A"] });
    expect(r.questions[1].verification.method).toBe("trailing-answer");
  });

  it("flags a True/False statement without a printed answer", () => {
    const r = parseQuestions(fakePdf([["True/False", "1. The sky is green and made of cheese."]]), ctx);
    expect(r.questions[0].verification.status).toBe("needs_verification");
  });

  it("uses an 'Accepted Answers' line and refuses a mismatch", () => {
    const pdf = (ans: string) =>
      fakePdf([["MCQs:", "1) Pick the right one please?", "o Alpha", "o Beta", "o Gamma", "Accepted Answers:", ans]]);
    expect(parseQuestions(pdf("Beta"), ctx).questions[0]).toMatchObject({ correctOptionIds: ["B"] });
    const bad = parseQuestions(pdf("Delta"), ctx).questions[0];
    expect(bad.verification.status).toBe("needs_verification");
    expect(bad.correctOptionIds).toEqual([]);
  });

  it("requires Answer line and ✓ to agree, and downgrades on conflict", () => {
    const base = (answer: string, tickOn: string) =>
      fakePdf([["MCQs", `1. Which one is right here?`, `(A) One${tickOn === "A" ? " ✓" : ""}`, `(B) Two${tickOn === "B" ? " ✓" : ""}`, `Answer: (${answer}) ${answer === "A" ? "One" : "Two"}`]]);
    expect(parseQuestions(base("A", "A"), ctx).questions[0].verification.status).toBe("verified");
    expect(parseQuestions(base("A", "B"), ctx).questions[0].verification.status).toBe("needs_verification");
  });

  it("detects duplicate questions within a week and ids stay unique", () => {
    const r = parseQuestions(
      fakePdf([["MCQs:", "1. Which one is the capital of France?", "a) Rome «b) Paris» c) Oslo d) Bern", "2. Which one is the capital of France?", "a) Rome «b) Paris» c) Oslo d) Bern"]]),
      ctx,
    );
    expect(r.questions[1].verification.status).toBe("needs_verification");
    expect(new Set(r.questions.map((q) => q.id)).size).toBe(2);
  });

  it("reports a block it cannot parse as failed_extraction", () => {
    const r = parseQuestions(fakePdf([["I. Fill in the blanks:", "1) This line has no bracketed options at all."]]), ctx);
    expect(r.questions[0].verification.status).toBe("failed_extraction");
  });

  it("audit downgrades a 'verified' question with an impossible answer", () => {
    const r = parseQuestions(fakePdf([["MCQs:", "1. Which one is the capital of France?", "a) Rome «b) Paris» c) Oslo d) Bern"]]), ctx);
    const q = { ...r.questions[0], correctOptionIds: ["Z"] };
    expect(auditQuestion(q).length).toBeGreaterThan(0);
  });

  it("handles inline options and hyphenated line wraps", () => {
    const r = parseQuestions(
      fakePdf([["MCQs:", "1. What does time-", "keeping regulate in the world?", "a) Rome b) Oslo «c) The clock» d) None"]]),
      ctx,
    );
    expect(r.questions[0].text).toBe("What does time-keeping regulate in the world?");
    expect(r.questions[0].correctOptionIds).toEqual(["C"]);
  });
});

describe("week detection", () => {
  it("reads weeks from filenames and printed headings", () => {
    expect(inferWeekFromFilename("b705349f-WEEK_10_ASSIGNMENT_10.pdf")).toBe(10);
    expect(inferWeekFromFilename("notes.pdf")).toBeNull();
    expect(inferWeekFromHeading("Assignment 4 Week 4")).toBe(4);
    expect(inferWeekFromHeading("ASSIGNMENT IX, JULY-OCTOBER 2026")).toBe(9);
    expect(displayFilename("b705349f-WEEK_10_ASSIGNMENT_10.pdf")).toBe("WEEK_10_ASSIGNMENT_10.pdf");
  });
});

const root = path.resolve(__dirname, "..");
const dataset = JSON.parse(fs.readFileSync(path.join(root, "data", "questions.json"), "utf8")) as Dataset;

describe("bundled dataset", () => {
  it("covers all 12 weeks with source references on every question", () => {
    expect(dataset.weeks.map((w) => w.week)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    for (const q of dataset.questions) {
      expect(q.source.file).toMatch(/^WEEK_\d+_ASSIGNMENT_\d+\.pdf$/);
      expect(q.source.page).toBeGreaterThanOrEqual(1);
      expect(q.id.startsWith(`w${q.week}-`)).toBe(true);
      expect(fs.existsSync(path.join(root, "public", "sources", q.source.file))).toBe(true);
    }
    expect(new Set(dataset.questions.map((q) => q.id)).size).toBe(dataset.questions.length);
  });

  it("every verified question has a consistent answer key and no invented explanation", () => {
    for (const q of dataset.questions) {
      expect(auditQuestion(q)).toEqual([]);
      if (q.verification.status === "verified") {
        expect(q.correctOptionIds.length).toBeGreaterThan(0);
        expect(q.verification.method).not.toBeNull();
      } else {
        expect(q.correctOptionIds).toEqual([]);
      }
      expect(q.explanation).toBeNull(); // none of the source PDFs contain explanations
    }
  });

  it("spot-checks known answers read from the PDFs", () => {
    const text = (id: string) => {
      const q = dataset.questions.find((x) => x.id === id)!;
      return q.options.filter((o) => q.correctOptionIds.includes(o.id)).map((o) => o.text);
    };
    expect(text("w1-mcq-1")).toEqual(["Ralph Waldo Emerson"]);
    expect(text("w2-mcq-4")).toEqual(["Grab the attention"]);
    expect(text("w3-fib-5")).toEqual(["epinephrine", "adrenaline"]);
    expect(text("w5-fib-2")).toEqual(["1952"]);
    expect(text("w6-tf-5")).toEqual(["False"]);
    expect(text("w8-mcq-2")).toEqual(["Situation, Task, Action, Result"]);
    expect(text("w11-mcq-9")).toEqual(["Sapir and Benjamin Lee Whorf"]);
    expect(text("w12-mcq-5")).toEqual(["The Chicago Address"]);
  });

  it("re-extracting the real PDFs reproduces the committed dataset exactly", async () => {
    for (const w of dataset.weeks) {
      if (!w.file) continue;
      const buf = fs.readFileSync(path.join(root, "public", "sources", w.file));
      const res = await extractPdf(new Uint8Array(buf), { week: w.week, file: w.file });
      const committed = dataset.questions.filter((q) => q.week === w.week);
      expect(res.questions).toEqual(committed);
      expect(res.meta.needsOcr).toBe(false);
    }
  });
});
