import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Field, StatusPill } from '../../components/common/ui.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { adminApi, adminKeys } from '../../services/admin.js';
import { PRODUCT_STATUS, productState } from '../../lib/marketplace.js';
import { catalogKeys } from '../../services/catalog.js';

/** Approve or reject a seller's product, with a reason the seller sees. */
export function ReviewPanel({ product, onDone }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const canApprove = product.status === 'PENDING_APPROVAL';
  const canReject = product.status === 'PENDING_APPROVAL' || product.status === 'APPROVED';

  const run = async (fn, message) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      [adminKeys.all(), catalogKeys.products(), catalogKeys.product(), catalogKeys.catalog(), catalogKeys.categories()]
        .forEach((queryKey) => qc.invalidateQueries({ queryKey }));
      toast(message);
      onDone();
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };
  const reject = (e) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError(new Error('Give a reason the seller will see.'));
      return;
    }
    run(() => adminApi.rejectProduct(product.id, reason.trim()),
      product.status === 'APPROVED' ? `${product.name} taken down` : `${product.name} rejected`);
  };

  return (
    <section className="od-card adm-review" aria-labelledby="adm-review-h">
      <h2 id="adm-review-h">🏪 Marketplace Review</h2>
      <p>Sold by <strong>{product.seller.storeName}</strong> · <StatusPill status={productState(product)} labels={PRODUCT_STATUS} /></p>
      {product.rejectionReason && <p className="co-muted">Reason given to the seller: {product.rejectionReason}</p>}
      {canApprove && (
        <div className="adm-actions">
          <button type="button" className="btn-primary btn-sm" disabled={busy}
            onClick={() => run(() => adminApi.approveProduct(product.id), `${product.name} approved and listed ✓`)}>✓ Approve &amp; List</button>
        </div>
      )}
      {canReject && (
        <form className="adm-status-form" onSubmit={reject} noValidate>
          <Field label={product.status === 'APPROVED' ? 'Reason for taking it down' : 'Reason for rejecting'} as="textarea" rows={2}
            maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} hint="The seller sees this and can fix the product." />
          <button className="btn-outline btn-sm" disabled={busy}>{product.status === 'APPROVED' ? 'Take Down' : '✕ Reject'}</button>
        </form>
      )}
      {!canApprove && !canReject && <p className="co-muted">Nothing to review: the seller hasn&apos;t submitted this product.</p>}
      {error && <div className="gg-alert gg-alert--error" role="alert">{error.message}</div>}
    </section>
  );
}
