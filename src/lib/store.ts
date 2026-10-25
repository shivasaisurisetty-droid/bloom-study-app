"use client";
/**
 * Tiny external store backed by localStorage. Progress survives refreshes on this device
 * and browser only — there is no account and no cross-device sync.
 */
import { useSyncExternalStore } from "react";
import { EMPTY_PROGRESS, type Progress } from "./progress";

export const STORAGE_KEY = "bloom:progress:v1";

type Listener = () => void;

export function parseProgress(raw: string | null): Progress {
  if (!raw) return EMPTY_PROGRESS;
  try {
    const p = JSON.parse(raw) as Partial<Progress>;
    if (!p || p.v !== 1 || !Array.isArray(p.attempts)) return EMPTY_PROGRESS;
    return {
      ...EMPTY_PROGRESS,
      ...p,
      settings: { ...EMPTY_PROGRESS.settings, ...(p.settings ?? {}) },
    } as Progress;
  } catch {
    return EMPTY_PROGRESS;
  }
}

export function createStore(storage: Pick<Storage, "getItem" | "setItem"> | null) {
  let state: Progress | null = null;
  const listeners = new Set<Listener>();

  const read = (): Progress => {
    if (state) return state;
    let raw: string | null = null;
    try {
      raw = storage?.getItem(STORAGE_KEY) ?? null;
    } catch {
      raw = null;
    }
    state = parseProgress(raw);
    return state;
  };

  const emit = () => listeners.forEach((l) => l());

  return {
    get: read,
    set(next: Progress) {
      state = next;
      try {
        storage?.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* storage full or blocked: keep working in memory */
      }
      emit();
    },
    update(fn: (p: Progress) => Progress) {
      this.set(fn(read()));
    },
    /** Re-read from storage (another tab changed it). */
    reload() {
      state = null;
      emit();
    },
    subscribe(l: Listener) {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
  };
}

function browserStorage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export const store = createStore(browserStorage());

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_KEY) store.reload();
  });
}

const noop = () => () => {};

export function useProgress(): Progress {
  return useSyncExternalStore(store.subscribe, store.get, () => EMPTY_PROGRESS);
}

/** false during SSR/hydration, true once localStorage has been read on the client. */
export function useHydrated(): boolean {
  return useSyncExternalStore(noop, () => true, () => false);
}
