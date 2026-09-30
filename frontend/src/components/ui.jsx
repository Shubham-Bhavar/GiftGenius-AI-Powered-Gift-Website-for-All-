import { useId, useState } from 'react';
import { Link } from 'react-router';
import { ORDER_STATUS, PAYMENT_STATUS } from '../lib/format.js';

/** Dark hero band used by every inner page (the quiz page's hero from the original design). */
export function PageHero({ eyebrow, title, em, after, children }) {
  return (
    <section className="page-hero">
      {eyebrow && (
        <div className="page-eyebrow"><span className="eyebrow-line" />{eyebrow}<span className="eyebrow-line" /></div>
      )}
      <h1>{title}{em && <> <em>{em}</em></>}{after}</h1>
      {children && <p>{children}</p>}
    </section>
  );
}

/** Homepage section header: mono eyebrow with gold lines + serif heading. */
export function SecHeader({ eyebrow, title, sub, center = true, id }) {
  return (
    <header className={`sec-header ${center ? 'sec-header--center' : ''}`}>
      {eyebrow && (
        <p className={`sec-eyebrow ${center ? 'sec-eyebrow--center' : ''}`}>
          <span className="sec-line" aria-hidden="true" /> {eyebrow} {center && <span className="sec-line" aria-hidden="true" />}
        </p>
      )}
      <h2 id={id}>{title}</h2>
      {sub && <p>{sub}</p>}
    </header>
  );
}

export function Spinner({ label = 'Loading…', inline = false }) {
  return (
    <span className={inline ? 'gg-spinner-inline' : 'gg-spinner-block'} role="status">
      <span className="gg-spinner" aria-hidden="true" />
      <span className={inline ? 'sr-only' : 'gg-spinner-label'}>{label}</span>
    </span>
  );
}

/** Friendly empty/not-found block. Use level={1} when it is the whole page (404s), so the page still has an h1. */
export function EmptyState({ icon = '🎁', title, children, action, level = 2 }) {
  const Heading = level === 1 ? 'h1' : 'h2';
  return (
    <div className="gg-empty">
      <div className="gg-empty-icon" aria-hidden="true">{icon}</div>
      <Heading>{title}</Heading>
      {children && <p>{children}</p>}
      {action && <div className="gg-empty-actions">{action}</div>}
    </div>
  );
}

export function ErrorNote({ error, onRetry }) {
  if (!error) return null;
  return (
    <div className="gg-alert gg-alert--error" role="alert">
      <span>{error.message || String(error)}</span>
      {onRetry && <button type="button" className="btn-outline btn-sm" onClick={onRetry}>↻ Try again</button>}
    </div>
  );
}

export function Notice({ tone = 'info', children, role }) {
  return <div className={`gg-alert gg-alert--${tone}`} role={role}>{children}</div>;
}

/** A status label; `labels` maps statuses to { label, tone } (order statuses by default). */
export function StatusPill({ status, labels = ORDER_STATUS }) {
  const s = labels[status] || { label: status, tone: 'info' };
  return <span className={`gg-status gg-status--${s.tone}`}>{s.label}</span>;
}

export function PaymentPill({ status, method, orderStatus }) {
  // A cancelled order that was never paid owes nothing (paid ones show "Refund in progress").
  if (orderStatus === 'CANCELLED' && status === 'PENDING') return <span className="gg-status gg-status--soft">No payment due</span>;
  if (method === 'COD' && status === 'PENDING') return <span className="gg-status gg-status--soft">💰 Pay on delivery</span>;
  const tone = status === 'PAID' ? 'ok' : status === 'FAILED' ? 'bad' : 'warn';
  return <span className={`gg-status gg-status--${tone} gg-status--soft`}>{PAYMENT_STATUS[status] || status}</span>;
}

export function QuantityStepper({ value, onChange, min = 1, max = 10, disabled, label = 'Quantity' }) {
  return (
    <div className="qty-row" role="group" aria-label={label}>
      <button type="button" className="qty-btn" aria-label="Decrease quantity" disabled={disabled || value <= min} onClick={() => onChange(value - 1)}>−</button>
      <span className="qty-num" aria-live="polite">{value}</span>
      <button type="button" className="qty-btn" aria-label="Increase quantity" disabled={disabled || value >= max} onClick={() => onChange(value + 1)}>+</button>
    </div>
  );
}

/** Label + input + error, in the homepage form style (mono uppercase label). */
export function Field({ label, error, hint, as = 'input', className = '', children, id: idProp, ...props }) {
  const autoId = useId();
  const id = idProp || autoId; // an explicit id (e.g. to focus the field) still labels the input
  const describedBy = [error ? `${id}-err` : null, hint ? `${id}-hint` : null].filter(Boolean).join(' ') || undefined;
  const common = { id, 'aria-invalid': !!error, 'aria-describedby': describedBy, className: 'gg-input', ...props };
  return (
    <div className={`gg-field ${error ? 'gg-field--error' : ''} ${className}`}>
      <label htmlFor={id}>{label}</label>
      {as === 'select' ? <select {...common}>{children}</select> : as === 'textarea' ? <textarea {...common} /> : <input {...common} />}
      {hint && !error && <small id={`${id}-hint`} className="gg-hint">{hint}</small>}
      {error && <small id={`${id}-err`} className="gg-error">{error}</small>}
    </div>
  );
}

export function PasswordField(props) {
  const [show, setShow] = useState(false);
  return (
    <div className="gg-password">
      <Field type={show ? 'text' : 'password'} {...props} />
      <button type="button" className="gg-password-toggle" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'}>
        {show ? 'Hide' : 'Show'}
      </button>
    </div>
  );
}

export function Breadcrumbs({ items }) {
  return (
    <nav className="gg-breadcrumb" aria-label="Breadcrumb">
      {items.map((it, i) => (
        <span key={i}>
          {i > 0 && <span className="gg-breadcrumb-sep" aria-hidden="true"> › </span>}
          {it.to ? <Link to={it.to}>{it.label}</Link> : <span aria-current="page">{it.label}</span>}
        </span>
      ))}
    </nav>
  );
}

export function Pagination({ page, totalPages, onChange }) {
  if (totalPages <= 1) return null;
  return (
    <nav className="gg-pagination" aria-label="Pages">
      <button type="button" className="btn-outline btn-sm" disabled={page === 0} onClick={() => onChange(page - 1)}>← Previous</button>
      <span>Page {page + 1} of {totalPages}</span>
      <button type="button" className="btn-outline btn-sm" disabled={page + 1 >= totalPages} onClick={() => onChange(page + 1)}>Next →</button>
    </nav>
  );
}
