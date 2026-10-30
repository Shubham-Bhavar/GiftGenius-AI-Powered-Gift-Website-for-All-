import { Link } from 'react-router';
import SafeImg from '../common/SafeImg.jsx';
import { rupees } from '../../utils/format.js';
import { MatchBadge, usePick } from './RecommendationCard.jsx';

/** The planner's kinds of gift, as the API names them. */
const KINDS = {
  practical: { icon: '🧰', label: 'Practical', hint: "Something they'll use every day" },
  emotional: { icon: '💌', label: 'Emotional', hint: 'Something that keeps a memory' },
  experience: { icon: '🌿', label: 'Experience', hint: 'Something to enjoy and unwind with' },
};

const kindOf = (key) => KINDS[key] ?? { icon: '🎁', label: key, hint: '' };

function PlanCard({ option }) {
  const { p, added, add } = usePick(option, (x) => `${x.name} added to cart 🛒`);
  const kind = kindOf(option.kind);
  return (
    <div className="plan-card">
      <div className="plan-kind">
        <span aria-hidden="true">{kind.icon}</span> {kind.label}
        <span className="plan-kind-hint">{kind.hint}</span>
      </div>
      <Link to={`/product/${p.id}`} className="plan-product">
        <SafeImg src={p.image} alt="" className="plan-img" loading="lazy" />
        <span className="plan-name">{p.name}</span>
      </Link>
      <p className="plan-reason">{option.reason}</p>
      <div className="plan-foot">
        <span className="rpc-now">{rupees(p.price)}</span>
        <MatchBadge match={option.match} />
        <button type="button" className="rpc-add" disabled={added} onClick={add}
          aria-label={added ? `${p.name} added` : `Add ${p.name} to cart`}>{added ? '✓ Added' : '+ Add'}</button>
      </div>
    </div>
  );
}

/**
 * The budget-first plan: one practical, one emotional and one experience gift, each within the budget, so the
 * shopper weighs three different ideas instead of scrolling. Shown only when the server planned something.
 */
export function GiftPlan({ plan }) {
  if (!plan?.options?.length) return null;
  const missing = plan.missing.map((k) => kindOf(k).label.toLowerCase());
  return (
    <section className="gift-plan" aria-labelledby="gift-plan-title">
      <div className="q-number">Budget-first plan</div>
      <h3 id="gift-plan-title" className="gift-plan-title">
        {plan.options.length === 1 ? `One idea within ${rupees(plan.budget)}` : `${plan.options.length} ways to spend ${rupees(plan.budget)}`}
      </h3>
      <p className="gift-plan-sub">A different kind of gift each, all within your budget.</p>
      <div className="gift-plan-grid">
        {plan.options.map((o) => <PlanCard key={o.kind} option={o} />)}
      </div>
      {missing.length > 0 && (
        <p className="gift-plan-missing">No {missing.join(' or ')} gift within {rupees(plan.budget)} yet.</p>
      )}
    </section>
  );
}
