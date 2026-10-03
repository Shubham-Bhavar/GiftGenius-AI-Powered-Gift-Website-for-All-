import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api.js';

// Pieces the Seller Center screens share: the store query, its edit rule, and loading/error/KPI blocks.

export const useStore = () => useQuery({ queryKey: ['seller', 'me'], queryFn: api.seller.me });
/** A store waiting for review or approved can add and change products (the API enforces the same rule). */
export const canEditProducts = (status) => status === 'APPROVED' || status === 'PENDING';

/** Loading placeholder shaped like the content, announced once to screen readers. */
export function Skeleton({ kpis = 0, lines = 4, label = 'Loading…' }) {
  return (
    <div className="sel-skel" role="status">
      <span className="sr-only">{label}</span>
      {kpis > 0 && <div className="adm-kpis" aria-hidden="true">{Array.from({ length: kpis }, (_, i) => <div key={i} className="sel-skel-kpi" />)}</div>}
      <div className="od-card" aria-hidden="true">
        {Array.from({ length: lines }, (_, i) => <div key={i} className="sel-skel-line" style={{ width: `${90 - i * 12}%` }} />)}
      </div>
    </div>
  );
}

/** "Unable to load …" with a retry, never the raw error. */
export function LoadError({ what, error, onRetry }) {
  const offline = error?.status === 0;
  return (
    <div className="gg-alert gg-alert--error" role="alert">
      <span>Unable to load {what}.{offline ? ' Check your connection and try again.' : ''}</span>
      <button type="button" className="btn-outline btn-sm" onClick={onRetry}>↻ Retry</button>
    </div>
  );
}

export function Kpi({ label, value, to, note }) {
  const body = <><span>{label}</span><strong>{value}</strong>{note && <small>{note}</small>}</>;
  return to ? <Link to={to} className="adm-kpi adm-kpi--link">{body}</Link> : <div className="adm-kpi">{body}</div>;
}
