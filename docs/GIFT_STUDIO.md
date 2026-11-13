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
| 4. Recipient's point of view | Built | *Their view* (no prices anywhere) and *Your view* (the box in the 3D studio, the card as they'll read it, then gifts, prices, budget fit, what goes to the order, Add to cart) |
| 5. Gift box of several gifts | Built | The box being built, in the 3D studio and in the studio's look. Boxes suggested by the recommendation engine, never over the budget and one gift of each kind. A box built by hand: drag in from the shelf, or use Add / ← / ✕ / →, with a live total and checks. "Preview this box" and Add all to cart |
| 6. Theme transformation | Built | 5 themes, each a whole presentation (box, wrap, ribbon, tissue, card): Midnight Luxury, Minimal Elegance, Birthday Celebration, Nature Inspired, Personal Memories. *One gift, every theme* shows all five side by side |
| 7. Message to gift | Built | *Start from what you want to say*: shows only what was read ("We read: For: sibling. Nothing else is assumed about them."), catalogue picks, and a suggested look with its reason |
| 8. A/B preview lab | Built | Option A (now) against option B (another theme, optionally another gift) in the 3D studio, opening together, and in one table: gifts, total, budget, packaging, card. The advice uses their answers only, and says "It can't predict how they'll feel" |
| 9. Reveal timeline | Built, then replaced | The classic reveal and its templates (Classic, Surprise, Sentimental; card-first or gift-first) were retired on 2026-11-11 (roadmap Phase 1: no Classic reveal). Each of the five experiences has its own sequence |
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

## The 3D studio (Three.js)

*Their view* opens on the Royal experience, in a shared Three.js studio. All five experiences use one box geometry, one camera, one lighting rig and one set of material types; a look (`components/studio/scene/looks.js`) only changes their values, plus its ribbon, timing and effect.

- **Code:** `components/studio/scene/`. `choreography.js` gives every moment of a reveal as plain numbers, with no Three.js or clock. `studioScene.js` draws them. `StudioStage3D.jsx` connects the scene to the existing state machine (`useGiftAnimation`) and controls (`RevealControls`).
- **The reveal:** the ribbon is pulled through its knot and the bands peel off; the lid opens with its own curve for each look; tissue folds back along a travelling crease; the product photo rises on its easel; and the card sits in the lid (Sentimental brings it to the camera over a dimmed set, and Birthday's springs open).
- **Effects:** one fixed burst per look, computed as an exact function of time, never random: confetti (Birthday), petals (Sentimental), fine dust (Royal, Memory), nothing (Minimal). None on a skip or with reduced motion.
- **Who gets it:** decided before any 3D code is downloaded (`quality.js`). No WebGL, software rendering, data saving or a slow CPU get the CSS player instead, as does a device that proves too slow once measured, or that loses its GPU. Other devices get one of four quality levels, measured on the device itself.
- **Download:** the scene is a separate chunk, loaded only on *Their view* and on a surprise link that names a 3D experience.
- **While it gets ready:** a still of the same box shows at once, with the reveal controls disabled and a message saying so. *Play when ready* can be pressed, and undone, during that time. After 30 seconds the CSS player takes over, carrying that request with it; a scene that turns up later is freed, even one that finished inside one long task before the timer could run.
- **Several gifts:** every gift in the box appears, up to the six a box or link can hold, rising in turn. Up to four share a row; five and six use two rows, the back one on a velvet step. All are named and counted below the stage.
- **Catalogue photos:** a photo is requested over https first, since a redirect from http is what blocks WebGL on some hosts that otherwise allow it. If a host refuses WebGL outright, the same real image is laid over the print's window as an ordinary `<img>`, in true perspective (`photoOverlay.js`). It fades when turned away or when the box's wall would be in front of it, since a flat image can't pass behind anything. A photo that can't load at all gets no substitute: the print is left out and its name is shown below the stage.
- **Honesty:** a product is shown as a flat photograph in a mat, never as a pretend 3D model. Only the shopper's words and photos appear; "Happy birthday" remains the only wording an experience adds. If a photo's host won't allow WebGL to draw it or is too slow, the print is left out and the photo is shown as a normal image below the stage.
- **Share links:** a link names the chosen experience, and plays it for the person who opens it. Links made before the classic reveal was retired still open: one with no experience, or naming `classic`, plays the experience closest to the classic style it chose (Surprise → Birthday, Sentimental → Sentimental, Classic → Royal; `look.js` `experienceFor`). An experience we don't recognise opens on Royal. A preview isn't shared, only the choice. Photos never travel in a link, so a Memory link goes without them, and the shopper is told. New links no longer carry the classic reveal's `template` and `order` fields.
- **Reviewing:** in development or a build with `VITE_STUDIO_REVIEW=1`, `?motion=on` overrules a system set to reduced motion, `?quality=high|medium|reduced|low` pins a level and `?webgl=off` shows the CSS player. A normal production build ignores all three.

## Compare in the 3D studio

*Compare* shows option A (the box as it is now) and option B (another theme and, if chosen, another gift) in the same Three.js studio as *Their view*: the same box, bow, camera, lights and floor.

- **One box, two halves:** the stage is split, side by side, or one above the other on a phone. Each half is the studio seen through the same camera with that option's box in it, so the only differences on screen are the shopper's choices. Both turn together (drag, arrow keys, *Turn slowly*, *Front view*) and open together (*Closed* / *Open*: the ribbon comes off, the lid opens, the gifts rise and the card rests in the lid).
- **What's shown:** each option's own box colour, ribbon colour, wrap and card style, from its configuration (`scene/compareLooks.js`). Satin and plain are the box's finish; the six printed wraps (stripes, dots, confetti, botanical, kraft, photo frames) are generated as seamless tiles at runtime, with no downloaded images. The photo-frame wrap holds the shopper's own photos when they've added some. The card is the shopper's own words on that option's card style (`CARD_PAPERS`). Ribbons are dyed a little deeper than the swatch, because satin catches more light than a flat colour; nothing else is adjusted.
- **The theme tiles:** *One gift, every theme* uses the studio selector's tiles. Each picture is drawn by the same scene, closed and at the resting angle, then copied within one frame so nothing flashes on screen. Each tile can show its theme as option B, or use it straight away (as before).
- **Side by side:** one table with a column for each option: gifts, total, budget fit, packaging and card. Rows where they differ are marked. *Use option B* is disabled, with a note, when B is the same as A.
- **Who gets it:** the same check as *Their view*, before anything is downloaded. Two halves cost about twice as much to draw, so a quality is kept only if a frame fits in 24 ms (the reveal allows 33 ms); most devices start a step lower here. While it gets ready, the controls are disabled with a message. Without WebGL, or on a device too slow for it, the CSS boxes are shown instead, with *Closed* / *Open* still working.
- **Code:** `scene/compareScene.js` (lazy chunk), `scene/CompareStage3D.jsx`, `scene/compareLooks.js`, and `CompareLab.jsx`. The room, lights and quality handling are shared with the reveal through `buildSet` in `studioScene.js`; the five reveal looks render pixel for pixel as before.

## Your view in the 3D studio

*Your view* is the gift as the shopper is sending it, in the same room as *Their view* and *Compare*.

- **How it will arrive:** the shopper's own box (colour, ribbon, wrap, card style) in the studio, opening on their gifts and card; *Closed* shows the packaging. It is Compare's scene with one option, so it's drawn exactly as option A is there. The CSS box stands in without WebGL or on a device too slow for it, still opening and closing.
- **The card they'll read:** their name and the shopper's words, large enough to read, on the chosen card style, with up to three of the shopper's photos on a photo card. With no message yet, it says where the message will appear; nothing is written for the shopper. A note says what's real: the words go with the order, the card style is a preview.
- **What you're giving:** the gifts (with their photos and links), the total, the budget fit and *Add to cart* first; how it's presented (theme and look, card, printed name, reveal order) after, more quietly. The message isn't repeated, since the card shows it. *Add to cart* and what it sends are unchanged.
- **Code:** `YourView.jsx` (with `YourCard`), the restyled `BuyerSummary.jsx`, and the one-option path of `scene/CompareStage3D.jsx` and `compareScene.js`.

## Gift box in the 3D studio

*Gift box* builds a box of several gifts around the box itself.

- **Your box:** the box being built, in the studio, wearing the look chosen in the studio (change the colour, ribbon or wrap and it changes here) and opening on the gifts as they go in, up to six. Below it: one budget, a meter (the total, what's left or how far over, and a bar), the gifts in order with ← ✕ → for each, the compatibility checks and *Preview this box*. A gift dragged from the shelf can be dropped on the box in the studio or on the list.
- **Suggest boxes within a budget:** the same request as before, using that one budget; each suggestion with its gifts, reasons, checks, *Edit this box* and *Preview this box*.
- **Or build your own box:** the shelf, searchable, each gift with its photo, name, price and *Add*. A full box says why nothing more can be added.
- **Unchanged:** the suggestion and check requests, drag and drop, the buttons, the six-gift limit, and *Preview this box* taking the box to *Their view*. Without WebGL the CSS box stands in, open.
- **Code:** `BoxComposer.jsx` (with `BudgetMeter`), using the one-option path of `scene/CompareStage3D.jsx`. `GiftStudio.jsx` now passes it the studio's look and photos.

## The website entry

The homepage's first-visit entry is the Gift Studio's Royal box. It is a short film rendered ahead of time from the studio scene (unchanged; an entry look built from Royal), so the homepage downloads no 3D code at all.

- **What happens:** the box settles in the studio under the "Shubham Creates / GiftGenius" lockup. The shopper opens it (*Open your gift*, Enter, or a click on the box): the ribbon comes off, the lid opens, the tissue folds back and a card reading "Welcome to GiftGenius / Curated with love" comes up to the camera. Then it fades into the homepage, the card moving closer as it goes, and the welcome screen follows as before. *Skip intro* or Escape leave at any time. Shown once per browser session, as before.
- **Files:** `public/intro/`, for each theme (`-light`, `-dark`): a wide framing (1600x1000) for screens wider than they're tall and a tall one (900x1200) for phones held upright, each an arrival and an opening (H.264 MP4) plus two stills (WebP). A visit downloads about 0.74 MB (wide) or 0.45 MB (tall), once a session. The film is always shown whole, between the lockup and the button.
- **Light and dark:** the entry follows the site's theme, which follows the system's light or dark setting unless the visitor has chosen one with the header toggle (`public/theme-init.js`, before the page paints; blocked storage still gets the system's). Light: the box sits in a studio of the site's light teal (`--bg`, #E6F7FA), with the site's ink, its readable gold (#8F5C0E) and its dark button. Dark: a studio of the dark theme's background (#0F1A1C), with ivory type, champagne gold and a light button, as the dark welcome screen. Each theme has its own films, whose walls and floor are rendered as exactly that colour (solved through the scene's tone mapping, and held there while the card comes up), so the edges melt into the page and the entry fades into a homepage of the same colour. A visit downloads one theme's files only.
- **Stills instead:** with reduced motion, data saving, a 2G connection, or a film that won't play or isn't ready in 2.5 seconds, it moves between two stills of the same box instead (38 kB).
- **Reviewing:** as in the studio, `?motion=on` plays the film on a system set to reduced motion, in development or a build with `VITE_STUDIO_REVIEW=1` only.
- **Scroll:** it holds its own scroll lock on `<html>`, so the site's shared overlay lock on `<body>` can't undo it (the old entry's lock was undone as the page mounted).
- **Code:** `components/intro/EntryAnimation.jsx` and `styles/intro/entry.css`. The old entry (gift box, penguin mascot, confetti and fireworks) was removed once this was approved: its rules in `entry-scene.css` and `pages.css`, `penguin.css`, eight animations only it used, and `public/mascot.jpg`.
- **Making the film again:** the frames were drawn from the studio scene in headless Chrome (30 fps, at twice the size) and encoded with ffmpeg (H.264, CRF 25, BT.709 written into the stream so browsers show the room as the page's colour). Those scripts aren't in the repository.

## Reveal experiences in CSS, and the 360° studio view

These are the fallback for devices that don't get the 3D studio. Everything here is pure CSS 3D.

| Experience | Look | What sets it apart |
|---|---|---|
| Royal Luxury Reveal | Black box, emerald lining, gold satin, low-key set | Settles in, lid swings with a small overshoot and settle |
| Birthday Surprise | Coral box with a confetti print, sunshine ribbon, bright set | Bounces in, quick ribbon, lid pops, one burst of confetti, a birthday card flips open |
| Sentimental Unboxing | Deep red box, ivory lining, champagne ribbon, dark red set | Slow cinematic push in, slow ribbon, the message comes first over a dimmed box, then the gift |
| Minimal Aesthetic | Ivory box, one thin beige band and a small knot, high-key set | Slow turn, a quiet lid with no overshoot, no card |
| Personalised Memory Reveal | Linen box, dusty rose ribbon, warm set | The shopper's own photo as a framed print on the lid (revealed as the ribbon leaves) and inside it |

- **The studio:** every experience shares one set: a seamless backdrop, two softboxes on stands, a turntable under the box, a glossy floor with a real mirrored reflection of the box, and a softbox highlight that slides across the lid as it turns. Reflection and softboxes are dropped on phones.
- **360° view:** the *360° Studio View* button runs the turntable at a full turn every 15 seconds. The *Turn the box* dial goes to any angle, and dragging and the arrow keys work at any time, closed or open. Starting the turntable pauses a playing reveal, and starting the reveal stops the turntable. With reduced motion there is no motor, but the dial, drag and keys still work.
- **Code:** `components/studio/experiences/`.
  - `StudioGiftBox` is the one geometry: a flush lid hinged on the back seam, double walls with rims, a ribbon laid over the surfaces, and bow loops built as strips bent along a curve.
  - `experiences.js` holds each experience's look, timing, camera and effects; `styles/studio/reveal-experiences.css` holds the set, the materials and each colour scheme.
  - `useGiftAnimation` is the state machine (entrance, rotation, ribbon, lid, reveal; idle, playing, paused, finished). `useTurntable` handles turning and face shading without re-rendering React.
- **Honesty:** only the studio's real gift, name, message and photo appear, and nothing is shown when one is missing. "Happy birthday" on the Birthday card is the only wording an experience adds. No prices or budget. A printed name appears only on a personalisable gift. Packaging stays a preview. Photos stay on the device.
- **Unchanged:** the cart payload, the APIs and the database.
- **Two rules to keep:** never animate opacity on a 3D group (the browser flattens it and the faces lose their depth order), and never name an experience variable after a site token (it overrides that token inside the player). Tests guard both.
- **Royal has no gold particles,** by choice: the brief for it conflicted with its rule against "random floating particles". Birthday's confetti is one controlled burst, as its brief asks.

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
