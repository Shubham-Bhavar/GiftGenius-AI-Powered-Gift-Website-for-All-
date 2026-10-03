import { useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { ErrorNote, Pagination, Spinner } from '../../components/common/ui.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { adminApi, adminKeys, adminQueries } from '../../services/admin.js';
import { dateTime } from '../../lib/format.js';

const TOPIC_LABEL = { general: 'General', order: 'Order help', bulk: 'Bulk order', partnership: 'Partnership' };

export function AdminMessages() {
  const qc = useQueryClient();
  const toast = useToast();
  const [showHandled, setShowHandled] = useState(false);
  const [page, setPage] = useState(0);
  const messages = useQuery({
    ...adminQueries.messages({ showHandled, page }),
    placeholderData: keepPreviousData,
  });
  const mark = async (m) => {
    try {
      await adminApi.markMessageHandled(m.id, !m.handled);
      qc.invalidateQueries({ queryKey: adminKeys.messages() });
      toast(m.handled ? 'Marked as open' : 'Marked as handled ✓');
    } catch (err) {
      toast(err.message, 'bad');
    }
  };
  return (
    <>
      <div className="adm-toolbar">
        <label className="adm-check"><input type="checkbox" checked={showHandled} onChange={(e) => { setShowHandled(e.target.checked); setPage(0); }} /> Show handled messages</label>
      </div>
      {messages.isPending && <Spinner />}
      <ErrorNote error={messages.error} />
      {messages.data?.content.length === 0 && <p className="co-muted">No {showHandled ? '' : 'open '}messages. 🎉</p>}
      <div className="adm-messages">
        {messages.data?.content.map((m) => (
          <article key={m.id} className={`od-card adm-message ${m.handled ? 'is-muted' : ''}`}>
            <header>
              <div>
                <strong>{m.name}</strong> · <a href={`mailto:${m.email}`}>{m.email}</a>
                <div className="co-muted">{TOPIC_LABEL[m.topic] ?? m.topic}{m.orderNumber ? ` · ${m.orderNumber}` : ''} · {dateTime(m.createdAt)}</div>
              </div>
              <button type="button" className="btn-outline btn-sm" onClick={() => mark(m)}>{m.handled ? 'Reopen' : '✓ Mark handled'}</button>
            </header>
            <p>{m.message}</p>
          </article>
        ))}
      </div>
      {messages.data && <Pagination page={messages.data.page} totalPages={messages.data.totalPages} onChange={setPage} />}
    </>
  );
}
