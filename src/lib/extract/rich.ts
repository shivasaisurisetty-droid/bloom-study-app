import type { Line } from "./pdf";

/** A character that remembers whether it sat under a highlight / carried a tick glyph. */
export interface RChar {
  ch: string;
  hl: boolean;
  tick: boolean;
}
export type RText = RChar[];

/** Convert a mupdf line to rich text, expanding ligatures so indices stay 1:1 with chars. */
export function toRich(line: Line): RText {
  const out: RText = [];
  for (const c of line.chars) {
    if (c.font.includes("Zapf") || c.ch === "✓" || c.ch === "✔") {
      out.push({ ch: "✓", hl: c.hl, tick: true });
      continue;
    }
    const norm = c.ch.replace(/ /g, " ").normalize("NFKC");
    for (const piece of norm) out.push({ ch: piece, hl: c.hl, tick: false });
  }
  return out;
}

export const str = (r: RText): string => r.map((c) => c.ch).join("");

/** Collapse whitespace runs and trim, keeping per-char flags. */
export function tidy(r: RText): RText {
  const out: RText = [];
  for (const c of r) {
    const isSpace = /\s/.test(c.ch);
    const prev = out[out.length - 1];
    if (isSpace) {
      if (!prev || prev.ch === " ") continue;
      out.push({ ...c, ch: " " });
    } else out.push(c);
  }
  while (out.length && out[out.length - 1].ch === " ") out.pop();
  return out;
}

export function join(lines: RText[]): RText {
  const out: RText = [];
  lines.forEach((l, i) => {
    if (i > 0) {
      // A line that wrapped right after a hyphen ("time-" / "keeping") is one word.
      const prev = out[out.length - 1];
      const before = out[out.length - 2];
      const glue = prev?.ch === "-" && before && /[A-Za-z]/.test(before.ch) && l[0] && /[a-z]/.test(l[0].ch);
      if (!glue) out.push({ ch: " ", hl: false, tick: false });
    }
    out.push(...l);
  });
  return tidy(out);
}

export const slice = (r: RText, a: number, b?: number): RText => r.slice(a, b);

/** Fraction of non-space characters that are highlighted. */
export function coverage(r: RText): number {
  const real = r.filter((c) => c.ch.trim() && c.ch !== "✓");
  if (!real.length) return 0;
  return real.filter((c) => c.hl).length / real.length;
}

export const hasTick = (r: RText): boolean => r.some((c) => c.tick);

/** Lower-case, strip surrounding punctuation, collapse spaces — for answer-text matching only. */
export function normText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .replace(/^[\s.,;:!?"'()[\]]+|[\s.,;:!?"'()[\]]+$/g, "")
    .trim();
}
