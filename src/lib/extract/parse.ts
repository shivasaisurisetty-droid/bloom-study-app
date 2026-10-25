/**
 * Turns the line/char stream of one solution PDF into structured questions.
 *
 * The parser NEVER fills gaps. An answer only becomes "verified" when the PDF itself
 * carries it (highlight, "Accepted Answers:", "Answer: (X)" + ✓, or a printed T/F)
 * and all available signals agree.
 */
import type { PdfData } from "./pdf";
import type { Question, QuestionOption, QuestionType, VerificationMethod } from "../types";
import { coverage, hasTick, join, normText, slice, str, tidy, toRich, type RText } from "./rich";

type Kind = "mcq" | "fib" | "tf";

/** An option counts as highlighted at/above this fraction of its characters. */
export const HIGHLIGHT_ON = 0.5;
/** Any non-selected option at/above this fraction makes the highlight ambiguous. */
export const HIGHLIGHT_STRAY = 0.15;

/** Page furniture; tested against the text with all spaces removed ("1 | P a g e" → "1|page"). */
const NOISE = [/^\d+\|page$/i, /assignment\/bm$/i, /^nptel,?july/i, /^\*+$/];
const UNNUMBERED_HEADER = /^(mcqs?|true\s*\/\s*false|fill in the blanks?)\s*:?\s*$/i;
const ROMAN_HEADER = /^(?:I{1,3}|IV|VI{0,3}|IX|X)\.(?:\s+\S.*)?$/;
const QUESTION_START = /^(\d{1,3})\s*[.)]\s*(.*)$/;

export function kindFromText(t: string): Kind | null {
  if (/true\s*\/\s*false|against\s+true|\(T\)/i.test(t)) return "tf";
  if (/fill in the blank/i.test(t)) return "fib";
  if (/multiple[\s-]*choice|\bMCQs?\b/i.test(t)) return "mcq";
  return null;
}

interface Block {
  kind: Kind;
  number: number;
  page: number;
  lines: RText[];
}

interface ParseContext {
  week: number;
  file: string;
}

interface Signal {
  name: string;
  ids: string[];
}

export interface ParseResult {
  questions: Question[];
  heading: string | null;
  issues: string[];
}

export function parseQuestions(pdf: PdfData, ctx: ParseContext): ParseResult {
  const issues: string[] = [];
  const blocks: Block[] = [];
  const headingLines: string[] = [];
  let kind: Kind | null = null;
  let inHeader = false;
  let current: Block | null = null;

  const flush = () => {
    if (current) blocks.push(current);
    current = null;
  };

  for (const page of pdf.pages) {
    for (const line of page.lines) {
      const rich = tidy(toRich(line));
      const text = str(rich);
      if (!text.trim() || NOISE.some((n) => n.test(text.replace(/\s+/g, "")))) continue;

      if (UNNUMBERED_HEADER.test(text.trim())) {
        flush();
        kind = kindFromText(text) ?? (/blank/i.test(text) ? "fib" : null);
        inHeader = false;
        continue;
      }
      if (ROMAN_HEADER.test(text.trim())) {
        flush();
        kind = kindFromText(text);
        inHeader = true;
        continue;
      }
      const qs = text.match(QUESTION_START);
      if (qs && kind) {
        flush();
        inHeader = false;
        const consumed = text.length - qs[2].length;
        current = { kind, number: Number(qs[1]), page: page.page, lines: [slice(rich, consumed)] };
        continue;
      }
      if (current) {
        (current as Block).lines.push(rich);
        continue;
      }
      // Prelude or header body.
      if (kind === null || inHeader) {
        const k = kindFromText(text);
        if (k) kind = k;
      }
      if (blocks.length === 0 && headingLines.length < 4 && !kindFromText(text) && !/^marks|^full marks/i.test(text.trim())) {
        headingLines.push(text.trim());
      }
    }
  }
  flush();

  const seenIds = new Set<string>();
  const questions: Question[] = [];
  for (const b of blocks) {
    const q = buildQuestion(b, ctx);
    let id = q.id;
    let n = 2;
    while (seenIds.has(id)) id = `${q.id}-dup${n++}`;
    if (id !== q.id) {
      q.id = id;
      q.verification.status = "needs_verification";
      q.verification.notes.push("Duplicate question number inside this week; check the source.");
    }
    seenIds.add(id);
    questions.push(q);
  }
  markDuplicates(questions);

  return { questions, heading: headingLines.length ? headingLines.join(" · ") : null, issues };
}

function markDuplicates(questions: Question[]) {
  const seen = new Map<string, string>();
  for (const q of questions) {
    const key = normText(q.text) + "|" + q.options.map((o) => normText(o.text)).join("|");
    const first = seen.get(key);
    if (first) {
      q.verification.status = "needs_verification";
      q.verification.notes.push(`Possible duplicate of ${first} (identical text and options).`);
    } else seen.set(key, q.id);
  }
}

const LETTER_OPT = /^\(?([A-Da-d])[.)]\s+(.*)$/;
const PAREN_OPT = /^\(([A-Da-d])\)\s+(.*)$/;
const BULLET_OPT = /^o\s+(.*)$/;

interface RawOption {
  label: string | null;
  text: RText;
}

/** Split a line that starts an option into one-or-more options (handles inline "a) .. b) .."). */
function splitInline(line: RText): RawOption[] | null {
  const s = str(line);
  const m = s.match(PAREN_OPT) ?? s.match(LETTER_OPT);
  if (!m) return null;
  const startLabel = m[1].toLowerCase();
  // Find sequential inline markers: first marker at 0, then next letters in order.
  const marks: { at: number; label: string; len: number }[] = [
    { at: 0, label: startLabel, len: s.length - m[2].length },
  ];
  let expected = String.fromCharCode(startLabel.charCodeAt(0) + 1);
  const re = /\s([A-Da-d])\)\s/g;
  let hit: RegExpExecArray | null;
  while ((hit = re.exec(s))) {
    if (hit[1].toLowerCase() === expected) {
      marks.push({ at: hit.index + 1, label: expected, len: hit[0].length - 1 });
      expected = String.fromCharCode(expected.charCodeAt(0) + 1);
      re.lastIndex = hit.index + hit[0].length - 1;
    }
  }
  return marks.map((mk, i) => {
    const end = i + 1 < marks.length ? marks[i + 1].at : s.length;
    return { label: mk.label.toUpperCase(), text: tidy(slice(line, mk.at + mk.len, end)) };
  });
}

function buildQuestion(b: Block, ctx: ParseContext): Question {
  const notes: string[] = [];
  const rawContext = b.lines.map((l) => str(l)).join("\n");
  const base = {
    week: ctx.week,
    section: b.kind === "mcq" ? "mcq" : b.kind === "fib" ? "fill-blank" : "true-false",
    number: b.number,
    explanation: null as string | null,
    source: { file: ctx.file, page: b.page },
    context: rawContext,
  };
  const id = `w${ctx.week}-${b.kind}-${b.number}`;
  const fail = (why: string): Question => ({
    ...base,
    id,
    type: "single",
    text: tidy(join(b.lines)).map((c) => c.ch).join(""),
    options: [],
    correctOptionIds: [],
    acceptAny: false,
    verification: { status: "failed_extraction", method: null, notes: [why] },
  });

  // --- answer lines printed by the source ------------------------------------------
  let body = b.lines;
  let acceptedText: string | null = null;
  let answerLine: { letter: string; text: string } | null = null;
  const acc = body.findIndex((l) => /^accepted answers?\s*:?\s*$/i.test(str(l).trim()));
  if (acc >= 0) {
    acceptedText = str(join(body.slice(acc + 1)));
    body = body.slice(0, acc);
  }
  const ans = body.findIndex((l) => /^answer\s*:\s*\(([A-Da-d])\)/i.test(str(l).trim()));
  if (ans >= 0) {
    const m = str(body[ans]).trim().match(/^answer\s*:\s*\(([A-Da-d])\)\s*(.*)$/i)!;
    answerLine = { letter: m[1].toUpperCase(), text: m[2] };
    if (ans + 1 < body.length) notes.push("Unexpected text after the Answer line; kept in context.");
    body = body.slice(0, ans);
  }
  if (acc >= 0 && !acceptedText) notes.push("'Accepted Answers' label present but no answer text follows.");

  const signals: Signal[] = [];
  let acceptAny = false;
  let type: QuestionType;
  let text: string;
  let options: QuestionOption[];
  let methodHint: VerificationMethod | null = null;

  if (b.kind === "tf") {
    const joined = join(body);
    const s = str(joined);
    const m = s.match(/^(.*\S)\s+(T|F|True|False)\s*$/s);
    text = m ? m[1].trim() : s;
    options = [
      { id: "A", text: "True" },
      { id: "B", text: "False" },
    ];
    type = "true_false";
    if (!m) {
      notes.push("No printed True/False answer after the statement.");
    } else {
      const tokenStart = joined.length - m[2].length;
      const token = m[2][0].toUpperCase() === "T" ? "A" : "B";
      signals.push({ name: "printed answer", ids: [token] });
      const tokenCov = coverage(slice(joined, tokenStart));
      if (tokenCov >= HIGHLIGHT_ON) {
        signals.push({ name: "highlight", ids: [token] });
        methodHint = "trailing-answer+highlight";
      } else methodHint = "trailing-answer";
    }
  } else if (b.kind === "fib") {
    let joined = join(body);
    let s = str(joined);
    const note = s.match(/\s*\[([^\]]*both[^\]]*correct[^\]]*)\]\s*$/i);
    if (note) {
      acceptAny = true;
      notes.push(`Source note: "[${note[1].trim()}]" — either option is accepted.`);
      joined = tidy(slice(joined, 0, s.length - note[0].length));
      s = str(joined);
    }
    const open = s.lastIndexOf("(");
    const inner = open >= 0 && s.trimEnd().endsWith(")") ? s.slice(open + 1, s.trimEnd().length - 1) : null;
    if (open < 0 || inner === null || !inner.includes("/")) {
      return fail("Could not find the bracketed option list '(a/b/c/d)' for this fill-in-the-blank.");
    }
    text = s.slice(0, open).trim();
    const optionTexts: RText[] = [];
    let start = open + 1;
    for (let i = open + 1; i <= open + 1 + inner.length; i++) {
      if (i === open + 1 + inner.length || s[i] === "/") {
        optionTexts.push(tidy(slice(joined, start, i)));
        start = i + 1;
      }
    }
    options = optionTexts.map((t, i) => ({ id: String.fromCharCode(65 + i), text: str(t) }));
    type = "fill_blank";
    const cov = optionTexts.map(coverage);
    pushHighlightSignal(signals, options, cov, notes);
  } else {
    // MCQ
    const stemLines: RText[] = [];
    const raw: RawOption[] = [];
    for (const line of body) {
      const s = str(line);
      const inline = splitInline(line);
      const bullet = s.match(BULLET_OPT);
      if (inline) raw.push(...inline);
      else if (bullet) raw.push({ label: null, text: tidy(slice(line, s.length - bullet[1].length)) });
      else if (raw.length) raw[raw.length - 1].text = join([raw[raw.length - 1].text, line]);
      else stemLines.push(line);
    }
    text = str(join(stemLines));
    if (raw.length < 2) return fail("Fewer than two answer options could be parsed.");
    options = raw.map((o, i) => ({ id: String.fromCharCode(65 + i), text: str(o.text).replace(/\s*✓$/, "").trim() }));
    for (const [i, o] of raw.entries()) {
      if (o.label && o.label !== options[i].id) notes.push(`Option label ${o.label} out of sequence (expected ${options[i].id}).`);
    }
    const norm = options.map((o) => normText(o.text));
    type = norm.length === 2 && norm.includes("true") && norm.includes("false") ? "true_false" : "single";

    if (acceptedText !== null) {
      const hits = options.filter((o) => normText(o.text) === normText(acceptedText!));
      if (hits.length === 1) {
        signals.push({ name: "Accepted Answers line", ids: [hits[0].id] });
        methodHint = "accepted-answer-line";
      } else notes.push(`Accepted answer "${acceptedText}" matched ${hits.length} options.`);
    }
    if (answerLine) {
      const opt = options.find((o) => o.id === answerLine!.letter);
      if (!opt) notes.push(`Answer line names option ${answerLine.letter}, which does not exist.`);
      else {
        if (answerLine.text && normText(answerLine.text) !== normText(opt.text)) {
          notes.push(`Answer line text "${answerLine.text}" differs from option ${opt.id} "${opt.text}".`);
          signals.push({ name: "Answer line (text mismatch)", ids: ["?"] });
        } else signals.push({ name: "Answer line", ids: [opt.id] });
        methodHint = "accepted-answer-line";
      }
    }
    const ticked = raw.map((o, i) => (hasTick(o.text) ? options[i].id : null)).filter(Boolean) as string[];
    if (ticked.length) {
      signals.push({ name: "✓ marker", ids: ticked });
      if (answerLine) methodHint = "answer-line+marker";
    }
    if (acceptedText === null && !answerLine) {
      pushHighlightSignal(signals, options, raw.map((o) => coverage(o.text)), notes);
    }
  }

  // --- combine signals ---------------------------------------------------------------
  const out: Question = {
    ...base,
    id,
    type,
    text,
    options,
    correctOptionIds: [],
    acceptAny,
    verification: { status: "needs_verification", method: null, notes },
  };

  const multiHint = /select all|choose all|more than one|all that apply|multiple correct/i.test(text);
  if (!signals.length) {
    notes.push("No answer marking found in the source PDF for this question; not guessed.");
    return out;
  }
  const key = (ids: string[]) => [...ids].sort().join(",");
  const keys = new Set(signals.map((s) => key(s.ids)));
  if (keys.size > 1 || signals.some((s) => s.ids.includes("?"))) {
    notes.push("Answer signals disagree: " + signals.map((s) => `${s.name}=${s.ids.join("+")}`).join("; "));
    return out;
  }
  const ids = signals[0].ids;
  if (ids.length > 1 && !acceptAny && !(type === "single" && multiHint)) {
    notes.push(`Multiple options (${ids.join(", ")}) are marked but the source does not say it is multi-select.`);
    return out;
  }
  if (ids.length > 1 && !acceptAny) out.type = "multi";
  out.correctOptionIds = ids;
  const method: VerificationMethod =
    signals.length > 1 && methodHint === "accepted-answer-line"
      ? "answer-line+marker"
      : methodHint ?? "highlight";
  out.verification = {
    status: "verified",
    method,
    notes: [...notes, `Answer from source (${signals.map((s) => s.name).join(" + ")}): ${ids.join(", ")}.`],
  };
  return out;
}

function pushHighlightSignal(signals: Signal[], options: QuestionOption[], cov: number[], notes: string[]) {
  const on = options.filter((_, i) => cov[i] >= HIGHLIGHT_ON).map((o) => o.id);
  const stray = options.filter((_, i) => cov[i] >= HIGHLIGHT_STRAY && cov[i] < HIGHLIGHT_ON).map((o) => o.id);
  if (on.length === 0) {
    if (stray.length) notes.push(`Only a partial highlight was found (options ${stray.join(", ")}).`);
    return;
  }
  if (stray.length) {
    notes.push(`Ambiguous highlight: partial overlap on option(s) ${stray.join(", ")}.`);
    signals.push({ name: "highlight (ambiguous)", ids: ["?"] });
    return;
  }
  signals.push({ name: "highlight", ids: on });
}
