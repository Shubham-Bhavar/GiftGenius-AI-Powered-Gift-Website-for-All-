import { useCallback, useRef, useState } from 'react';
import { aiApi } from '../services/ai.js';

/**
 * The AI gift advisor flow, shared by the quiz page and the homepage Gift Finder: form → thinking → results.
 *
 * - The "thinking" beat lasts at least `minThinkingMs`, even when the server answers faster.
 * - An answer that arrives after cancel() or reset() is ignored (e.g. the modal was closed).
 * - submit() resolves to the error when the request fails (null otherwise), so a screen can toast it;
 *   `error` holds it too, for screens that show it inline.
 */
export function useGiftRecommendations({ minThinkingMs }) {
  const [phase, setPhase] = useState('form');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const run = useRef(0);

  const submit = useCallback(async (answers) => {
    const id = ++run.current;
    setPhase('thinking');
    setError(null);
    const started = Date.now();
    try {
      const res = await aiApi.recommend(answers);
      await new Promise((r) => setTimeout(r, Math.max(0, minThinkingMs - (Date.now() - started))));
      if (id !== run.current) return null;
      setResult(res);
      setPhase('results');
      return null;
    } catch (err) {
      if (id !== run.current) return null;
      setError(err);
      setPhase('form');
      return err;
    }
  }, [minThinkingMs]);

  /** Ignore the answer to a request still on its way. */
  const cancel = useCallback(() => {
    run.current += 1;
  }, []);
  /** Back to the questions, keeping the last result. */
  const showForm = useCallback(() => setPhase('form'), []);
  /** Start over: no result, no error. */
  const reset = useCallback(() => {
    run.current += 1;
    setResult(null);
    setError(null);
    setPhase('form');
  }, []);

  return { phase, result, error, submit, cancel, showForm, reset };
}
