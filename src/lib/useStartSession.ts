"use client";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { startSessionState } from "./actions";
import { newSeed, mulberry32 } from "./random";
import { buildSession, buildSessionFromIds, type CountChoice } from "./session";
import { store } from "./store";
import type { ActiveSession } from "./progress";
import type { Question } from "./types";

export function useStartSession(questions: readonly Question[]) {
  const router = useRouter();

  const startWeeks = useCallback(
    (weeks: number[], count: CountChoice) => {
      const rng = mulberry32(newSeed());
      const built = buildSession({ all: questions, weeks, count, rng });
      if (!built.questionIds.length) return false;
      store.update((p) =>
        startSessionState(p, built, { id: `s-${Date.now().toString(36)}`, kind: "practice", weeks, requested: count, now: Date.now() }),
      );
      router.push("/practice/session");
      return true;
    },
    [questions, router],
  );

  const startIds = useCallback(
    (ids: string[], kind: ActiveSession["kind"]) => {
      const rng = mulberry32(newSeed());
      const built = buildSessionFromIds(questions, ids, rng);
      if (!built.questionIds.length) return false;
      const byId = new Map(questions.map((q) => [q.id, q]));
      const weeks = [...new Set(built.questionIds.map((id) => byId.get(id)?.week ?? 0))].sort((a, b) => a - b);
      store.update((p) =>
        startSessionState(p, built, { id: `s-${Date.now().toString(36)}`, kind, weeks, requested: built.questionIds.length, now: Date.now() }),
      );
      router.push("/practice/session");
      return true;
    },
    [questions, router],
  );

  return { startWeeks, startIds };
}
