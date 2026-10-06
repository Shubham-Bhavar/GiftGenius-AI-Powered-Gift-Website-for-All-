/** Store details shown across the site. Edit these before going live. */

export const SITE = {
  name: 'GiftGenius',

  supportEmail: 'shubhambhavar7447@gmail.com',
  supportPhone: '+91 9371522737',

  city: 'Sangamner, Ahilyanagar, Maharashtra',

  // Leave empty to hide the sale end date.
  promoEnds: '',

  // Social links. Leave empty until official accounts are created.
  social: {
    facebook: '',
    instagram: '',
    twitter: '',
    youtube: '',
  },
};

export const NAV_LINKS = [
  { to: '/', label: 'Home', end: true },
  { to: '/shop', label: 'Gifts' },
  { to: '/gift-finder', label: 'Find a Gift' },
  { to: '/collections', label: 'Collections' },
  { to: '/about', label: 'About' },
  { to: '/contact', label: 'Contact' },
];