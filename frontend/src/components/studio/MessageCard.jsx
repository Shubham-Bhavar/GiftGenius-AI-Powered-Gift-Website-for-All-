/** The gift card as it will read: the card style, their name, the message and, on a photo card, the first photos. */
export function MessageCard({ style, name, message, photos = [], compact = false }) {
  const photoCard = style === 'photo' && photos.length > 0;
  return (
    <figure className={`msg-card msg-card--${style}${compact ? ' msg-card--compact' : ''}`} aria-label="Gift card preview">
      {photoCard && (
        <div className="msg-card-photos">
          {photos.slice(0, 3).map((src) => <img key={src} src={src} alt="" />)}
        </div>
      )}
      <figcaption>
        <span className="msg-card-to">{name.trim() ? `For ${name.trim()}` : 'For you'}</span>
        <span className="msg-card-text">{message.trim() || 'Your message will appear here.'}</span>
      </figcaption>
    </figure>
  );
}
