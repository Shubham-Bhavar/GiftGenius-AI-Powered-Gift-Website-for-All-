import { useMemo } from 'react';
import { BuyerSummary } from './BuyerSummary.jsx';
import { CARD_STYLES } from './look.js';
import { CompareStage } from './scene/CompareStage3D.jsx';

/**
 * The card as they'll read it: their name and the shopper's words, set on the card style chosen, with the shopper's photos
 * on a photo card. Nothing is written for the shopper: with no message yet, the card says where it will go.
 */
export function YourCard({ style, name, message, photos = [] }) {
  const to = name.trim() ? `For ${name.trim()}` : 'For you';
  const words = message.trim();
  const photoCard = style === 'photo' && photos.length > 0;
  return (
    <figure className={`your-card your-card--${style}${photoCard ? ' has-photos' : ''}`} aria-label="Gift card preview">
      {photoCard && (
        <div className="your-card-photos">
          {photos.slice(0, 3).map((src) => <img key={src} src={src} alt="" />)}
        </div>
      )}
      <figcaption>
        <span className="your-card-to">{to}</span>
        {words ? <span className="your-card-text">{words}</span> : <span className="your-card-text is-empty">Your message will appear here.</span>}
      </figcaption>
    </figure>
  );
}

/**
 * Your view: the gift as the shopper is sending it. The box in the studio, dressed as they chose and opening on their
 * gifts and card; the card, large enough to read; and what goes with the order, at what cost, with Add to cart. The
 * box is the same studio as Compare and Their view; the CSS box stands in where there's no 3D.
 */
export function YourView({ config, products, look, photos }) {
  const options = useMemo(() => [{ key: 'yours', caption: '', config, items: products }], [config, products]);
  return (
    <div className="studio-room your-room">
      <section className="your-section" aria-labelledby="yours-arrive-h">
        <h2 id="yours-arrive-h" className="studio-h">How it will arrive</h2>
        <CompareStage options={options} photos={photos} initiallyOpen />
      </section>
      <div className="your-grid">
        <section className="your-section" aria-labelledby="yours-card-h">
          <h2 id="yours-card-h" className="studio-h">The card they’ll read</h2>
          <YourCard style={config.card} name={config.name} message={config.message} photos={photos} />
          <p className="studio-note">The words go with your order. The {CARD_STYLES[config.card].toLowerCase()} card style is a preview.</p>
        </section>
        <BuyerSummary config={config} products={products} look={look} photos={photos} />
      </div>
    </div>
  );
}
