import { useState } from 'react';

// Branded placeholder (gift icon on the homepage's light-teal) for product photos that fail to load.
const FALLBACK = `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect width="400" height="300" fill="#D0EFF5"/>'
  + '<g transform="translate(160 100)" fill="#3A8F98"><rect x="4" y="38" width="72" height="52" rx="5" opacity=".25"/>'
  + '<rect y="24" width="80" height="18" rx="4" opacity=".45"/><rect x="36" y="24" width="8" height="66" fill="#B8791A"/>'
  + '<path d="M40 24c-6-14-24-18-24-6 0 7 14 6 24 6zm0 0c6-14 24-18 24-6 0 7-14 6-24 6z" fill="#B8791A"/></g></svg>',
)}`;

/** An <img> that swaps to a branded placeholder if the (external) photo can't be loaded. */
export default function SafeImg({ src, alt = '', ...props }) {
  const [failed, setFailed] = useState(false);
  return (
    <img
      src={failed || !src ? FALLBACK : src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      {...props}
    />
  );
}
