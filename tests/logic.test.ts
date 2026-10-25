import { describe, expect, it } from "vitest";
import { mulberry32, shuffle } from "../src/lib/random";
import { checkAnswer, isScorable } from "../src/lib/scoring";
import {
  buildSession,
  buildSessionFromIds,
  eligibleQuestions,
  resolveCount,
  selectBalanced,
} from "../src/lib/session";
import {
  currentStreak,
  EMPTY_PROGRESS,
  incorrectQuestionIds,
  overallStats,
  weekStats,
  type Progress,
} from "../src/lib/progress";
import { finishSession, goTo, setSelection, startSessionState, submitAnswer } from "../src/lib/actions";
import { createStore, parseProgress, STORAGE_KEY } from "../src/lib/store";
import type { Question } from "../src/lib/types";

function mk(week: number, n: number, over: Partial<Question> = {}): Question {
  return {
    id: `w${week}-mcq-${n}`,
    week,
    section: "mcq",
    number: n,
    type: "single",
    text: `Question ${n} of week ${week} is here`,
    options: [
      { id: "A", text: `a${n}` },
      { id: "B", text: `b${n}` },
      { id: "C", text: `c${n}` },
      { id: "D", text: `d${n}` },
    ],
    correctOptionIds: ["B"],
    acceptAny: false,
    explanation: null,
    source: { file: `WEEK_${week}.pdf`, page: 1 },
    verification: { status: "verified", method: "highlight", notes: [] },
    context: "",
    ...over,
  };
}

const bank: Question[] = [];
for (let w = 1; w <= 12; w++) for (let n = 1; n <= 10; n++) bank.push(mk(w, n));

describe("weeks and eligibility", () => {
  it("represents all 12 weeks and can select any combination", () => {
    for (let w = 1; w <= 12; w++) expect(eligibleQuestions(bank, [w])).toHaveLength(10);
    expect(eligibleQuestions(bank, [1, 5, 12])).toHaveLength(30);
    expect(eligibleQuestions(bank)).toHaveLength(120);
  });

  it("loads questions only from the requested week", () => {
    expect(eligibleQuestions(bank, [4]).every((q) => q.week === 4)).toBe(true);
  });

  it("excludes unverified / failed questions and answer-less questions from scored practice", () => {
    const qs = [
      mk(1, 1),
      mk(1, 2, { verification: { status: "needs_verification", method: null, notes: [] }, correctOptionIds: [] }),
      mk(1, 3, { verification: { status: "failed_extraction", method: null, notes: [] } }),
      mk(1, 4, { correctOptionIds: [] }),
    ];
    expect(eligibleQuestions(qs, [1]).map((q) => q.id)).toEqual(["w1-mcq-1"]);
    expect(isScorable(qs[1])).toBe(false);
  });

  it("handles empty weeks gracefully", () => {
    const s = buildSession({ all: bank, weeks: [], count: 10, rng: mulberry32(1) });
    expect(s.questionIds).toEqual([]);
    const only = buildSession({ all: [], weeks: [3], count: "all", rng: mulberry32(1) });
    expect(only.questionIds).toEqual([]);
    expect(only.resolved.count).toBe(0);
  });
});

describe("session building and randomisation", () => {
  it("contains only questions from the selected weeks", () => {
    const s = buildSession({ all: bank, weeks: [2, 7], count: 15, rng: mulberry32(7) });
    expect(s.questionIds).toHaveLength(15);
    for (const id of s.questionIds) expect([2, 7]).toContain(Number(id.split("-")[0].slice(1)));
  });

  it("never repeats a question within a session", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const s = buildSession({ all: bank, weeks: [1, 2, 3], count: "all", rng: mulberry32(seed) });
      expect(new Set(s.questionIds).size).toBe(s.questionIds.length);
      expect(s.questionIds).toHaveLength(30);
    }
  });

  it("orders questions differently between sessions", () => {
    const a = buildSession({ all: bank, weeks: [1, 2, 3], count: 20, rng: mulberry32(11) }).questionIds;
    const b = buildSession({ all: bank, weeks: [1, 2, 3], count: 20, rng: mulberry32(12) }).questionIds;
    expect(a).not.toEqual(b);
  });

  it("mixes weeks instead of listing week 1 before week 2", () => {
    const ids = buildSession({ all: bank, weeks: [1, 2, 3, 4], count: "all", rng: mulberry32(5) }).questionIds;
    const weeks = ids.map((id) => Number(id.split("-")[0].slice(1)));
    const sorted = [...weeks].sort((x, y) => x - y);
    expect(weeks).not.toEqual(sorted);
  });

  it("is balanced: no selected week dominates when every week has enough questions", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const picked = selectBalanced(eligibleQuestions(bank, [1, 2, 3, 4]), 12, mulberry32(seed));
      const counts = [1, 2, 3, 4].map((w) => picked.filter((q) => q.week === w).length);
      expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
    }
  });

  it("explains and applies the question-count limit", () => {
    expect(resolveCount(30, 12)).toEqual({ count: 12, requested: 30, clamped: true });
    expect(resolveCount("all", 12)).toEqual({ count: 12, requested: "all", clamped: false });
    expect(resolveCount(5, 12).clamped).toBe(false);
    const s = buildSession({ all: bank, weeks: [1], count: 30, rng: mulberry32(2) });
    expect(s.questionIds).toHaveLength(10);
    expect(s.resolved.clamped).toBe(true);
  });

  it("shuffling options never changes the answer key (ids are stable)", () => {
    const s = buildSession({ all: bank, weeks: [1, 2], count: "all", rng: mulberry32(3) });
    let reordered = 0;
    for (const id of s.questionIds) {
      const q = bank.find((x) => x.id === id)!;
      const order = s.optionOrder[id];
      expect([...order].sort()).toEqual(q.options.map((o) => o.id).sort());
      if (order.join("") !== "ABCD") reordered++;
      // Click the option displayed in the position where the correct id landed.
      const displayedCorrect = order[order.indexOf(q.correctOptionIds[0])];
      expect(checkAnswer(q, [displayedCorrect]).correct).toBe(true);
    }
    expect(reordered).toBeGreaterThan(0);
  });

  it("keeps True/False in its natural order", () => {
    const tf = mk(1, 1, {
      type: "true_false",
      options: [
        { id: "A", text: "True" },
        { id: "B", text: "False" },
      ],
    });
    for (let seed = 1; seed < 10; seed++) {
      expect(buildSession({ all: [tf], weeks: [1], count: 1, rng: mulberry32(seed) }).optionOrder[tf.id]).toEqual(["A", "B"]);
    }
  });

  it("retry sessions use only the requested, scorable ids, once each", () => {
    const s = buildSessionFromIds(bank, ["w1-mcq-1", "w1-mcq-1", "w2-mcq-3", "nope"], mulberry32(9));
    expect([...s.questionIds].sort()).toEqual(["w1-mcq-1", "w2-mcq-3"]);
  });

  it("shuffle is a permutation", () => {
    const x = Array.from({ length: 50 }, (_, i) => i);
    expect(shuffle(x, mulberry32(4)).sort((a, b) => a - b)).toEqual(x);
  });
});

describe("scoring", () => {
  const single = mk(1, 1);
  const multi = mk(1, 2, { type: "multi", correctOptionIds: ["A", "C"] });
  const either = mk(1, 3, {
    options: [
      { id: "A", text: "epinephrine" },
      { id: "B", text: "adrenaline" },
    ],
    correctOptionIds: ["A", "B"],
    acceptAny: true,
  });

  it("scores single-choice correctly and never marks unanswered correct", () => {
    expect(checkAnswer(single, ["B"])).toEqual({ answered: true, correct: true });
    expect(checkAnswer(single, ["A"])).toEqual({ answered: true, correct: false });
    expect(checkAnswer(single, [])).toEqual({ answered: false, correct: false });
    expect(checkAnswer(single, ["ZZ"])).toEqual({ answered: false, correct: false });
    expect(checkAnswer(single, ["A", "B"]).correct).toBe(false);
  });

  it("requires an exact set for multi-select", () => {
    expect(checkAnswer(multi, ["A", "C"]).correct).toBe(true);
    expect(checkAnswer(multi, ["C", "A"]).correct).toBe(true);
    expect(checkAnswer(multi, ["A"]).correct).toBe(false);
    expect(checkAnswer(multi, ["A", "C", "D"]).correct).toBe(false);
    expect(checkAnswer(multi, ["A", "B"]).correct).toBe(false);
  });

  it("accepts either option when the source says both are correct", () => {
    expect(checkAnswer(either, ["A"]).correct).toBe(true);
    expect(checkAnswer(either, ["B"]).correct).toBe(true);
    expect(checkAnswer(either, ["A", "B"]).correct).toBe(false);
  });

  it("never marks an unverified question correct", () => {
    const u = mk(1, 9, { verification: { status: "needs_verification", method: null, notes: [] } });
    expect(checkAnswer(u, ["B"]).correct).toBe(false);
  });
});

describe("sessions, progress and stats", () => {
  const run = (answers: Record<string, string>, p0: Progress = EMPTY_PROGRESS, now = 1_000) => {
    const built = buildSession({ all: bank, weeks: [1], count: 4, rng: mulberry32(8) });
    let p = startSessionState(p0, built, { id: "s1", kind: "practice", weeks: [1], requested: 4, now });
    for (const [i, id] of built.questionIds.entries()) {
      const q = bank.find((x) => x.id === id)!;
      const pick = answers[String(i)];
      if (pick) {
        p = setSelection(p, id, [pick]);
        p = submitAnswer(p, q, now + i);
      }
    }
    return { p, built };
  };

  it("starts with zero progress", () => {
    expect(overallStats(bank, EMPTY_PROGRESS, [1, 2]).accuracy).toBeNull();
    expect(weekStats(1, bank, EMPTY_PROGRESS).status).toBe("not-started");
    expect(currentStreak(EMPTY_PROGRESS, Date.now())).toBe(0);
  });

  it("calculates session score and counts correctly", () => {
    const { p } = run({ "0": "B", "1": "A", "2": "B" }); // 3 answered (2 right, 1 wrong), 1 skipped
    const { record, progress } = finishSession(p, bank);
    expect(record).toMatchObject({ total: 4, correct: 2, incorrect: 1, unanswered: 1 });
    expect(progress.active).toBeNull();
    expect(progress.sessions).toHaveLength(1);
    expect(progress.attempts).toHaveLength(3);
  });

  it("does not record an attempt when nothing is selected", () => {
    const { p } = run({});
    expect(p.attempts).toHaveLength(0);
  });

  it("cannot re-submit or change a submitted answer", () => {
    const built = buildSession({ all: bank, weeks: [1], count: 2, rng: mulberry32(8) });
    let p = startSessionState(EMPTY_PROGRESS, built, { id: "s", kind: "practice", weeks: [1], requested: 2, now: 0 });
    const id = built.questionIds[0];
    const q = bank.find((x) => x.id === id)!;
    p = submitAnswer(setSelection(p, id, ["B"]), q, 1);
    p = submitAnswer(setSelection(p, id, ["A"]), q, 2);
    expect(p.attempts).toHaveLength(1);
    expect(p.active!.answers[id]).toMatchObject({ selected: ["B"], correct: true });
  });

  it("derives week status and accuracy from real attempts only", () => {
    const ids = eligibleQuestions(bank, [1]).map((q) => q.id);
    const attempts = ids.map((qid, i) => ({
      qid, week: 1, correct: i < 5, selected: ["B"], at: 1000 + i, mode: "practice" as const, sessionId: "s",
    }));
    let p: Progress = { ...EMPTY_PROGRESS, attempts: attempts.slice(0, 4) };
    expect(weekStats(1, bank, p)).toMatchObject({ attempted: 4, status: "in-progress", accuracy: 1 });
    p = { ...EMPTY_PROGRESS, attempts };
    expect(weekStats(1, bank, p)).toMatchObject({ attempted: 10, status: "practiced", accuracy: 0.5 });
    // A later correct re-attempt of every question completes the week.
    const retry = ids.map((qid, i) => ({ qid, week: 1, correct: true, selected: ["B"], at: 5000 + i, mode: "practice" as const, sessionId: "r" }));
    p = { ...EMPTY_PROGRESS, attempts: [...attempts, ...retry] };
    expect(weekStats(1, bank, p).status).toBe("completed");
    expect(incorrectQuestionIds(p, bank)).toEqual([]);
    expect(weekStats(2, bank, p).status).toBe("not-started");
  });

  it("lists questions whose latest answer was wrong", () => {
    const p: Progress = {
      ...EMPTY_PROGRESS,
      attempts: [
        { qid: "w1-mcq-1", week: 1, correct: false, selected: ["A"], at: 1, mode: "practice", sessionId: "s" },
        { qid: "w1-mcq-2", week: 1, correct: false, selected: ["A"], at: 1, mode: "practice", sessionId: "s" },
        { qid: "w1-mcq-2", week: 1, correct: true, selected: ["B"], at: 2, mode: "practice", sessionId: "s" },
      ],
    };
    expect(incorrectQuestionIds(p, bank)).toEqual(["w1-mcq-1"]);
  });

  it("streak counts consecutive study days and never invents one", () => {
    const DAY = 86400000;
    const noon = new Date(2026, 5, 10, 12).getTime();
    const mkAttempt = (at: number) => ({ qid: "x", week: 1, correct: true, selected: [], at, mode: "practice" as const, sessionId: "s" });
    const p: Progress = { ...EMPTY_PROGRESS, attempts: [mkAttempt(noon), mkAttempt(noon - DAY), mkAttempt(noon - 3 * DAY)] };
    expect(currentStreak(p, noon)).toBe(2);
    expect(currentStreak(p, noon + DAY)).toBe(2); // not studied yet today: yesterday's run stays
    expect(currentStreak(p, noon + 3 * DAY)).toBe(0);
  });

  it("navigation clamps within the session", () => {
    const { p } = run({});
    expect(goTo(p, 99).active!.index).toBe(3);
    expect(goTo(p, -4).active!.index).toBe(0);
  });
});

describe("persistence", () => {
  const fakeStorage = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
  };

  it("progress survives a 'page refresh' (a new store over the same storage)", () => {
    const storage = fakeStorage();
    const a = createStore(storage);
    a.update((p) => ({ ...p, bookmarks: ["w1-mcq-1"], attempts: [{ qid: "w1-mcq-1", week: 1, correct: true, selected: ["B"], at: 5, mode: "practice", sessionId: "s" }] }));
    const b = createStore(storage);
    expect(b.get().bookmarks).toEqual(["w1-mcq-1"]);
    expect(b.get().attempts).toHaveLength(1);
  });

  it("falls back to empty progress on corrupt or foreign data", () => {
    expect(parseProgress("{not json")).toEqual(EMPTY_PROGRESS);
    expect(parseProgress(JSON.stringify({ v: 9 }))).toEqual(EMPTY_PROGRESS);
    expect(parseProgress(null)).toEqual(EMPTY_PROGRESS);
  });

  it("keeps working when storage throws", () => {
    const s = createStore({ getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("full"); } });
    s.update((p) => ({ ...p, bookmarks: ["x"] }));
    expect(s.get().bookmarks).toEqual(["x"]);
    expect(STORAGE_KEY).toContain("bloom");
  });
});
