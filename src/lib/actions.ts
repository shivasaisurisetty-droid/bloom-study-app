/** Pure state transitions for sessions, bookmarks and study. The store applies them. */
import { checkAnswer } from "./scoring";
import type { ActiveSession, Progress, SessionRecord } from "./progress";
import type { BuiltSession } from "./session";
import type { Question } from "./types";

export function toggleId(list: readonly string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

export function startSessionState(
  p: Progress,
  built: BuiltSession,
  meta: { id: string; kind: ActiveSession["kind"]; weeks: number[]; requested: number | "all"; now: number },
): Progress {
  if (built.questionIds.length === 0) return p;
  const active: ActiveSession = {
    id: meta.id,
    kind: meta.kind,
    weeks: meta.weeks,
    questionIds: built.questionIds,
    optionOrder: built.optionOrder,
    answers: {},
    index: 0,
    startedAt: meta.now,
    elapsedMs: 0,
    requested: meta.requested,
  };
  return { ...p, active };
}

export function setSelection(p: Progress, qid: string, selected: string[]): Progress {
  const s = p.active;
  if (!s || s.answers[qid]?.submitted) return p;
  return {
    ...p,
    active: { ...s, answers: { ...s.answers, [qid]: { selected, submitted: false, correct: false } } },
  };
}

export function submitAnswer(p: Progress, q: Question, now: number): Progress {
  const s = p.active;
  if (!s || s.answers[q.id]?.submitted) return p;
  const selected = s.answers[q.id]?.selected ?? [];
  const { answered, correct } = checkAnswer(q, selected);
  if (!answered) return p; // nothing chosen → nothing submitted, nothing scored
  return {
    ...p,
    attempts: [...p.attempts, { qid: q.id, week: q.week, correct, selected, at: now, mode: "practice", sessionId: s.id }],
    active: { ...s, answers: { ...s.answers, [q.id]: { selected, submitted: true, correct } } },
  };
}

export function goTo(p: Progress, index: number): Progress {
  const s = p.active;
  if (!s) return p;
  const i = Math.min(Math.max(0, index), s.questionIds.length - 1);
  return { ...p, active: { ...s, index: i } };
}

export function addElapsed(p: Progress, ms: number): Progress {
  const s = p.active;
  if (!s || ms <= 0) return p;
  return { ...p, active: { ...s, elapsedMs: s.elapsedMs + ms } };
}

export function finishSession(p: Progress, questions: readonly Question[]): { progress: Progress; record: SessionRecord | null } {
  const s = p.active;
  if (!s) return { progress: p, record: null };
  const byId = new Map(questions.map((q) => [q.id, q]));
  const results = s.questionIds.map((qid) => {
    const a = s.answers[qid];
    const q = byId.get(qid);
    return {
      qid,
      week: q?.week ?? 0,
      selected: a?.selected ?? [],
      answered: !!a?.submitted,
      correct: !!a?.submitted && a.correct,
    };
  });
  const correct = results.filter((r) => r.correct).length;
  const answered = results.filter((r) => r.answered).length;
  const record: SessionRecord = {
    id: s.id,
    kind: s.kind,
    finishedAt: Date.now(),
    weeks: s.weeks,
    requested: s.requested,
    total: results.length,
    correct,
    incorrect: answered - correct,
    unanswered: results.length - answered,
    durationSec: Math.round(s.elapsedMs / 1000),
    results,
    flagged: s.questionIds.filter((id) => p.flagged.includes(id)),
  };
  return { progress: { ...p, active: null, sessions: [...p.sessions, record] }, record };
}

export function markStudied(p: Progress, qid: string, now: number): Progress {
  return { ...p, studied: { ...p.studied, [qid]: now } };
}

export function setStudyPos(p: Progress, week: number, index: number): Progress {
  return { ...p, studyPos: { ...p.studyPos, [week]: index }, lastStudyWeek: week };
}
