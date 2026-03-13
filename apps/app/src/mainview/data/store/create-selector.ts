import { shallow } from 'zustand/shallow';

/**
 * Creates a memoized selector with encapsulated state.
 * Each selector instance maintains its own prev-cache — no module-level leakage.
 *
 * - `deps`: extracts comparable inputs from state (returns a tuple)
 * - `compute`: transforms those deps + full state into the final value
 * - `resultEqual` (optional): custom equality check on the computed result.
 *   When deps change but the result is equal to the previous, the old reference
 *   is returned — preventing unnecessary re-renders and useEffect fires.
 *
 * Returns the same reference when deps haven't changed (shallow compare).
 */
export function createSelector<S, Deps extends readonly unknown[], R>(
  deps: (state: S) => Deps,
  compute: (deps: Deps, state: S) => R,
  resultEqual?: (prev: R, next: R) => boolean,
): { (state: S): R; reset(): void } {
  let prevDeps: Deps | undefined;
  let prevResult: R | undefined;

  const selector = (state: S): R => {
    const nextDeps = deps(state);
    if (prevDeps && shallow(prevDeps, nextDeps)) return prevResult as R;
    prevDeps = nextDeps;
    const nextResult = compute(nextDeps, state);
    if (prevResult !== undefined && resultEqual?.(prevResult, nextResult)) {
      return prevResult;
    }
    prevResult = nextResult;
    return prevResult;
  };

  selector.reset = () => {
    prevDeps = undefined;
    prevResult = undefined;
  };

  return selector;
}
