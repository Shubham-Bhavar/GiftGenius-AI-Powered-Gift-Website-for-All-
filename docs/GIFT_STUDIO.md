# Gift Studio: see the gift before you give it

Built 2026-10-30 on the local branch `feat/gift-decision-assistant`, on top of the gift decision assistant ([GIFT_DECISION_ASSISTANT.md](GIFT_DECISION_ASSISTANT.md)). Nothing is committed yet.

Input: the founder's twelve Gift Studio ideas (Marathi/English brief), including its own honesty rules:
- the unboxing is a digital simulation, with no promise about delivery or packaging;
- customisation is a preview first;
- nothing is assumed about the recipient;
- there are no claims about how the recipient will react;
- photos are handled safely and can be deleted;
- sharing needs access control.

Open it at `/studio`, or from:
- a product page ("🎁 Preview it as a gift");
- a quiz pick ("🎁 Preview as a gift");
- the budget plan ("🎁 Preview them together in one gift box").

## What shipped

| Idea | Status | What the shopper sees |
|---|---|---|
| 1. Gift reality preview | Built in 3D in the browser; **AR not built** | A wrapped box in CSS 3D (no WebGL, no library) with wrap, ribbon, bow and tissue. Shoppers turn it by dragging or with the arrow keys; opened, the gifts sit in the tissue |
| 2. Unboxing simulator | Built | *Their view*: pull the ribbon, lift the lid, read the card, see the gift. Step by step (the button, or a click on the box) or "▶ Play it for me". "A digital preview… Real wrapping and packaging may differ" |
| 3. Personalisation studio | Built; preview only, except two fields | Box colour (8), ribbon (8), wrap (8 patterns), card style (5), their name, card message, and a printed name **only on gifts the catalogue marks as personalisable**. A live preview throughout |
| 4. Recipient's point of view | Built | *Their view* (no prices anywhere) and *Your view* (gifts, prices, budget fit, what goes to the order, Add to cart) |
| 5. Gift box of several gifts | Built | Boxes suggested by the recommendation engine, never over the budget and one gift of each kind. A box built by hand: drag in from the shelf, or use Add / ← / ✕ / →, with a live total and checks. "Preview this box" and Add all to cart |
| 6. Theme transformation | Built | 5 themes, each a whole presentation (box, wrap, ribbon, tissue, card): Midnight Luxury, Minimal Elegance, Birthday Celebration, Nature Inspired, Personal Memories. *One gift, every theme* shows all five side by side |
| 7. Message to gift | Built | *Start from what you want to say*: shows only what was read ("We read: For: sibling. Nothing else is assumed about them."), catalogue picks, and a suggested look with its reason |
| 8. A/B preview lab | Built | Option A (now) against option B (another theme, optionally another gift): gifts, total, budget, packaging, card. The advice uses their answers only, and says "It can't predict how they'll feel" |
| 9. Reveal timeline | Built | Templates: Classic, Surprise (confetti at the end) and Sentimental (the message opens everything). Card-first or gift-first |
| 10. Compatibility checker | Built (explicit rules) | Per dimension: occasion, price, balance, style, variety, recipient and packaging. Each is ✓, ⚠, ✕, ℹ or "not checked", never an overall score. Packaging always says "not checked": the catalogue has no product sizes |
| 11. Memory photos | Built; on this device only | Up to 6 photos on the box's sides (photo wrap) and on the photo card. Never uploaded or put in a link; released when removed and when the studio closes |
| 12. Shareable gift | Built as a link, with no server storage; **voting and access control not built** | "🔗 Share with friends" (the gift with its prices) and "🎁 Send as a surprise preview" (the reveal only) |

## How it works

```
quiz answers / product page ─▶ /studio?product(s)=…&style&occasion&recipient&budget&interests
                                  │   (answers only: never the name or the notes)
                                  ▼
       theme suggestions (rules over the answers) ─▶ configuration: products, theme, box, ribbon, wrap,
                                                     card, name, message, printed name, reveal order, template
                                  │
   ┌──────────────┬───────────────┼────────────────┬───────────────────────┐
 Their view     Your view       Compare          Gift box                Share
 (reveal,       (prices,        (5 themes,       POST /api/gift-box/     #gift=… link
  no prices)     cart)           A vs B)          suggestions · check    (nothing stored)
```

- **Frontend** (`frontend/src/components/studio/`, `pages/studio/GiftStudio.jsx`, `styles/studio/gift-studio.css`):
  - `look.js`: themes, colours, patterns, card styles, theme suggestions and the share link;
  - `GiftBox3D`: the CSS 3D box;
  - `RevealPlayer`, `MessageCard`, `StudioControls`, `BuyerSummary`, `CompareLab`, `BoxComposer`, `MessageToGift`, `MemoryPhotos`.
- **Backend** (`backend/src/main/java/com/giftgenius/giftbox/`):
  - `GiftBoxService` suggests boxes:
    1. candidates strictly within the budget, minus the avoid list, scored by the existing engine;
    2. the top 14;
    3. every combination of different kinds whose total is within the budget;
    4. each ranked by score plus how well it uses the budget;
    5. up to 3 boxes that share at most one gift;
    6. each gift explained by the existing explanation service.
  - `BoxCompatibility` holds the per-dimension rules.
  - `GiftBoxController` serves the two endpoints.
- **What goes to an order:** only the card message (on the first gift) and the printed name (on personalisable gifts). The product page already sends these same two fields. Theme, colours, wrap, card style and the reveal stay a preview, and the studio says so next to the controls and the cart button.
- **Theme suggestions** are rules over what the shopper told us, each with its reason ("They like a minimalist style", "It's a birthday", "Your words are about what you share"). With nothing to go on there is no suggestion, and the studio opens in Midnight Luxury.

### Share links

- **No server storage.** The configuration travels in the URL fragment (`#gift=`, base64url JSON). Browsers don't send fragments to servers, and GiftGenius stores nothing.
- **Checked on opening.** Each field is validated when a link opens: known themes, patterns, cards and templates only; colours must be `#rrggbb`; names, messages and printed names are clipped; up to 6 positive product ids; budget 1–1,000,000. Anything else falls back to a default, unknown fields are dropped, and names are shown as text. A product that no longer exists shows a notice.
- **Two views.**
  - A friends link carries the gift, the look, the names, the message, the printed name and the budget. It opens read-only, with "Edit your own copy".
  - A surprise link carries only what the reveal shows: never the budget or the printed name. It opens as the reveal alone, with no prices, controls or cart.
- **Not secret.** Anyone who has a link can read what's in it, because it is encoded, not encrypted. The share box says so.

### Photos

- Kept as object URLs in the browser tab only.
- Never uploaded, never put in a share link or in the order.
- Released (`URL.revokeObjectURL`) when one is removed, with "Remove all photos", and when the studio closes.
- There is nothing to delete on a server, because nothing reaches one.

### Accessibility and motion

- **The 3D box** is described in words ("Teal box, leaf ribbon, polka dots wrap"). It can be focused and turned with the arrow keys, and the hint is announced.
- **The reveal** announces each step ("The card says: …") and works entirely from buttons.
- **Drag and drop** has a button for every action.
- **Reduced motion:** with the system setting on, transitions are near-instant and there is no confetti.
- **High contrast:** in Windows high-contrast mode the box keeps its colours (it's a picture of the choices).
- **Pages checked:** axe-core finds no violations on any view; colour contrast was checked in a real browser in both themes (see Verification).

## API (new, public, validated; no database change)

| Endpoint | Request | Response |
|---|---|---|
| `POST /api/gift-box/suggestions` | `budget` (1–1,000,000), `size` (2–4, default 3), optional `recipient`, `occasion`, `interests`, `personality`, `avoid` (same validation as the quiz) | `{budget, boxes:[{items:[{product, reason}], total, checks:[{dimension, status, text}]}], note}`; `note` explains an empty result |
| `POST /api/gift-box/check` | `productIds` (1–6), optional `budget`, `occasion`, `recipient` | `{total, budget, checks, missing}` |

`POST /api/ai/gift-request` (already there) is now used by *Start from what you want to say*.

The gift-box endpoints aren't rate-limited, like the catalogue reads. Both work on the cached catalogue with bounded input (at most 6 ids; boxes of at most 4 from a pool of 14) and write nothing. They are deliberately kept out of the public bucket: it is shared with session refresh, so the composer's live checks could otherwise starve a sign-in refresh.

## Verification

Commands and counts are in [TEST_RESULTS.md](TEST_RESULTS.md) (*Gift Studio* section).

- **Backend unit tests:** 9 new (281 → 290). The box rules and their wording; suggestions that never exceed the budget, never repeat a kind and respect the avoid list; the explanation of each gift.
- **Integration tests:** 3 new, over HTTP and MySQL (114 → 117).
- **Frontend tests:** 17 new (142 → 159), plus two quiz journeys extended:
  - the share-link format and its tampering cases;
  - theme suggestions, reveal orders and the A/B advice;
  - journeys: the reveal step by step with no prices; dressing the box; what Add to cart sends; compare; suggesting and hand-building a box (buttons and drag and drop); both share links; a friend's link; photos never leaving the device; message to gift; the product-page entry;
  - axe-core on every studio view, the start screen and a surprise link.
- **Mutation checks.** Each of the two share-link fixes below was undone on purpose, and its test failed.
- **In a real browser against the local backend** (jar on 8091, `giftgenius_dev`, Vite on 5174):
  - every view in light and dark theme, and at 375 px;
  - the box suggestions from the real engine;
  - both share links, opened as the recipient and as a friend;
  - message to gift in rules mode (no Gemini key).

### Found and fixed during verification

1. **The reveal was invisible.** Its root class `.reveal` is also the site's scroll-reveal utility (`opacity: 0` until scrolled into view). jsdom tests can't see CSS, so only the browser showed it. The player's classes are now `unbox-*`.
2. **A surprise link carried the shopper's budget.** The reveal never shows it, but anyone can decode a link. Surprise links now carry only what the reveal shows, and a test guards it.
3. **A new studio link didn't load.** Opening a share link (even pasted into the address bar, which changes only the hash) or "Make a gift preview of your own" while the studio was open kept the previous gift. The studio now restarts for a new URL, and a test guards it.
4. **Quiz links dropped an interest.** Links from the quiz kept only the first half of a two-interest choice ("Flowers & Fragrance" became just flowers), so box suggestions lost an interest. Fixed and asserted.
5. **Dark-theme contrast.** The "write the message with AI" link measured 4.06:1 on the studio's raised panel. It now uses the light gold ([BUG_REGISTER.md](BUG_REGISTER.md) GG-20).
6. **Landmark.** The controls were an `<aside>` inside `<main>` (axe: complementary landmarks belong at the top level). They are now a labelled section.
7. **Phone tabs.** At 375 px the fourth tab ran past the tab bar; the tabs are tighter on small screens.

## Limits to know

- **A preview, not a promise.** The packaging choices aren't sold or fulfilled yet, so they don't reach the order; the studio says so. Packaging fit is "not checked" because the catalogue has no product sizes.
- **Not photo-real and not AR.** The box is drawn with CSS. The gifts are their catalogue photos standing in the tissue.
- **Share links can't be revoked and don't expire.** Whoever has a link sees its names and message.
- **Small catalogue.** With the 20-product seed, box suggestions have few combinations to choose from. Totals tend to sit just under the budget, because using the budget well is part of the ranking: for ₹1,500, all three local boxes came to ₹1,497.
- **"100% match" can look strong.** With message to gift, the match counts only what the words said. "Thank my sister" checks only the recipient, so every sibling-friendly pick shows 100%.
- **English only** for the studio's copy.

## Next phases: decisions needed

1. **AR preview.** AR (WebXR, Scene Viewer, Quick Look) needs 3D models of the real products and of the packaging. Decide whether to commission models, for which products, and the target devices.
2. **Server-stored shares with access control, expiry and voting.** Decide:
   - what is stored: the configuration and product ids, never photos;
   - who may open a share: a link with a secret token, or signed-in invitees;
   - expiry and revocation;
   - a privacy notice for the names and messages stored (DPDP Act, 2023);
   - whether friends' votes are anonymous.
   Needs a migration, endpoints and moderation of the messages.
3. **Real packaging.** To make wrap, box and ribbon purchasable, each option needs:
   - a product or add-on entry with a price;
   - stock and fulfilment by the seller or GiftGenius;
   - a decision on which sellers support it.
   Until then they stay a preview.
4. **Product dimensions** (and weight) in the catalogue, so the packaging-fit check can be real.
5. **Printed photo cards.** Printing photos means uploading them, which needs consent wording, storage, a retention period and deletion. They stay on the device today.
