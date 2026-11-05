/**
 * The Gift Studio's presentation vocabulary: themes, colours, wrapping patterns and card styles, the rules that
 * suggest a theme, and the share link. Everything here is a visual preview: packaging choices aren't added to an
 * order, and actual wrapping may differ.
 */

/** Each theme sets the whole presentation, not just a colour: box, wrap, ribbon, tissue and card. */
export const THEMES = {
  midnight: { label: 'Midnight Luxury', blurb: 'Black, gold and premium', box: '#17181d', ribbon: '#d4af37', pattern: 'satin', tissue: '#2b2d35', card: 'noir' },
  minimal: { label: 'Minimal Elegance', blurb: 'White, neutral and simple', box: '#f3efe7', ribbon: '#c2ad8d', pattern: 'plain', tissue: '#ffffff', card: 'ivory' },
  celebration: { label: 'Birthday Celebration', blurb: 'Bright, ribbons and confetti', box: '#f2645a', ribbon: '#ffd23f', pattern: 'confetti', tissue: '#ffe9a8', card: 'party' },
  nature: { label: 'Nature Inspired', blurb: 'Earth tones and botanicals', box: '#b88a5e', ribbon: '#5a7d4a', pattern: 'botanical', tissue: '#ece2cb', card: 'kraft' },
  memories: { label: 'Personal Memories', blurb: 'Photos, names and your words', box: '#f1d6d8', ribbon: '#b4445b', pattern: 'polaroid', tissue: '#fff4f4', card: 'photo' },
};
export const THEME_KEYS = Object.keys(THEMES);

/** The presentation fields a theme sets on a configuration. */
export function themeLook(key) {
  const { box, ribbon, pattern, card } = THEMES[key];
  return { theme: key, box, ribbon, pattern, card };
}

export const BOX_COLOURS = [
  ['#17181d', 'Black'], ['#f3efe7', 'Ivory'], ['#f2645a', 'Coral'], ['#b88a5e', 'Kraft'], ['#f1d6d8', 'Blush'],
  ['#1f4e5f', 'Teal'], ['#5b2a86', 'Plum'], ['#2f5d3a', 'Forest'],
];
export const RIBBON_COLOURS = [
  ['#d4af37', 'Gold'], ['#c2ad8d', 'Sand'], ['#ffd23f', 'Sunshine'], ['#5a7d4a', 'Leaf'], ['#b4445b', 'Rose'],
  ['#8b1e3f', 'Burgundy'], ['#f5f5f5', 'Silver white'], ['#1d3557', 'Navy'],
];
export const PATTERNS = {
  plain: 'Plain', satin: 'Satin sheen', stripes: 'Stripes', dots: 'Polka dots', confetti: 'Confetti',
  botanical: 'Botanical', kraft: 'Kraft paper', polaroid: 'Photo frames',
};
export const CARD_STYLES = { noir: 'Noir & gold', ivory: 'Ivory', party: 'Party', kraft: 'Recycled kraft', photo: 'Photo card' };
export const REVEAL_ORDERS = { 'card-first': 'Message first, then the gift', 'gift-first': 'Gift first, message last' };
export const TEMPLATES = {
  classic: 'Classic: their name, the box, then the reveal',
  surprise: 'Surprise: straight to the box, confetti at the end',
  sentimental: 'Sentimental: your message opens everything',
};

const nameOf = (list, hex) => list.find(([h]) => h === hex)?.[1];
/** "Black box, gold ribbon, satin sheen": what the preview shows, in words (for screen readers and summaries). */
export function describeLook(look) {
  const box = nameOf(BOX_COLOURS, look.box) ?? 'Custom-colour';
  const ribbon = nameOf(RIBBON_COLOURS, look.ribbon) ?? 'custom-colour';
  return `${box} box, ${ribbon.toLowerCase()} ribbon, ${PATTERNS[look.pattern].toLowerCase()} wrap`;
}

/**
 * Theme suggestions from what the shopper told us, each with its reason. Nothing is assumed: with no style,
 * occasion, interest or words to go on, there is no suggestion.
 */
export function suggestThemes({ personality, occasion, interests = [], text = '' } = {}) {
  const out = [];
  const add = (theme, why) => {
    if (!out.some((s) => s.theme === theme)) out.push({ theme, why });
  };
  const words = text.toLowerCase();
  if (personality === 'minimalist') add('minimal', 'They like a minimalist style');
  if (personality === 'expressive') add('midnight', 'They love a little luxury');
  if (personality === 'creative' || personality === 'extrovert') add('celebration', 'For their fun, outgoing side');
  if (/\b(thank|thanks|grateful|gratitude|memor|miss you|always there|support)/.test(words)) add('memories', 'Your words are about what you share');
  if (interests.includes('personalized')) add('memories', 'They love personal touches');
  if (interests.some((i) => ['home decor', 'wellness', 'plants'].includes(i))) add('nature', 'They enjoy nature and calm things');
  if (occasion === 'birthday') add('celebration', 'It’s a birthday');
  if (occasion === 'anniversary' || occasion === 'valentine') add('midnight', 'For a romantic occasion');
  return out;
}

// ── Share link ──
// The whole configuration travels in the URL fragment (#gift=…), which browsers never send to a server: nothing is
// stored by GiftGenius, and photos are never included. What a link carries is checked field by field when opened.

const HEX = /^#[0-9a-f]{6}$/i;
/** The reveals a link can ask for. A new link always names one; a link made before it could has none at all. */
export const SHARED_EXPERIENCES = ['royal', 'birthday', 'sentimental', 'minimal', 'memory', 'classic'];
const clip = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
const oneOf = (v, allowed, fallback) => (allowed.includes(v) ? v : fallback);

/** A configuration with every field present and valid; anything unknown or malformed falls back to a default. */
export function sanitizeConfig(raw = {}) {
  const theme = oneOf(raw.theme, THEME_KEYS, 'midnight');
  const t = THEMES[theme];
  const budget = Number.isInteger(raw.budget) && raw.budget > 0 && raw.budget <= 1_000_000 ? raw.budget : null;
  return {
    products: (Array.isArray(raw.products) ? raw.products : [])
      .filter((id) => Number.isInteger(id) && id > 0).slice(0, 6),
    theme,
    box: HEX.test(raw.box ?? '') ? raw.box : t.box,
    ribbon: HEX.test(raw.ribbon ?? '') ? raw.ribbon : t.ribbon,
    pattern: oneOf(raw.pattern, Object.keys(PATTERNS), t.pattern),
    card: oneOf(raw.card, Object.keys(CARD_STYLES), t.card),
    name: clip(raw.name, 40),
    message: clip(raw.message, 300),
    engraving: clip(raw.engraving, 80),
    order: oneOf(raw.order, Object.keys(REVEAL_ORDERS), 'card-first'),
    template: oneOf(raw.template, Object.keys(TEMPLATES), 'classic'),
    // Older links have no experience, and keep playing exactly as they always did. One we don't recognise opens on Royal.
    experience: raw.experience === undefined ? null : oneOf(raw.experience, SHARED_EXPERIENCES, 'royal'),
    budget,
  };
}

const toBase64Url = (text) => {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromBase64Url = (text) => {
  const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
};

/**
 * The link fragment for a configuration. view: "friends" (shows prices) or "reveal" (for them: no prices). Anyone
 * can decode a link, so a reveal link carries only what the reveal shows: never the budget or the printed name.
 */
export function shareFragment(config, view) {
  const { products, theme, box, ribbon, pattern, card, name, message, engraving, order, template, experience, budget } = config;
  const shared = { v: 1, view, products, theme, box, ribbon, pattern, card, name, message, order, template, experience: experience ?? undefined };
  return `gift=${toBase64Url(JSON.stringify(view === 'reveal' ? shared : { ...shared, engraving, budget }))}`;
}

/** The configuration and view a shared link carries, or null when the fragment isn't a (valid) share. */
export function readShare(hash) {
  const m = /^#?gift=([A-Za-z0-9_-]{1,6000})$/.exec(hash ?? '');
  if (!m) return null;
  try {
    const raw = JSON.parse(fromBase64Url(m[1]));
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    return { view: raw.view === 'reveal' ? 'reveal' : 'friends', config: sanitizeConfig(raw) };
  } catch {
    return null;
  }
}
