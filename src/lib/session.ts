import { isScorable } from "./scoring";
import { shuffle, type Rng } from "./random";
import type { Question } from "./types";

export const COUNT_PRESETS = [5, 10, 15, 20, 30] as const;
export type CountChoice = number | "all";

/** Only verified questions with an answer key are eligible for scored practice. */
export function eligibleQuestions(all: readonly Question[], weeks?: readonly number[]): Question[] {
  const set = weeks ? new Set(weeks) : null;
  return all.filter((q) => isScorable(q) && (!set || set.has(q.week)));
}

export interface ResolvedCount {
  count: number;
  requested: CountChoice;
  /** true when the request exceeded what is available and was reduced */
  clamped: boolean;
}

export function resolveCount(requested: CountChoice, available: number): ResolvedCount {
  if (requested === "all") return { count: available, requested, clamped: false };
  const wanted = Math.max(1, Math.floor(requested));
  return { count: Math.min(wanted, available), requested, clamped: wanted > available };
}

/**
 * Balanced shuffle: every round visits the selected weeks in a fresh random order and takes
 * one random unused question from each, so no week dominates while others still have
 * questions. The chosen set is then shuffled again so weeks are fully interleaved.
 * Never returns a question twice.
 */
export function selectBalanced(pool: readonly Question[], count: number, rng: Rng): Question[] {
  const byWeek = new Map<number, Question[]>();
  for (const q of shuffle(pool, rng)) {
    if (!byWeek.has(q.week)) byWeek.set(q.week, []);
    byWeek.get(q.week)!.push(q);
  }
  const picked: Question[] = [];
  const target = Math.min(count, pool.length);
  while (picked.length < target) {
    for (const w of shuffle([...byWeek.keys()], rng)) {
      const q = byWeek.get(w)!.pop();
      if (q) picked.push(q);
      if (picked.length >= target) break;
    }
  }
  return shuffle(picked, rng);
}

/** Display order of option ids. True/False keeps its natural order; ids never change. */
export function optionOrder(q: Question, rng: Rng): string[] {
  const ids = q.options.map((o) => o.id);
  return q.type === "true_false" ? ids : shuffle(ids, rng);
}

export interface BuiltSession {
  questionIds: string[];
  optionOrder: Record<string, string[]>;
  resolved: ResolvedCount;
}

export function buildSession(opts: {
  all: readonly Question[];
  weeks: readonly number[];
  count: CountChoice;
  rng: Rng;
}): BuiltSession {
  const pool = eligibleQuestions(opts.all, opts.weeks);
  const resolved = resolveCount(opts.count, pool.length);
  const picked = selectBalanced(pool, resolved.count, opts.rng);
  return {
    questionIds: picked.map((q) => q.id),
    optionOrder: Object.fromEntries(picked.map((q) => [q.id, optionOrder(q, opts.rng)])),
    resolved,
  };
}

/** A session over explicit question ids (retry incorrect / review) — still shuffled, still unique. */
export function buildSessionFromIds(all: readonly Question[], ids: readonly string[], rng: Rng): BuiltSession {
  const byId = new Map(all.map((q) => [q.id, q]));
  const picked = shuffle(
    [...new Set(ids)].map((id) => byId.get(id)).filter((q): q is Question => !!q && isScorable(q)),
    rng,
  );
  return {
    questionIds: picked.map((q) => q.id),
    optionOrder: Object.fromEntries(picked.map((q) => [q.id, optionOrder(q, rng)])),
    resolved: { count: picked.length, requested: picked.length, clamped: false },
  };
}
