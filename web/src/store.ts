import { useSyncExternalStore } from 'react';
import type { Verdict } from './three/verdicts';

// Plain external stores: React context does not cross the R3F <Canvas> boundary,
// and the scene reads them per frame without re-rendering.
export function createStore<T extends object>(initial: T) {
  let state = initial;
  const subs = new Set<() => void>();
  return {
    get: () => state,
    set(patch: Partial<T>) {
      state = { ...state, ...patch };
      subs.forEach((f) => f());
    },
    subscribe(f: () => void) {
      subs.add(f);
      return () => { subs.delete(f); };
    },
  };
}
export type Store<T extends object> = ReturnType<typeof createStore<T>>;

export function useStore<T extends object, U>(store: Store<T>, pick: (s: T) => U): U {
  return useSyncExternalStore(store.subscribe, () => pick(store.get()));
}

export type ThreadSpec = {
  id: string;
  verdict: Verdict | 'witness';
  from: number;
  to: number;
  lane: number;
  label?: string;
  draw?: () => number;
  fromRelease?: boolean;
};

// What the 3D Witness Bridge shows.
export const scene = createStore({
  threads: [] as ThreadSpec[],
  wm: 40,
  holds: [] as number[],
  verifierHold: false,
  gates: false,
  labels: false,
  violationAt: -1e9,
});

export const useScene = () => useSyncExternalStore(scene.subscribe, scene.get);
