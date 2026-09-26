import { Link } from 'react-router';
import { ProductGrid } from '../components/ProductCard.jsx';
import { EmptyState, PageHero, Spinner } from '../components/ui.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useUi } from '../context/UiContext.jsx';
import { useWishlist } from '../context/WishlistContext.jsx';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { useReveal } from '../hooks/useReveal.js';

export default function Wishlist() {
  useDocumentTitle('My Wishlist');
  const wishlist = useWishlist();
  const { user } = useAuth();
  const { openAuth } = useUi();
  useReveal([wishlist.items.length]);

  return (
    <>
      <PageHero eyebrow="Saved For Later" title="My" em="Wishlist">
        {wishlist.count > 0 ? `${wishlist.count} ${wishlist.count === 1 ? 'gift' : 'gifts'} you love, all in one place.` : 'Tap the 🤍 on any gift to save it here.'}
      </PageHero>
      <section className="products-section gg-section-top">
        {wishlist.loading && <Spinner label="Loading your wishlist…" />}
        {!wishlist.loading && wishlist.count === 0 && (
          <EmptyState icon="🤍" title="Nothing saved yet" action={<Link to="/shop" className="btn-primary">Explore Gifts →</Link>}>
            Save gift ideas while you browse, then come back when you&apos;re ready.
          </EmptyState>
        )}
        {wishlist.count > 0 && (
          <>
            <h2 className="sr-only">Saved gifts</h2>
            <ProductGrid products={wishlist.items} label="Wishlist" />
          </>
        )}
        {!user && wishlist.count > 0 && (
          <p className="gg-center-note">
            <button type="button" className="auth-link auth-link--gold" onClick={() => openAuth('login')}>Sign in</button> to keep your wishlist on every device.
          </p>
        )}
      </section>
    </>
  );
}
