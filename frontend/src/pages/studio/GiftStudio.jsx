import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router';
import { useQueries, useQuery } from '@tanstack/react-query';
import SafeImg from '../../components/common/SafeImg.jsx';
import { Spinner } from '../../components/common/ui.jsx';
import { BoxComposer } from '../../components/studio/BoxComposer.jsx';
import { BuyerSummary } from '../../components/studio/BuyerSummary.jsx';
import { CompareLab } from '../../components/studio/CompareLab.jsx';
import { GiftBox3D } from '../../components/studio/GiftBox3D.jsx';
import { MessageCard } from '../../components/studio/MessageCard.jsx';
import { MessageToGift } from '../../components/studio/MessageToGift.jsx';
import { RevealPlayer } from '../../components/studio/RevealPlayer.jsx';
import { StudioControls } from '../../components/studio/StudioControls.jsx';
import { THEMES, readShare, sanitizeConfig, shareFragment, suggestThemes, themeLook } from '../../components/studio/look.js';
import { useToast } from '../../context/ToastContext.jsx';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { catalogQueries } from '../../services/catalog.js';
import { rupees } from '../../utils/format.js';

/*
 * The Gift Studio: see the gift before you give it. Dress the box (theme, colours, wrap, card), add the personal
 * touches, play the reveal the way they'll experience it, compare options, build a box of several gifts and share it.
 * Everything visual is a preview: the card message and printed name go with the order, packaging choices don't.
 */

const TABS = [['their', 'Their view'], ['yours', 'Your view'], ['compare', 'Compare'], ['box', 'Gift box']];
const WORD = /^[\p{L}\p{M} &'-]{1,30}$/u;
const word = (v) => (v && WORD.test(v) ? v.trim().toLowerCase() : undefined);

/** What the quiz or a product page passed along: the shopper's answers, used for suggestions and the box composer. */
function readContext(search) {
  const budget = Number(search.get('budget'));
  return {
    personality: word(search.get('style')),
    occasion: word(search.get('occasion')),
    recipient: word(search.get('recipient')),
    interests: (search.get('interests') ?? '').split(',').map(word).filter(Boolean).slice(0, 5),
    budget: Number.isInteger(budget) && budget > 0 && budget <= 1_000_000 ? budget : undefined,
  };
}

function initial(search, hash, context) {
  const shared = readShare(hash);
  if (shared) return { shared: shared.view, config: shared.config };
  const ids = (search.get('products') ?? search.get('product') ?? '').split(',').map(Number);
  const theme = suggestThemes(context)[0]?.theme ?? 'midnight';
  return { shared: null, config: sanitizeConfig({ ...themeLook(theme), products: ids, budget: context.budget }) };
}

function ShareBar({ config }) {
  const toast = useToast();
  const [link, setLink] = useState('');
  const share = async (view) => {
    const url = `${window.location.origin}/studio#${shareFragment(config, view)}`;
    setLink(url);
    try {
      await navigator.clipboard.writeText(url);
      toast(view === 'reveal' ? 'Surprise link copied: it plays the reveal, with no prices.' : 'Link copied: friends see the gifts, the prices and the preview.');
    } catch {
      toast('Copy the link below to share it.', 'warn');
    }
  };
  return (
    <section className="studio-share" aria-labelledby="studio-share-h">
      <h2 id="studio-share-h" className="studio-h">Share</h2>
      <div className="studio-share-actions">
        <button type="button" className="studio-link-btn" onClick={() => share('friends')}>🔗 Share with friends</button>
        <button type="button" className="studio-link-btn" onClick={() => share('reveal')}>🎁 Send as a surprise preview</button>
      </div>
      {link && (
        <>
          <label htmlFor="studio-share-link" className="sr-only">Share link</label>
          <input id="studio-share-link" className="pd-input" readOnly value={link} onFocus={(e) => e.target.select()} />
        </>
      )}
      <p className="studio-hint">A link carries the gifts, the look, the names and the message, never your photos; a surprise link also leaves out your budget. Nothing is stored on our servers, so anyone with the link sees what’s in it.</p>
    </section>
  );
}

function GiftPicker({ catalog, onPick }) {
  const [query, setQuery] = useState('');
  const matches = catalog.filter((p) => p.inStock && p.name.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8);
  return (
    <section className="studio-picker" aria-labelledby="studio-picker-h">
      <h2 id="studio-picker-h" className="studio-h">Choose a gift to dress up</h2>
      <label htmlFor="studio-picker-search" className="sr-only">Search gifts</label>
      <input id="studio-picker-search" className="pd-input" type="search" placeholder="Search gifts…" value={query}
        onChange={(e) => setQuery(e.target.value)} />
      <ul className="studio-picker-list">
        {matches.map((p) => (
          <li key={p.id}>
            <SafeImg src={p.image} alt="" />
            <span>{p.name}<small>{rupees(p.price)}</small></span>
            <button type="button" className="studio-link-btn" onClick={() => onPick(p.id)} aria-label={`Dress up ${p.name}`}>Choose</button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * A new studio URL starts a new studio: opening a shared link (even pasted into the address bar, which changes only
 * the hash) or "make your own" from one would otherwise keep the previous gift, as the page stays mounted.
 */
export default function GiftStudio() {
  const { search, hash } = useLocation();
  return <Studio key={`${search}${hash}`} />;
}

function Studio() {
  useDocumentTitle('Gift Studio');
  const [search] = useSearchParams();
  const location = useLocation();
  const [context, setContext] = useState(() => readContext(search));
  const [state, setState] = useState(() => initial(search, location.hash, context));
  const [editing, setEditing] = useState(!state.shared);
  const [tab, setTab] = useState('their');
  const [photos, setPhotos] = useState([]);
  const photosRef = useRef(photos);
  const { config } = state;

  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);
  // Photos are local object URLs: release them when the studio closes.
  useEffect(() => () => photosRef.current.forEach((src) => URL.revokeObjectURL(src)), []);

  const update = (changes) => setState((s) => ({ ...s, config: { ...s.config, ...changes } }));
  const catalog = useQuery(catalogQueries.catalog()).data?.content ?? [];
  const productQueries = useQueries({ queries: config.products.map((id) => catalogQueries.product(id)) });
  const products = productQueries.map((q) => q.data).filter(Boolean);
  const loading = productQueries.some((q) => q.isPending);
  const unavailable = productQueries.some((q) => q.isError);
  const suggestions = suggestThemes(context);
  const look = { box: config.box, ribbon: config.ribbon, pattern: config.pattern, tissue: THEMES[config.theme].tissue };

  const onTabKey = (e) => {
    const keys = TABS.map(([k]) => k);
    const i = keys.indexOf(tab);
    const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: keys.length - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    const k = keys[(next + keys.length) % keys.length];
    setTab(k);
    document.getElementById(`studio-tab-${k}`)?.focus();
  };

  // A surprise link plays the reveal for them, and nothing else: no prices, no controls.
  if (state.shared === 'reveal') {
    return (
      <div className="studio-page">
        <section className="page-hero"><h1>A gift preview, just for you</h1><p>Someone dressed up a gift with you in mind.</p></section>
        <div className="studio-solo">
          {loading ? <Spinner label="Wrapping it up…" /> : (
            <RevealPlayer config={config} look={look} items={products} photos={[]} occasion={undefined} />
          )}
          <Link to="/studio" className="studio-link-btn">Make a gift preview of your own →</Link>
        </div>
      </div>
    );
  }

  const panels = {
    their: products.length > 0 && (
      <RevealPlayer key={`${config.template}-${config.order}-${config.products.join('-')}`} config={config} look={look}
        items={products} photos={photos} occasion={context.occasion} />
    ),
    yours: products.length > 0 && (
      <div className="studio-yours">
        <div className="studio-yours-preview">
          <GiftBox3D look={look} items={products} photos={photos} state="open" interactive />
          <MessageCard style={config.card} name={config.name} message={config.message} photos={photos} compact />
        </div>
        <BuyerSummary config={config} products={products} look={look} photos={photos} />
      </div>
    ),
    compare: products.length > 0 && (
      <CompareLab config={config} products={products} catalog={catalog} photos={photos} suggestions={suggestions}
        onApply={(changes, ids) => update({ ...changes, ...(ids ? { products: ids } : {}) })} />
    ),
    box: (
      <BoxComposer context={context} catalog={catalog} onUse={(ids) => {
        update({ products: ids });
        setTab('their');
      }} />
    ),
  };
  const needsGift = products.length === 0 && !loading && tab !== 'box';

  return (
    <div className="studio-page">
      <section className="page-hero">
        <div className="page-eyebrow"><span className="eyebrow-line" />Gift Studio<span className="eyebrow-line" /></div>
        <h1>See the gift <em>before you give it</em></h1>
        <p>Dress the box, add your words, and watch the reveal the way they’ll experience it.</p>
      </section>

      {state.shared === 'friends' && (
        <div className="studio-shared-banner" role="note">
          <span>👋 A friend shared this gift with you.</span>
          {!editing && <button type="button" className="studio-link-btn" onClick={() => setEditing(true)}>Edit your own copy</button>}
        </div>
      )}
      {unavailable && <p className="gg-alert gg-alert--warn">One of the gifts in this link is no longer available.</p>}

      <div className={`studio-layout${editing && !needsGift ? '' : ' studio-layout--wide'}`}>
        <div className="studio-stage">
          <div className="studio-tabs" role="tablist" aria-label="Studio views" onKeyDown={onTabKey}>
            {TABS.map(([k, label]) => (
              <button key={k} type="button" role="tab" id={`studio-tab-${k}`} aria-selected={tab === k}
                aria-controls="studio-panel" tabIndex={tab === k ? 0 : -1} className={`studio-tab${tab === k ? ' active' : ''}`}
                onClick={() => setTab(k)}>{label}</button>
            ))}
          </div>
          <div role="tabpanel" id="studio-panel" aria-labelledby={`studio-tab-${tab}`} className="studio-panel-body">
            {loading && tab !== 'box' && <Spinner label="Loading your gift…" />}
            {needsGift && (
              <div className="studio-start">
                <GiftPicker catalog={catalog} onPick={(id) => update({ products: [id] })} />
                <MessageToGift onPick={({ productId, theme, message, occasion }) => {
                  update({ products: [productId], ...(theme ? themeLook(theme) : {}), ...(config.message ? {} : { message }) });
                  if (occasion) setContext((c) => ({ ...c, occasion }));
                }} />
                <p className="studio-hint">Or <button type="button" className="studio-link-btn" onClick={() => setTab('box')}>build a box of several gifts</button>.</p>
              </div>
            )}
            {!needsGift && panels[tab]}
          </div>
          {products.length > 0 && <ShareBar config={config} />}
        </div>
        {editing && !needsGift && (
          <section className="studio-side" aria-label="Customise the gift">
            <StudioControls config={config} update={update} applyTheme={(key) => update(themeLook(key))}
              suggestions={suggestions} products={products} photos={photos} setPhotos={setPhotos} />
          </section>
        )}
      </div>
    </div>
  );
}
