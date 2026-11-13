import { useCallback, useEffect, useReducer, useRef } from 'react';
import { prefersReducedMotion } from '../../../animations/motion.js';

/** The stages every reveal experience moves through, in order. Each experience sets how long each one lasts. */
export const STAGES = ['entrance', 'rotation', 'ribbon', 'lid', 'reveal'];
const LAST = STAGES.length - 1;
/** With reduced motion, each stage appears at once and holds this long, so it can still be read in turn. */
const STILL_MS = 900;

const IDLE = { stage: null, status: 'idle', instant: false, run: 0 };

export function animationReducer(state, action) {
  switch (action.type) {
    case 'play':
      if (state.status === 'paused') return { ...state, status: 'playing' };
      if (state.status === 'playing') return state;
      return { stage: 0, status: 'playing', instant: false, run: state.run + 1 };
    case 'pause':
      return state.status === 'playing' ? { ...state, status: 'paused' } : state;
    case 'advance':
      if (state.status !== 'playing') return state;
      return state.stage < LAST ? { ...state, stage: state.stage + 1 } : { ...state, status: 'finished' };
    case 'skip':
      return { stage: LAST, status: 'finished', instant: true, run: state.run };
    case 'reset':
      return { ...IDLE, run: state.run + 1 };
    default:
      return state;
  }
}

/**
 * The reveal's state machine: idle, then the five stages, playing or paused, then finished. Pausing keeps what was
 * left of the current stage, so resuming doesn't restart it. The one timer is cleared on every change and on unmount.
 * `durations` holds each stage's length in ms; with `autoPlay` it starts playing as soon as it appears.
 */
export function useGiftAnimation(durations, { autoPlay = false } = {}) {
  const [state, dispatch] = useReducer(animationReducer, autoPlay ? { ...IDLE, stage: 0, status: 'playing' } : IDLE);
  const remaining = useRef(null);
  const startedAt = useRef(0);
  const { stage, status, run } = state;

  useEffect(() => {
    if (status !== 'playing') return undefined;
    const ms = remaining.current ?? (prefersReducedMotion() ? STILL_MS : durations[STAGES[stage]]);
    remaining.current = ms;
    startedAt.current = Date.now();
    const timer = setTimeout(() => {
      remaining.current = null;
      dispatch({ type: 'advance' });
    }, ms);
    return () => clearTimeout(timer);
  }, [stage, status, run, durations]);

  const play = useCallback(() => dispatch({ type: 'play' }), []);
  const pause = useCallback(() => {
    if (remaining.current !== null) remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt.current));
    dispatch({ type: 'pause' });
  }, []);
  const clear = useCallback(() => {
    remaining.current = null;
  }, []);
  const replay = useCallback(() => {
    clear();
    dispatch({ type: 'reset' });
    dispatch({ type: 'play' });
  }, [clear]);
  const skip = useCallback(() => {
    clear();
    dispatch({ type: 'skip' });
  }, [clear]);
  const reset = useCallback(() => {
    clear();
    dispatch({ type: 'reset' });
  }, [clear]);

  return { ...state, stageName: stage === null ? null : STAGES[stage], play, pause, replay, skip, reset };
}
