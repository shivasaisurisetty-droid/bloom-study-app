/** Progress model + pure derivations. Everything shown to the student comes from real attempts. */
import type { Question } from "./types";
import { isScorable } from "./scoring";

export interface Attempt {
  qid: string;
  week: number;
  correct: boolean;
  selected: string[];
  at: number;
  mode: "practice";
  sessionId: string;
}

export interface SessionAnswer {
  selected: string[];
  submitted: boolean;
  correct: boolean;
}

export interface ActiveSession {
  id: string;
  kind: "practice" | "retry" | "review";
  weeks: number[];
  questionIds: string[];
  optionOrder: Record<string, string[]>;
  answers: Record<string, SessionAnswer>;
  index: number;
  startedAt: number;
  /** milliseconds already spent in earlier visits (the clock pauses while she is away) */
  elapsedMs: number;
  /** requested count, for "another session like this" */
  requested: number | "all";
}

export interface SessionResult {
  qid: string;
  week: number;
  selected: string[];
  answered: boolean;
  correct: boolean;
}

export interface SessionRecord {
  id: string;
  kind: ActiveSession["kind"];
  finishedAt: number;
  weeks: number[];
  requested: number | "all";
  total: number;
  correct: number;
  incorrect: number;
  unanswered: number;
  durationSec: number;
  results: SessionResult[];
  flagged: string[];
}

export interface Settings {
  motion: "system" | "off";
}

export interface Progress {
  v: 1;
  attempts: Attempt[];
  sessions: SessionRecord[];
  active: ActiveSession | null;
  bookmarks: string[];
  flagged: string[];
  /** question id → last time it was revealed in Study mode */
  studied: Record<string, number>;
  /** week → last study index, so she can pick up where she left off */
  studyPos: Record<number, number>;
  lastStudyWeek: number | null;
  settings: Settings;
}

export const EMPTY_PROGRESS: Progress = {
  v: 1,
  attempts: [],
  sessions: [],
  active: null,
  bookmarks: [],
  flagged: [],
  studied: {},
  studyPos: {},
  lastStudyWeek: null,
  settings: { motion: "system" },
};

export type WeekStatus = "not-started" | "in-progress" | "practiced" | "completed";

export const WEEK_STATUS_LABEL: Record<WeekStatus, string> = {
  "not-started": "Not started",
  "in-progress": "In progress",
  practiced: "Practiced",
  completed: "Completed",
};

/**
 * Completion rules (also shown on the Weeks page):
 *  - Not started: no practice answers yet for this week.
 *  - In progress: some, but not all, eligible questions answered at least once.
 *  - Practiced: every eligible question answered at least once, some still not right on the latest try.
 *  - Completed: every eligible question answered, and the latest answer to each one is correct.
 */
export interface WeekStats {
  week: number;
  eligible: number;
  unverified: number;
  attempted: number;
  attempts: number;
  correctAttempts: number;
  accuracy: number | null;
  status: WeekStatus;
}

export function latestAttempts(attempts: readonly Attempt[]): Map<string, Attempt> {
  const m = new Map<string, Attempt>();
  for (const a of attempts) {
    const prev = m.get(a.qid);
    if (!prev || a.at >= prev.at) m.set(a.qid, a);
  }
  return m;
}

export function weekStats(week: number, questions: readonly Question[], p: Progress): WeekStats {
  const inWeek = questions.filter((q) => q.week === week);
  const eligible = inWeek.filter(isScorable);
  const ids = new Set(eligible.map((q) => q.id));
  const attempts = p.attempts.filter((a) => ids.has(a.qid));
  const latest = latestAttempts(attempts);
  const attempted = latest.size;
  const correctAttempts = attempts.filter((a) => a.correct).length;
  let status: WeekStatus = "not-started";
  if (attempted > 0) status = "in-progress";
  if (eligible.length > 0 && attempted === eligible.length) {
    status = [...latest.values()].every((a) => a.correct) ? "completed" : "practiced";
  }
  return {
    week,
    eligible: eligible.length,
    unverified: inWeek.length - eligible.length,
    attempted,
    attempts: attempts.length,
    correctAttempts,
    accuracy: attempts.length ? correctAttempts / attempts.length : null,
    status,
  };
}

export interface OverallStats {
  attempts: number;
  correct: number;
  accuracy: number | null;
  weeksStarted: number;
  weeksCompleted: number;
  questionsAttempted: number;
  sessions: number;
}

export function overallStats(questions: readonly Question[], p: Progress, weeks: readonly number[]): OverallStats {
  const scorable = new Set(questions.filter(isScorable).map((q) => q.id));
  const attempts = p.attempts.filter((a) => scorable.has(a.qid));
  const correct = attempts.filter((a) => a.correct).length;
  const per = weeks.map((w) => weekStats(w, questions, p));
  return {
    attempts: attempts.length,
    correct,
    accuracy: attempts.length ? correct / attempts.length : null,
    weeksStarted: per.filter((s) => s.status !== "not-started").length,
    weeksCompleted: per.filter((s) => s.status === "completed").length,
    questionsAttempted: latestAttempts(attempts).size,
    sessions: p.sessions.length,
  };
}

/** Question ids whose most recent answer was wrong. */
export function incorrectQuestionIds(p: Progress, questions: readonly Question[]): string[] {
  const scorable = new Set(questions.filter(isScorable).map((q) => q.id));
  return [...latestAttempts(p.attempts).values()].filter((a) => !a.correct && scorable.has(a.qid)).map((a) => a.qid);
}

export function dayKey(ts: number): string {
  const d = new Date(ts);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export function studyDays(p: Progress): Set<string> {
  const days = new Set<string>();
  for (const a of p.attempts) days.add(dayKey(a.at));
  for (const t of Object.values(p.studied)) days.add(dayKey(t));
  return days;
}

/**
 * Current run of consecutive study days, counting back from today (or yesterday, so a day
 * that has not happened yet never "breaks" anything). Only ever shown as a gentle note.
 */
export function currentStreak(p: Progress, now: number): number {
  const days = studyDays(p);
  const DAY = 24 * 3600 * 1000;
  let cursor = now;
  if (!days.has(dayKey(cursor))) cursor -= DAY;
  let n = 0;
  while (days.has(dayKey(cursor))) {
    n++;
    cursor -= DAY;
  }
  return n;
}
