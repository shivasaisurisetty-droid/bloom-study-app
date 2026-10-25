"use client";
import { useMemo, useSyncExternalStore } from "react";
import raw from "../../data/questions.json";
import type { Dataset, Question } from "./types";

/** The dataset shipped with the app (generated from the solution PDFs by `npm run import:pdfs`). */
export const dataset = raw as unknown as Dataset;
export const WEEKS = Array.from({ length: 12 }, (_, i) => i + 1);

/** Admin corrections made in the review dashboard live in this browser only until exported. */
export const OVERRIDES_KEY = "bloom:admin-overrides:v1";
export type Overrides = Record<string, Partial<Question>>;

const listeners = new Set<() => void>();
let cache: { raw: string | null; value: Overrides } | null = null;

function readOverrides(): Overrides {
  let rawStr: string | null = null;
  try {
    rawStr = window.localStorage.getItem(OVERRIDES_KEY);
  } catch {
    rawStr = null;
  }
  if (cache && cache.raw === rawStr) return cache.value;
  let value: Overrides = {};
  try {
    value = rawStr ? (JSON.parse(rawStr) as Overrides) : {};
  } catch {
    value = {};
  }
  cache = { raw: rawStr, value };
  return value;
}

export function saveOverrides(next: Overrides) {
  try {
    window.localStorage.setItem(OVERRIDES_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

export function getOverrides(): Overrides {
  return typeof window === "undefined" ? {} : readOverrides();
}

const EMPTY: Overrides = {};

function useOverrides(): Overrides {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    readOverrides,
    () => EMPTY,
  );
}

export function applyOverrides(questions: readonly Question[], ov: Overrides): Question[] {
  return questions.map((q) => (ov[q.id] ? ({ ...q, ...ov[q.id] } as Question) : q));
}

/** All questions with any local admin corrections applied. */
export function useQuestions(): Question[] {
  const ov = useOverrides();
  return useMemo(() => applyOverrides(dataset.questions, ov), [ov]);
}

export function questionById(questions: readonly Question[]): Map<string, Question> {
  return new Map(questions.map((q) => [q.id, q]));
}
