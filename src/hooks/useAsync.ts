import { useEffect, useRef, useState } from 'react';

export interface AsyncState<T> { data: T | undefined; error: Error | null; loading: boolean }

/** Runs `fn` when `deps` change; keeps the previous data while reloading (no skeleton flash). */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({ data: undefined, error: null, loading: true });
  const seq = useRef(0);
  useEffect(() => {
    const id = ++seq.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    fn().then(
      (data) => { if (id === seq.current) setState({ data, error: null, loading: false }); },
      (error: Error) => { if (id === seq.current) setState((s) => ({ data: s.data, error, loading: false })); },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}
