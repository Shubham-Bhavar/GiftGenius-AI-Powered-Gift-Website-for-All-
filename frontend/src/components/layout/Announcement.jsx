

export function Announcement() {
  return (
    <div className="announcement" role="region" aria-label="Promotions">
      <span>🎁 Free shipping on orders above ₹999</span>
      <span className="ann-divider" aria-hidden="true" />
      <span>Use code <strong className="ann-highlight">GIFT20</strong> for 20% off</span>
      <span className="ann-divider" aria-hidden="true" />
      <span>Same-day delivery in Mumbai</span>
    </div>
  );
}
