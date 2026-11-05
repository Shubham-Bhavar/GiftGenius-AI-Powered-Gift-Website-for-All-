import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderApp } from './renderApp.jsx';
import { db } from './setup.js';
import { compareAdvice } from '../components/studio/CompareLab.jsx';
import { revealSteps } from '../components/studio/RevealPlayer.jsx';
import { describeLook, readShare, sanitizeConfig, shareFragment, suggestThemes, themeLook } from '../components/studio/look.js';

/** What a share link's fragment carries, decoded as it was written (before any checking). */
const rawShare = (link) => JSON.parse(Buffer.from(new URL(link).hash.replace('#gift=', ''), 'base64url').toString('utf8'));
const asLink = (json) => `#gift=${Buffer.from(json, 'utf8').toString('base64url')}`;

describe('Gift Studio: looks, links and advice', () => {
  it('checks every field of a configuration and falls back to the theme for anything malformed', () => {
    expect(sanitizeConfig({
      theme: 'neon', box: 'red;background:url(x)', ribbon: '#D4AF37', pattern: 'zebra', card: 'party',
      products: [1, '2', -3, 4.5, 6, 7, 8, 9, 10, 11], name: 'x'.repeat(60), message: 'm'.repeat(400), engraving: 42,
      order: 'random', template: 'surprise', budget: 0,
    })).toEqual({
      products: [1, 6, 7, 8, 9, 10], theme: 'midnight', box: '#17181d', ribbon: '#D4AF37', pattern: 'satin', card: 'party',
      name: 'x'.repeat(40), message: 'm'.repeat(300), engraving: '', order: 'card-first', template: 'surprise', experience: null, budget: null,
    });
    expect(describeLook(themeLook('midnight'))).toBe('Black box, gold ribbon, satin sheen wrap');
    expect(describeLook({ box: '#123456', ribbon: '#654321', pattern: 'dots' })).toBe('Custom-colour box, custom-colour ribbon, polka dots wrap');
  });

  it('a friends link round-trips the whole gift; a surprise link leaves out the budget and the printed name', () => {
    const config = sanitizeConfig({ ...themeLook('memories'), products: [4, 6], name: 'Aditi', message: 'शुभेच्छा, Aditi! 🎂', engraving: 'A.R.', budget: 2000 });
    expect(readShare(`#${shareFragment(config, 'friends')}`)).toEqual({ view: 'friends', config });
    const surprise = readShare(`#${shareFragment(config, 'reveal')}`);
    expect(surprise).toEqual({ view: 'reveal', config: { ...config, engraving: '', budget: null } });
  });

  it('ignores fragments that are not shares, and neutralises tampered ones', () => {
    expect(readShare('')).toBeNull();
    expect(readShare('#reviews')).toBeNull();
    expect(readShare('#gift=%%%')).toBeNull();
    expect(readShare(asLink('not json'))).toBeNull();
    expect(readShare(asLink('[1,2]'))).toBeNull();
    expect(readShare(`#gift=${'A'.repeat(6001)}`)).toBeNull();
    const hostile = readShare(asLink(JSON.stringify({
      view: 'admin', products: [1, 'DROP TABLE'], box: 'url(javascript:alert(1))', name: '<img src=x onerror=alert(1)>',
      photos: ['blob:http://localhost/1'], budget: 1e9,
    })));
    expect(hostile.view).toBe('friends');
    expect(hostile.config).toMatchObject({ products: [1], box: '#17181d', budget: null, name: '<img src=x onerror=alert(1)>' });
    expect(hostile.config).not.toHaveProperty('photos');
  });

  it('suggests themes only from what the shopper told us, each with its reason', () => {
    expect(suggestThemes({})).toEqual([]);
    expect(suggestThemes({ personality: 'minimalist', occasion: 'birthday' })).toEqual([
      { theme: 'minimal', why: 'They like a minimalist style' },
      { theme: 'celebration', why: 'It’s a birthday' },
    ]);
    expect(suggestThemes({ text: 'I want to thank my sister for always supporting me' })).toEqual([
      { theme: 'memories', why: 'Your words are about what you share' },
    ]);
  });

  it('orders the reveal by template, with the card and the gift in the order chosen', () => {
    expect(revealSteps('classic', 'card-first')).toEqual(['intro', 'box', 'untie', 'open', 'card', 'gift', 'finale']);
    expect(revealSteps('classic', 'gift-first')).toEqual(['intro', 'box', 'untie', 'open', 'gift', 'card', 'finale']);
    expect(revealSteps('surprise', 'card-first')).toEqual(['box', 'untie', 'open', 'card', 'gift', 'finale']);
    // A sentimental reveal always opens with the message.
    expect(revealSteps('sentimental', 'gift-first')).toEqual(['intro', 'card', 'box', 'untie', 'open', 'gift', 'finale']);
  });

  it('compares two options against the budget, their style and the photos, never claiming how they will feel', () => {
    const option = (theme, card, total) => ({ config: { ...themeLook(theme), card }, total });
    expect(compareAdvice(option('midnight', 'noir', 1199), option('nature', 'kraft', 499), { budget: 1000 }))
      .toEqual(['Option B fits your ₹1,000 budget; option A is ₹199 over.']);
    expect(compareAdvice(option('midnight', 'noir', 499), option('minimal', 'photo', 499), {
      budget: 1000, suggestions: [{ theme: 'minimal', why: 'They like a minimalist style' }], photos: ['blob:1'],
    })).toEqual([
      'Option B uses Minimal Elegance: they like a minimalist style.',
      'Option B carries your photos on the card, which makes it more personal.',
    ]);
    expect(compareAdvice(option('midnight', 'noir', 499), option('nature', 'kraft', 499), {}))
      .toEqual(['Both fit what you told us equally well, so choose the one that feels more like them.']);
  });
});

describe('Gift Studio page', () => {
  const restore = [];
  afterEach(() => restore.splice(0).forEach((undo) => undo()));

  it('plays the reveal for them step by step, in the theme suggested from their answers, with no prices', async () => {
    const { user } = renderApp('/studio?product=4&style=minimalist&occasion=birthday&budget=1500');
    expect(await screen.findByText('They like a minimalist style')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Minimal Elegance/, pressed: true })).toBeInTheDocument();
    await user.type(screen.getByLabelText('Their name'), 'Aditi');
    await user.type(screen.getByLabelText('Card message'), 'Wishing you the best year yet.');

    const panel = screen.getByRole('tabpanel', { name: 'Their view' });
    await user.click(await within(panel).findByRole('button', { name: 'Use This Experience: Classic reveal' }));
    expect(await within(panel).findByText('Step 1 of 7')).toBeInTheDocument();
    expect(within(panel).getByText('Aditi')).toBeInTheDocument();
    const next = async (label, step) => {
      await user.click(within(panel).getByRole('button', { name: label }));
      expect(within(panel).getByText(`Step ${step} of 7`)).toBeInTheDocument();
    };
    await next('Open your gift', 2);
    expect(within(panel).getByRole('group', { name: 'A wrapped gift box. Still a surprise.' })).toBeInTheDocument();
    await next('Pull the ribbon', 3);
    await next('Lift the lid', 4);
    await next('Read the card', 5);
    const card = within(panel).getByRole('figure', { name: 'Gift card preview' });
    expect(card).toHaveTextContent('For Aditi');
    expect(card).toHaveTextContent('Wishing you the best year yet.');
    expect(within(panel).getByText('The card says: Wishing you the best year yet.')).toBeInTheDocument(); // announced
    await next('See the gift', 6);
    expect(within(panel).getByText('Inside: Signature Perfume.')).toBeInTheDocument();
    await next('Finish', 7);
    expect(within(panel).getAllByText('Happy birthday, Aditi!').length).toBeGreaterThan(0);
    expect(panel.textContent).not.toMatch(/₹/);
    await next('↺ Watch again', 1);
  });

  it('dresses the box: a theme, a colour and a wrap each change the preview; a gift-first reveal shows the gift first', async () => {
    const { user } = renderApp('/studio?product=4');
    expect(await screen.findByRole('button', { name: /^Midnight Luxury/, pressed: true })).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Your view' }));
    expect(screen.getByRole('group', { name: 'Black box, gold ribbon, satin sheen wrap' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Nature Inspired/ }));
    expect(screen.getByRole('group', { name: 'Kraft box, leaf ribbon, botanical wrap' })).toBeInTheDocument();
    await user.click(within(screen.getByRole('group', { name: 'Box colour' })).getByRole('radio', { name: 'Teal' }));
    await user.selectOptions(screen.getByLabelText('Wrap'), 'dots');
    expect(screen.getByRole('group', { name: 'Teal box, leaf ribbon, polka dots wrap' })).toBeInTheDocument();
    expect(screen.getByText('Nature Inspired: Teal box, leaf ribbon, polka dots wrap')).toBeInTheDocument();
    expect(screen.getByText(/The colours, wrap and reveal are a preview only/)).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'Gift first, message last' }));
    await user.click(screen.getByRole('tab', { name: 'Their view' }));
    await user.click(screen.getByRole('button', { name: 'Use This Experience: Classic reveal' }));
    for (const label of ['Open your gift', 'Pull the ribbon', 'Lift the lid']) await user.click(screen.getByRole('button', { name: label }));
    expect(screen.getByRole('button', { name: 'See the gift' })).toBeInTheDocument();
    // A sentimental reveal always opens with the message, so the order no longer applies.
    await user.selectOptions(screen.getByLabelText('Style'), 'sentimental');
    expect(screen.getByRole('radio', { name: 'Gift first, message last' })).toBeDisabled();
  });

  it('your view: totals against the budget, and Add to cart carries the card message and the printed name only', async () => {
    db.products[2].tags = ['personalized']; // the perfume takes a printed name in this test
    const { user } = renderApp('/studio?product=4&budget=1000');
    await user.click(await screen.findByRole('tab', { name: 'Your view' }));
    expect(await screen.findByText('₹199 over your ₹1,000 budget')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Name to print or engrave on the Signature Perfume'), 'A.R.');
    await user.type(screen.getByLabelText('Card message'), 'For the best sister');
    await user.click(screen.getByRole('button', { name: '🛒 Add to cart' }));

    await waitFor(() => expect(screen.getByTestId('cart-count')).toHaveTextContent('1'));
    const [line] = JSON.parse(localStorage.getItem('gg-cart'));
    expect(line).toMatchObject({ productId: 4, quantity: 1, customName: 'A.R.', customMessage: 'For the best sister' });
    // Packaging stays a preview: none of it reaches the order.
    for (const key of ['theme', 'box', 'ribbon', 'pattern', 'card', 'template']) expect(line).not.toHaveProperty(key);
  });

  it('compare: one gift in every theme, and option A against option B on what they told us', async () => {
    const { user } = renderApp('/studio?product=4&style=minimalist&budget=1500');
    await user.click(await screen.findByRole('tab', { name: 'Compare' }));
    const gallery = screen.getByRole('heading', { name: 'One gift, every theme' }).closest('section');
    expect(within(gallery).getAllByRole('listitem')).toHaveLength(5);
    expect(within(gallery).getByRole('button', { name: '✓ In use' })).toHaveAttribute('aria-pressed', 'true');
    const advice = () => screen.getByText('What fits better').closest('[role="status"]');
    expect(advice()).toHaveTextContent('Option A uses Minimal Elegance: they like a minimalist style.');
    expect(advice()).toHaveTextContent('It can’t predict how they’ll feel.');

    await user.selectOptions(screen.getByLabelText('Option B gift'), '1');
    // One table, option A and option B in their own columns.
    const table = screen.getByRole('table');
    const [giftA, giftB] = within(within(table).getByRole('row', { name: /Gifts/ })).getAllByRole('cell');
    expect(giftA).toHaveTextContent('Signature Perfume');
    expect(giftB).toHaveTextContent('Luxury Hamper Box');
    expect(within(table).getByRole('row', { name: /Total/ })).toHaveTextContent(/₹1,199.*₹499/);
    await user.click(screen.getByRole('button', { name: 'Use option B' }));

    await user.click(screen.getByRole('tab', { name: 'Your view' }));
    expect(await screen.findByRole('link', { name: 'Luxury Hamper Box' })).toBeInTheDocument();
    expect(screen.getByText('Midnight Luxury: Black box, gold ribbon, satin sheen wrap')).toBeInTheDocument();
  });

  it('gift box: suggestions within the budget, then a box built by hand with buttons and drag and drop, checked as it changes', async () => {
    const { user } = renderApp('/studio?occasion=birthday&budget=1500&style=minimalist');
    await user.click(await screen.findByRole('button', { name: 'build a box of several gifts' }));
    expect(screen.getByLabelText('Budget (₹)')).toHaveValue(1500);
    await user.click(screen.getByRole('button', { name: '✨ Suggest boxes' }));
    expect(await screen.findByRole('heading', { name: 'Box 1 · ₹1,397' })).toBeInTheDocument();
    expect(db.lastBoxSuggestion).toEqual({ budget: 1500, size: 3, occasion: 'birthday', interests: [], personality: 'minimalist' });
    const suggested = screen.getByRole('list', { name: 'How well these go together' });
    expect(within(suggested).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      '⚠Worth a look: 2 of 3 are made for birthdays; the Classic Rose Bouquet isn’t',
      '✓Good: ₹1,397 of your ₹1,500 budget (₹103 to spare)',
      '?Not checked: Packaging fit isn’t checked yet: the catalogue doesn’t record product sizes',
    ]);

    await user.click(screen.getByRole('button', { name: 'Edit this box' }));
    const zone = screen.getByRole('group', { name: 'Your box: 3 of 6 gifts' });
    expect(within(zone).getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByText('₹103 left of ₹1,500')).toBeInTheDocument();
    expect(await screen.findByText('₹1397 in all')).toBeInTheDocument(); // the server's check, after a short pause
    expect(db.lastBoxCheck).toEqual({ productIds: [1, 3, 6], budget: 1500, occasion: 'birthday' });

    await user.click(screen.getByRole('button', { name: 'Remove Classic Rose Bouquet' }));
    expect(screen.getByText('₹702 left of ₹1,500')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Move Artisan Chocolate Box earlier' }));
    await user.click(screen.getByRole('button', { name: 'Add Signature Perfume to the box' }));
    expect(screen.getByText('₹497 over ₹1,500')).toBeInTheDocument();
    expect(await screen.findByText('₹1997: ₹497 over your ₹1500 budget')).toBeInTheDocument();
    // Drag a gift in from the shelf (names are shown as text, never as markup).
    fireEvent.drop(screen.getByRole('group', { name: 'Your box: 3 of 6 gifts' }), { dataTransfer: { getData: () => 'add:9' } });
    expect(within(screen.getByRole('group', { name: 'Your box: 4 of 6 gifts' })).getByText('<img src=x onerror=alert(1)> Mug')).toBeInTheDocument();
    await waitFor(() => expect(db.lastBoxCheck.productIds).toEqual([6, 1, 4, 9]));

    // The box being built, at the top of the tab (each suggestion has its own Preview button too).
    await user.click(within(screen.getByRole('region', { name: 'Your box' })).getByRole('button', { name: 'Preview this box →' }));
    expect(screen.getByRole('tab', { name: 'Their view', selected: true })).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Use This Experience: Classic reveal' }));
    for (const label of ['Open your gift', 'Pull the ribbon', 'Lift the lid', 'Read the card', 'See the gift']) {
      await user.click(await screen.findByRole('button', { name: label }));
    }
    expect(screen.getByText('Artisan Chocolate Box · Luxury Hamper Box · Signature Perfume · <img src=x onerror=alert(1)> Mug')).toBeInTheDocument();
  });

  it('gift box: the box being built wears the look chosen in the studio, and follows it', async () => {
    const { user } = renderApp('/studio?product=4');
    await user.click(await screen.findByRole('button', { name: /^Nature Inspired/ }));
    await user.click(screen.getByRole('tab', { name: 'Gift box' }));
    const yours = screen.getByRole('region', { name: 'Your box' });
    expect(within(yours).getByRole('group', { name: 'Kraft box, leaf ribbon, botanical wrap' })).toBeInTheDocument();
    await user.click(within(screen.getByRole('group', { name: 'Box colour' })).getByRole('radio', { name: 'Teal' }));
    expect(within(yours).getByRole('group', { name: 'Teal box, leaf ribbon, botanical wrap' })).toBeInTheDocument();
  });

  it('share: friends get the gift with its prices; a surprise link plays only the reveal, and "make your own" starts afresh', async () => {
    const { user, unmount } = renderApp('/studio?product=4&budget=1500');
    await user.type(await screen.findByLabelText('Their name'), 'Aditi');
    await user.click(await screen.findByRole('button', { name: 'Use This Experience: Classic reveal' }));
    await user.click(screen.getByRole('button', { name: '🔗 Share with friends' }));
    expect(rawShare(screen.getByLabelText('Share link').value)).toMatchObject({ view: 'friends', name: 'Aditi', budget: 1500, experience: 'classic' });
    await user.click(screen.getByRole('button', { name: '🎁 Send as a surprise preview' }));
    const link = screen.getByLabelText('Share link').value;
    expect(link).toMatch(/^http:\/\/localhost(:\d+)?\/studio#gift=[\w-]+$/);
    expect(rawShare(link)).toMatchObject({ view: 'reveal', name: 'Aditi', products: [4] });
    expect(rawShare(link)).not.toHaveProperty('budget');
    unmount();

    const them = renderApp(`/studio${new URL(link).hash}`);
    expect(await screen.findByRole('heading', { level: 1, name: 'A gift preview, just for you' })).toBeInTheDocument();
    expect(await screen.findByText('Step 1 of 7')).toBeInTheDocument();
    expect(screen.getByText('Aditi')).toBeInTheDocument();
    expect(screen.queryByRole('tablist', { name: 'Studio views' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Customise the gift' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add to cart/ })).not.toBeInTheDocument();
    expect(screen.getByRole('main').textContent).not.toMatch(/₹/);
    await them.user.click(screen.getByRole('link', { name: 'Make a gift preview of your own →' }));
    expect(await screen.findByRole('heading', { name: 'Choose a gift to dress up' })).toBeInTheDocument();
  });

  it('a friend’s link opens read-only until you make your own copy', async () => {
    const config = sanitizeConfig({ ...themeLook('nature'), products: [4], name: 'Aditi', budget: 1500 });
    const { user } = renderApp(`/studio#${shareFragment(config, 'friends')}`);
    expect(await screen.findByText('👋 A friend shared this gift with you.')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Customise the gift' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Edit your own copy' }));
    expect(screen.getByRole('region', { name: 'Customise the gift' })).toBeInTheDocument();
    expect(screen.getByLabelText('Their name')).toHaveValue('Aditi');
    expect(screen.getByRole('button', { name: /^Nature Inspired/, pressed: true })).toBeInTheDocument();
  });

  it('photos stay on this device: shown on the box and card, never in a link, released when removed or the studio closes', async () => {
    const created = [];
    const revoked = [];
    const original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };
    URL.createObjectURL = vi.fn(() => {
      created.push(`blob:http://localhost/photo-${created.length + 1}`);
      return created.at(-1);
    });
    URL.revokeObjectURL = vi.fn((url) => revoked.push(url));
    restore.push(() => Object.assign(URL, { createObjectURL: original.create, revokeObjectURL: original.revoke }));

    const { user, unmount } = renderApp('/studio?product=4');
    await user.click(await screen.findByRole('button', { name: /^Personal Memories/ }));
    await user.upload(screen.getByLabelText(/Your photos/), [
      new File(['a'], 'a.png', { type: 'image/png' }), new File(['b'], 'b.png', { type: 'image/png' }),
    ]);
    const list = screen.getByRole('list', { name: 'Your photos' });
    expect(within(list).getAllByRole('img').map((img) => img.getAttribute('alt'))).toEqual(['Photo 1', 'Photo 2']);
    await user.click(screen.getByRole('tab', { name: 'Your view' }));
    expect(screen.getByRole('figure', { name: 'Gift card preview' }).querySelectorAll('img')).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: '🔗 Share with friends' }));
    const link = screen.getByLabelText('Share link').value;
    expect(link).not.toContain('blob');
    expect(JSON.stringify(rawShare(link))).not.toContain('photo-');
    expect(screen.getByText(/never your photos/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Remove photo 1' }));
    expect(revoked).toEqual([created[0]]);
    expect(within(list).getAllByRole('img')).toHaveLength(1);
    unmount();
    expect(revoked).toEqual([created[0], created[1]]);
  });

  it('starts from what you want to say: reads only what was written, then opens the pick in the suggested look', async () => {
    const { user } = renderApp('/studio');
    expect(await screen.findByRole('button', { name: 'Dress up Luxury Hamper Box' })).toBeInTheDocument();
    await user.type(screen.getByLabelText('What do you want the gift to say?'), 'I want to thank my sister for always supporting me');
    await user.click(screen.getByRole('button', { name: '💌 Find gifts for this' }));
    expect(await screen.findByText('We read: For: sibling. Nothing else is assumed about them.')).toBeInTheDocument();
    expect(screen.getByText(/Suggested look:/)).toHaveTextContent('Suggested look: Personal Memories. Your words are about what you share.');
    expect(db.lastGiftRequest).toEqual({ text: 'I want to thank my sister for always supporting me', limit: 3 });
    expect(screen.getAllByText('100% match')).toHaveLength(2);

    await user.click(screen.getAllByRole('button', { name: 'Preview as a gift →' })[0]);
    expect(await screen.findByRole('tab', { name: 'Their view', selected: true })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Personal Memories/, pressed: true })).toBeInTheDocument();
    expect(screen.getByLabelText('Card message')).toHaveValue('Thank you for always being there.');
    await user.click(screen.getByRole('tab', { name: 'Your view' }));
    expect(await screen.findByRole('link', { name: 'Luxury Hamper Box' })).toBeInTheDocument();
  });

  it('is reachable from a product page', async () => {
    renderApp('/product/4');
    expect(await screen.findByRole('link', { name: '🎁 Preview it as a gift' })).toHaveAttribute('href', '/studio?product=4');
  });
});
