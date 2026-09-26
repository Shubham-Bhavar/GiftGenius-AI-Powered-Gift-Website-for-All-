import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import EntryAnimation from '../components/EntryAnimation.jsx';
import { ProductGrid, ProductGridSkeleton } from '../components/ProductCard.jsx';
import { Newsletter } from '../components/Footer.jsx';
import { CategoryIcon, OCCASION_CARDS } from '../components/occasions.jsx';
import { ErrorNote } from '../components/ui.jsx';
import { SITE } from '../config/site.js';
import { useSearch } from '../context/SearchContext.jsx';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { useReveal } from '../hooks/useReveal.js';
import { api } from '../lib/api.js';

/* Fuzzy search from the original homepage: all query characters appear in order. */
function fuzzyMatch(str, query) {
  const s = (str || '').toLowerCase();
  const q = query.toLowerCase().trim();
  if (!q) return true;
  let si = 0;
  for (let qi = 0; qi < q.length; qi++) {
    si = s.indexOf(q[qi], si);
    if (si === -1) return false;
    si++;
  }
  return true;
}
const matchesQuery = (p, q) => !q || [p.name, p.category, p.tags.join(' ')].some((f) => fuzzyMatch(f, q));
const matchesFilter = (p, f) => f === 'all' || (f === 'budget' ? Number(p.price) < 999 : p.tags.includes(f));

const FILTERS = [
  ['all', 'All'], ['for-her', 'For Her'], ['for-him', 'For Him'], ['budget', 'Under ₹999'], ['premium', 'Premium'], ['personalized', 'Personalized'],
];
const MARQUEE = ['Birthday Gifts', 'Anniversary Surprises', 'Festival Hampers', 'Luxury Perfumes', 'Personalized Gifts',
  'Same-Day Delivery', 'Free Gift Wrapping', '4.9★ Rated Service'];

/** The original homepage, section for section, with live products, search, filters and sort. */
export default function Home() {
  useDocumentTitle(null);
  const { query } = useSearch();
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('default');
  const [debounced, setDebounced] = useState(query);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(t);
  }, [query]);

  const catalog = useQuery({ queryKey: ['catalog'], queryFn: () => api.products({ size: 100 }), staleTime: 60_000 });

  const products = useMemo(() => {
    const list = (catalog.data?.content ?? []).filter((p) => matchesQuery(p, debounced) && matchesFilter(p, filter));
    const by = {
      'price-asc': (a, b) => a.price - b.price,
      'price-desc': (a, b) => b.price - a.price,
      rating: (a, b) => b.rating - a.rating,
    }[sort];
    return by ? [...list].sort(by) : list;
  }, [catalog.data, debounced, filter, sort]);

  useReveal([catalog.data, products.length]);

  return (
    <>
      <EntryAnimation />

      <section className="hero" aria-label="Welcome to GiftGenius">
        <div className="hero-left">
          <p className="hero-eyebrow" aria-hidden="true"><span className="eyebrow-line" />Curated With Love</p>
          <h1>Find the <br /><em>Perfect Gift</em><br />for Every Occasion</h1>
          <p className="hero-desc">Thoughtfully curated gifts that create lasting memories. From birthdays to anniversaries — we help you express what words simply can&apos;t.</p>
          <div className="hero-actions">
            <a href="#products" className="btn-primary">Explore Gifts →</a>
            <Link to="/gift-finder" className="btn-outline" id="giftFinderBtn">✨ Find My Perfect Gift</Link>
          </div>
          <div className="hero-progress" aria-hidden="true">
            <div className="progress-label"><span>Customer Satisfaction</span><span>98%</span></div>
            <div className="progress-track"><div className="progress-fill" style={{ '--fill': '98%' }} /></div>
          </div>
          <div className="hero-stats" role="group" aria-label="GiftGenius statistics">
            <div className="stat"><span className="stat-num">50K+</span><span className="stat-label">Happy Customers</span></div>
            <div className="stat"><span className="stat-num">1,200+</span><span className="stat-label">Gift Options</span></div>
            <div className="stat"><span className="stat-num">4.9 ★</span><span className="stat-label">Average Rating</span></div>
          </div>
        </div>
        <div className="hero-right" aria-hidden="true">
          <div className="hero-visual">
            <div className="gift-scene">
              <span className="sp" /><span className="sp" /><span className="sp" /><span className="sp" /><span className="sp" />
              <div className="img-tl"><img src="https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=300&q=80" alt="" loading="lazy" /></div>
              <div className="img-tr"><img src="https://images.unsplash.com/photo-1512909006721-3d6018887383?w=300&q=80" alt="" loading="lazy" /></div>
              <div className="hcard hcard--top">
                <div className="hcard-ico">🚀</div>
                <div className="hcard-body"><strong>Same-Day Delivery</strong><span>Order before 2 PM</span></div>
              </div>
              <div className="gift-ribbon">✨ Most Loved</div>
              <div className="img-main"><img src="https://images.unsplash.com/photo-1549465220-1a8b9238cd48?w=400&q=85" alt="Luxury gift box" loading="lazy" /></div>
              <div className="img-bl"><img src="https://images.unsplash.com/photo-1585386959984-a4155224a1ad?w=250&q=80" alt="" loading="lazy" /></div>
              <div className="img-br"><img src="https://images.unsplash.com/photo-1483985988355-763728e1935b?w=250&q=80" alt="" loading="lazy" /></div>
              <div className="hcard hcard--bot">
                <div className="hcard-ico">🎀</div>
                <div className="hcard-body"><strong>Free Gift Wrapping</strong><span>On all orders ₹499+</span></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="marquee-section" aria-hidden="true">
        <div className="marquee-track">
          {[...MARQUEE, ...MARQUEE].map((m, i) => (
            <div className="marquee-item" key={i}><span className="marquee-dot">✦</span> {m}</div>
          ))}
        </div>
      </div>

      <section className="section cats-bg" aria-labelledby="cats-heading">
        <header className="sec-header sec-header--center">
          <p className="sec-eyebrow sec-eyebrow--center"><span className="sec-line" aria-hidden="true" /> Occasions <span className="sec-line" aria-hidden="true" /></p>
          <h2 id="cats-heading">Shop by Occasion</h2>
          <p>Find the right gift for every meaningful moment in life</p>
        </header>
        <div className="category-grid">
          {OCCASION_CARDS.map((c) => (
            <Link key={c.key} to={c.to} className="cat-card" aria-label={`${c.label} gifts`}>
              <CategoryIcon name={c.key} />
              <span>{c.label}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="promo-wrap" aria-label="Promotional offer">
        <div className="promo-banner">
          <div className="promo-text">
            <p className="sec-eyebrow promo-eyebrow"><span className="sec-line sec-line--faded" aria-hidden="true" /> Limited Offer</p>
            <h2>Season Sale —<br />Gifts Under ₹999</h2>
            <p>Curated picks for every budget.{SITE.promoEnds && <> Offer ends <strong>{SITE.promoEnds}</strong>.</>}</p>
            <div className="promo-progress" role="img" aria-label="Sale progress: 68% claimed">
              <div className="promo-progress-label" aria-hidden="true"><span>Sale Progress</span><span>68% claimed</span></div>
              <div className="promo-progress-track"><div className="promo-progress-fill" /></div>
            </div>
            <Link to="/shop?maxPrice=999" className="btn-primary promo-cta">Shop Sale →</Link>
          </div>
          <div className="promo-right" aria-hidden="true">
            <div className="promo-num">30<span className="promo-pct">%</span></div>
            <span className="promo-off">OFF SELECTED ITEMS</span>
          </div>
        </div>
      </section>

      <section className="products-section" id="products" aria-labelledby="products-heading">
        <div className="sec-topbar">
          <h2 id="products-heading">Trending Gifts</h2>
          <Link to="/shop" className="link-arrow">View all →</Link>
        </div>
        <div className="sort-row">
          <label htmlFor="sortSelect" className="sr-only">Sort products</label>
          <select id="sortSelect" className="sort-select" aria-label="Sort products" value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="default">Sort: Featured</option>
            <option value="price-asc">Price: Low to High</option>
            <option value="price-desc">Price: High to Low</option>
            <option value="rating">Top Rated</option>
          </select>
        </div>
        <div className="pills" role="group" aria-label="Filter products">
          {FILTERS.map(([key, label]) => (
            <button key={key} type="button" className={`pill ${filter === key ? 'active' : ''}`} aria-pressed={filter === key} onClick={() => setFilter(key)}>
              {label}
            </button>
          ))}
        </div>
        <p className="search-status sr-only" aria-live="polite" aria-atomic="true">
          {debounced ? `${products.length} product${products.length !== 1 ? 's' : ''} found` : ''}
        </p>
        {catalog.isPending && <ProductGridSkeleton count={8} />}
        <ErrorNote error={catalog.error} onRetry={() => catalog.refetch()} />
        {catalog.data && (products.length > 0 ? (
          <ProductGrid products={products} id="productGrid" />
        ) : (
          <p className="home-no-match">No gifts match that search. <Link to="/gift-finder">Let GiftGenius AI suggest something →</Link></p>
        ))}
      </section>

      <section className="features" aria-label="Why shop with us">
        <div className="feat-item"><div className="feat-ico" aria-hidden="true">🚀</div><div className="feat-text"><strong>Same-Day Delivery</strong><span>Order before 2 PM in Mumbai</span></div></div>
        <div className="feat-item"><div className="feat-ico" aria-hidden="true">🎀</div><div className="feat-text"><strong>Free Gift Wrapping</strong><span>On all orders above ₹499</span></div></div>
        <div className="feat-item"><div className="feat-ico" aria-hidden="true">💬</div><div className="feat-text"><strong>Personalized Messages</strong><span>Add a heartfelt note, free</span></div></div>
        <div className="feat-item"><div className="feat-ico" aria-hidden="true">🔄</div><div className="feat-text"><strong>Easy Returns</strong><span>7-day hassle-free returns</span></div></div>
      </section>

      <section className="testimonials" aria-labelledby="testimonials-heading">
        <header className="sec-header sec-header--center">
          <p className="sec-eyebrow sec-eyebrow--center sec-eyebrow--dim">
            <span className="sec-line sec-line--faded" aria-hidden="true" /> Customer Stories <span className="sec-line sec-line--faded" aria-hidden="true" />
          </p>
          <h2 id="testimonials-heading" className="heading--light">Loved by Gift-Givers</h2>
          <p className="subheading--dim">Real reviews from real customers across India</p>
        </header>
        <div className="tgrid">
          <article className="tcard">
            <div className="t-stars" role="img" aria-label="5 out of 5 stars">★★★★★</div>
            <blockquote className="t-quote">&quot;Ordered a hamper box for my mom&apos;s birthday and it arrived beautifully wrapped. She absolutely loved it. Will definitely order again!&quot;</blockquote>
            <footer className="t-author"><div className="t-av" aria-hidden="true">PR</div><div><cite className="t-name">Priya Rajan</cite><p className="t-loc">Mumbai, Maharashtra</p></div></footer>
          </article>
          <article className="tcard">
            <div className="t-stars" role="img" aria-label="5 out of 5 stars">★★★★★</div>
            <blockquote className="t-quote">&quot;The engraved watch was exactly what I was looking for. Fast delivery, premium packaging, and the engraving quality was top-notch.&quot;</blockquote>
            <footer className="t-author"><div className="t-av t-av--teal" aria-hidden="true">AK</div><div><cite className="t-name">Arjun Kapoor</cite><p className="t-loc">Pune, Maharashtra</p></div></footer>
          </article>
          <article className="tcard">
            <div className="t-stars" role="img" aria-label="5 out of 5 stars">★★★★★</div>
            <blockquote className="t-quote">&quot;GiftGenius made my anniversary so special. The surprise gift was perfectly curated and my wife couldn&apos;t stop smiling. Highly recommend!&quot;</blockquote>
            <footer className="t-author"><div className="t-av t-av--rose" aria-hidden="true">RS</div><div><cite className="t-name">Rohit Sharma</cite><p className="t-loc">Delhi, India</p></div></footer>
          </article>
        </div>
      </section>

      <Newsletter />
    </>
  );
}
