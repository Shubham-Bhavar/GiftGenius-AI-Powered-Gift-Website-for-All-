/* Occasion cards and their line icons, exactly as drawn on the original homepage. */

const ICONS = {
  birthday: (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="6" y="22" width="36" height="22" rx="3" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="2" />
      <rect x="10" y="28" width="28" height="16" rx="2" fill="currentColor" opacity="0.08" />
      <path d="M6 28h36" stroke="currentColor" strokeWidth="2" />
      <path d="M24 22V44" stroke="currentColor" strokeWidth="2" />
      <path d="M24 22c0 0-6-6-6-10a6 6 0 0112 0c0 4-6 10-6 10z" stroke="currentColor" strokeWidth="2" fill="currentColor" opacity="0.2" />
      <circle cx="16" cy="14" r="2" fill="currentColor" />
      <circle cx="24" cy="12" r="2" fill="currentColor" />
      <circle cx="32" cy="14" r="2" fill="currentColor" />
      <line x1="16" y1="14" x2="16" y2="22" stroke="currentColor" strokeWidth="1.5" />
      <line x1="24" y1="12" x2="24" y2="22" stroke="currentColor" strokeWidth="1.5" />
      <line x1="32" y1="14" x2="32" y2="22" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  anniversary: (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="24" cy="24" r="10" stroke="currentColor" strokeWidth="2.5" fill="currentColor" opacity="0.1" />
      <circle cx="24" cy="24" r="6" stroke="currentColor" strokeWidth="2" fill="none" />
      <path d="M24 8V4M24 44v-4M8 24H4M44 24h-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M14 14l-2.8-2.8M36.8 36.8L34 34M34 14l2.8-2.8M11.2 36.8L14 34" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="24" cy="24" r="2" fill="currentColor" />
    </svg>
  ),
  festival: (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="10" y="24" width="28" height="18" rx="3" fill="currentColor" opacity="0.12" stroke="currentColor" strokeWidth="2" />
      <path d="M10 30h28" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />
      <path d="M24 24V42" stroke="currentColor" strokeWidth="2" />
      <path d="M10 24h28" stroke="currentColor" strokeWidth="2.5" />
      <path d="M18 24c0-4 3-8 6-8s6 4 6 8" stroke="currentColor" strokeWidth="2" fill="currentColor" opacity="0.12" />
      <path d="M14 24c0-3 2-7 5-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M34 24c0-3-2-7-5-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="24" cy="10" r="3" fill="currentColor" opacity="0.8" />
      <circle cx="14" cy="13" r="2" fill="currentColor" opacity="0.5" />
      <circle cx="34" cy="13" r="2" fill="currentColor" opacity="0.5" />
    </svg>
  ),
  graduation: (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M24 10L4 20l20 10 20-10-20-10z" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M12 25v10c0 0 4 6 12 6s12-6 12-6V25" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="40" y1="20" x2="40" y2="34" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="40" cy="36" r="2" fill="currentColor" />
    </svg>
  ),
  valentine: (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M24 38S8 28 8 17a8 8 0 0116-2 8 8 0 0116 2c0 11-16 21-16 21z" fill="currentColor" opacity="0.2" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M18 18c0-2 2-4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
    </svg>
  ),
  baby: (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="24" cy="20" r="10" fill="currentColor" opacity="0.12" stroke="currentColor" strokeWidth="2" />
      <circle cx="20" cy="18" r="1.5" fill="currentColor" />
      <circle cx="28" cy="18" r="1.5" fill="currentColor" />
      <path d="M19 24c1.5 2 8.5 2 10 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M12 34c0-4 5-7 12-7s12 3 12 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M14 10c-4-2-4-8 2-8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  achievement: (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M24 6l4.5 9 10 1.5-7.2 7 1.7 10L24 29l-9 4.5 1.7-10L9.5 16.5l10-1.5L24 6z" fill="currentColor" opacity="0.2" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <line x1="18" y1="40" x2="30" y2="40" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="24" y1="34" x2="24" y2="40" stroke="currentColor" strokeWidth="2" />
    </svg>
  ),
  surprise: (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="8" y="22" width="32" height="22" rx="3" fill="currentColor" opacity="0.12" stroke="currentColor" strokeWidth="2" />
      <path d="M8 30h32" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />
      <path d="M24 22V44" stroke="currentColor" strokeWidth="2" />
      <rect x="8" y="18" width="32" height="6" rx="2" fill="currentColor" opacity="0.2" stroke="currentColor" strokeWidth="2" />
      <path d="M24 18c-4-2-8-8-2-10 3-1 5 2 2 4 4-4 9-2 7 3-1 2-4 3-7 3z" fill="currentColor" opacity="0.6" stroke="currentColor" strokeWidth="1" />
    </svg>
  ),
};

export const OCCASION_CARDS = [
  { key: 'birthday', label: 'Birthday', to: '/shop?occasion=birthday' },
  { key: 'anniversary', label: 'Anniversary', to: '/shop?occasion=anniversary' },
  { key: 'festival', label: 'Festival', to: '/shop?occasion=festival' },
  { key: 'graduation', label: 'Graduation', to: '/shop?occasion=graduation' },
  { key: 'valentine', label: 'Valentine', to: '/shop?occasion=valentine' },
  { key: 'baby', label: 'Baby', to: '/shop?occasion=baby' },
  { key: 'achievement', label: 'Achievement', to: '/shop?occasion=achievement' },
  { key: 'surprise', label: 'Surprise', to: '/gift-finder' },
];

export function CategoryIcon({ name }) {
  return <span className="cat-ico" aria-hidden="true">{ICONS[name] ?? ICONS.surprise}</span>;
}
