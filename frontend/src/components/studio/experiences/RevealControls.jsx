import { STAGES } from './useGiftAnimation.js';

const STAGE_LABEL = { entrance: 'Arrival', rotation: 'Turn', ribbon: 'Ribbon', lid: 'Lid', reveal: 'Reveal' };

/**
 * Play or pause, replay, skip and reset, with the stage it has reached; and the 360° studio view: the turntable's motor
 * and a dial to any angle. Every control is an ordinary button or slider. The dial's value is written by the player as
 * the box turns, which is why it isn't a controlled input.
 */
export function RevealControls({ animation, spinning, canSpin, onToggleSpin, dialRef, readoutRef, onDial }) {
  const { status, stage, play, pause, replay, skip, reset } = animation;
  const playing = status === 'playing';
  const finished = status === 'finished';
  const primary = playing ? 'Pause' : status === 'paused' ? 'Resume' : 'Play';

  return (
    <div className="xp-controls">
      <div className="xp-controls-row">
        <ol className="xp-stages" aria-label="Reveal stages">
          {STAGES.map((name, i) => (
            <li key={name} className={stage !== null && i <= stage ? 'is-reached' : ''} aria-current={stage === i ? 'step' : undefined}>
              {STAGE_LABEL[name]}
            </li>
          ))}
        </ol>
        <div className="xp-buttons" role="group" aria-label="Reveal controls">
          {finished
            ? <button type="button" className="btn-primary" onClick={replay}>Replay</button>
            : <button type="button" className="btn-primary" onClick={playing ? pause : play}>{primary}</button>}
          {!finished && <button type="button" className="xp-button" disabled={status === 'idle'} onClick={replay}>Replay</button>}
          <button type="button" className="xp-button" disabled={finished} onClick={skip}>Skip reveal</button>
          <button type="button" className="xp-button" disabled={status === 'idle'} onClick={reset}>Reset</button>
        </div>
      </div>
      <div className="xp-controls-row xp-turn" role="group" aria-label="360° studio view">
        {canSpin && (
          <button type="button" className="xp-button xp-spin" aria-pressed={spinning} onClick={onToggleSpin}>
            {spinning ? 'Stop turntable' : '360° Studio View'}
          </button>
        )}
        <label className="xp-dial">
          <span>Turn the box</span>
          <input ref={dialRef} type="range" min={0} max={359} step={1} defaultValue={0} onInput={(e) => onDial(Number(e.currentTarget.value))} />
        </label>
        <output className="xp-readout" ref={readoutRef} aria-hidden="true">0°</output>
      </div>
    </div>
  );
}
