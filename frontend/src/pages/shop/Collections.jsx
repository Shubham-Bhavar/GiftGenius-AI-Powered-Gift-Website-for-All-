import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { CategoryIcon, OCCASION_CARDS } from '../../components/product/occasions.jsx';
import { ErrorNote, PageHero, SecHeader } from '../../components/common/ui.jsx';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { catalogQueries } from '../../services/catalog.js';
import { titleCase } from '../../lib/format.js';
import { Reveal } from '../../animations/Reveal.jsx';

const CATEGORY_EMOJI = {
  'gift sets': '🎁', accessories: '⌚', flowers: '🌹', fragrance: '🌺', personalized: '✍️',
  'food & sweets': '🍫', wellness: '🧘', 'home decor': '🏡', cultural: '🎨',
};

export function Collections() {
  useDocumentTitle('Collections');
  const categories = useQuery(catalogQueries.categories());
  return (
    <>
      <PageHero eyebrow="Curated For You" title="Our" em="Collections">Shop by the moment you&apos;re celebrating, or by what they love.</PageHero>
      <Reveal>
        <section className="section cats-bg" aria-labelledby="occ-h">
          <SecHeader eyebrow="Occasions" title="Shop by Occasion" sub="Find the right gift for every meaningful moment in life" id="occ-h" />
          <div className="category-grid">
            {OCCASION_CARDS.map((c) => (
              <Link key={c.key} to={c.to} className="cat-card" aria-label={`${c.label} gifts`}>
                <CategoryIcon name={c.key} /><span>{c.label}</span>
              </Link>
            ))}
          </div>
        </section>
      </Reveal>
      <Reveal>
        <section className="section" aria-labelledby="cat-h">
          <SecHeader eyebrow="Categories" title="Shop by Category" sub="From fresh flowers to keepsakes they'll treasure" id="cat-h" />
          <ErrorNote error={categories.error} onRetry={() => categories.refetch()} />
          <div className="coll-grid">
            {categories.data?.map((c) => (
              <Link key={c.category} to={`/shop?category=${encodeURIComponent(c.category)}`} className="coll-card reveal-on-scroll">
                <span className="coll-emoji" aria-hidden="true">{CATEGORY_EMOJI[c.category] ?? '🎁'}</span>
                <strong>{titleCase(c.category)}</strong>
                <span>{c.count} {c.count === 1 ? 'gift' : 'gifts'} →</span>
              </Link>
            ))}
          </div>
        </section>
      </Reveal>
    </>
  );
}
