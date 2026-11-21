# GiftGenius as a gift decision assistant: phase 1

Built 2026-10-29 on the local branch `feat/gift-decision-assistant` (from `audit/production-readiness`). Inputs: the founder's feature brief (Gift Match Score, Recipient Profile, Avoid List, Budget Planner, "Why this gift?", Occasion Reminders, India-first search, curated catalogue) and the *Market Research & Strategy Report* of 2026-10-28 (recommendation explanations, budget-accurate results, verified products only, AI used selectively, DPDP consent).

## What shipped

| Brief priority | Status | What the shopper sees |
|---|---|---|
| 1. Gift Finder quiz | Existing, extended | One new optional question, *Anything they don't like?*, and an optional first name shown only on the page |
| 2. Match Score + reasons | Built | Each pick shows "92% match" and a "Why this gift?" list: ✓ or ✕ for each answer ("₹449: well within your ₹1,000 budget", "Not one of our usual picks for partners") |
| 3. Avoid List | Built | Chips for perfume, flowers, sweets, watches, jewellery, candles, plants and gadgets, plus dislikes written in the notes ("hates perfume", "already has a watch", "perfume आवडत नाही"). These items never appear, and the page says what was left out |
| 5. Budget-first planner | Built | With a budget: one practical, one emotional and one experience gift, each strictly within the budget |
| 5b. "Why this gift?" from verified data | Built | Every check comes from the catalogue and the engine, not from the model |
| 4. Recipient Profile | Not built: needs decisions (below) | |
| 6. Occasion reminders | Not built: needs decisions (below) | |
| 7. India-first relationship + occasion pages | Not built: needs a rendering decision (below) | |
| 8. Curated catalogue | Content work for the owner (below) | |

Also fixed along the way (details in [BUG_REGISTER.md](BUG_REGISTER.md)):

- GG-17: the free-text parser read "she hates perfume" as an *interest* in perfume. It now reads it as something to avoid.
- GG-18: the quiz page showed an empty "Your Gift Matches" heading under the questions before any results existed.
- GG-19: three colour-contrast gaps on the quiz result cards, in both themes.

## How it works

```
quiz answers + notes ─▶ normalise ─▶ avoid list (chips ∪ dislikes in the notes)
        │                               │
        ▼                               ▼
  candidates: in stock, near budget, NOT on the avoid list   (hard filter, before any ranking or AI)
        │
        ▼
  score ─▶ rank ─▶ varied set ─▶ explain + match report (per pick)
        │                                   │
        │                                   └─▶ optional Gemini re-rank of the same shortlist:
        │                                       the model's reason may replace the sentence;
        │                                       the match and checks stay the engine's
        ▼
  budget planner: practical / emotional / experience, strictly ≤ budget, distinct products
```

### Match score

- **Only what the shopper asked for counts.** Each answer is weighted as the ranking already weighs it (`RecommendationWeights`): interest 15, budget 25 plus 10 when comfortably within it, occasion 30 (plus 12 festive for festivals), recipient 20 (plus 6 when the gift's her/him tag fits), style 10, premium 8.
- `match = round(100 × points met ÷ points possible)`. With no answers there is no percentage.
- Rating and sales still rank the gifts but aren't part of the match, so a 4.9★ gift that ignores the occasion doesn't look like a perfect match.
- Over budget is always an unmet check that names the amount ("₹99 over your ₹1,000 budget").
- Code: `recommendation/engine/FitReporter.java`, called from `ExplanationService`.

### Avoid list

- A hard filter in `CandidateGenerator.withoutAvoided`, applied before scoring, the top-rated fallback, the AI shortlist and the planner. The model never sees an avoided product, and its prompt also lists what to avoid.
- Known things cover a family (`Vocabulary.AVOID`): "perfume" leaves out the fragrance category and products with *perfume*, *fragrance* or *attar* in the name. A specific thing stays specific: "watches" leaves out the timepiece but not the wallet, although both are accessories.
- Any other word is matched against product names, categories and tags ("leather" leaves out a leather wallet).
- A dislike beats a conflicting interest: picking "Flowers & Fragrance" and then "Perfume" drops the fragrance interest.
- If everything within the budget is avoided, the answer says so instead of showing something disliked.
- Code: `AvoidList.java`, `Vocabulary.java`, `TextPreferenceParser.java` (negation).

### Negation in free text

- The parser reads English cues before the thing: hates, no, not, doesn't (really) like, isn't a big fan of, except, without, already has, can't stand, allergic to.
- It also reads Hinglish, Hindi and Marathi cues after the thing: nahi, nahin, नाही, नको, नहीं.
- The closest cue within six words decides, so "hates crowds, so something calm like candles" still likes candles.
- Phrases that don't rule anything out are ignored: "not sure", "no more than ₹2,000", "has no perfume yet".
- In the free-text request (`/api/ai/gift-request`) the rules and the model both read dislikes, and anything either finds is avoided.

### Budget-first planner

- Kinds come from catalogue categories (`PlanKind`):
  - **Practical**: accessories and home decor.
  - **Emotional**: personalised items, flowers and cultural items.
  - **Experience**: wellness, food and sweets, hampers and fragrance.
- Each kind's best fit within the budget is chosen, with no tolerance over it, never an avoided product, and never the same product twice.
- A kind with nothing within the budget is shown as missing ("No practical gift within ₹500 yet.").
- **"Experience" means products to enjoy or unwind with** (a spa set, sweets, a hamper). The catalogue has no booked experiences such as classes or trips; adding them is a catalogue decision.

## API changes (backward compatible; fields added)

| Endpoint | Change |
|---|---|
| `POST /api/ai/recommendations` | Request: optional `avoid` (≤ 10 plain words, same validation as the quiz's other choices). Response: each pick adds `match` (0–100 or absent) and `checks` (`[{criterion, met, text}]`); adds `avoided` (canonical words) and `plan` (`{budget, options:[{kind, product, reason, match, checks}], missing}`; absent without a budget) |
| `POST /api/ai/gift-request` | `understood.avoid`; `plan`; picks carry `match` and `checks` |

No database migration. Nothing new is stored, and the recipient's name stays in the browser.

## Verification

Commands and counts are in [TEST_RESULTS.md](TEST_RESULTS.md) (*Gift decision assistant* section).

- 39 new backend unit tests (242 → 281): avoid families, match arithmetic and wording, 17 negation cases in English, Hinglish, Hindi and Marathi, the planner's strict budget, and the model never overriding the match.
- 4 new integration tests over HTTP and MySQL (110 → 114).
- Frontend: a new planner journey test and a new axe-core check of the results view (140 → 142); the existing quiz journeys were updated for the new step.
- In a real browser, axe-core's colour-contrast rule on the results gives 0 violations in both themes, after fixing three pre-existing contrast gaps on the quiz cards (BUG_REGISTER GG-19).
- In a browser against the local backend:
  - "Partner · Birthday · Home & Decor · don't like perfume and sweets · ₹1,500" gave 4 matched picks with ✓/✕ reasons and a 3-kind plan, all within ₹1,500.
  - "He already has a watch and doesn't like chocolates" in the notes produced "Leaving out: Watches, Sweets & chocolates".
  - The layout was checked at 375 px.

## Limits to know

- **Catalogue size.** The seed has 20 products, so several picks can share the same match, and some kinds or budgets have nothing (e.g. no practical gift under ₹500). The engine is ready for a larger curated catalogue.
- **No delivery-city data.** The brief's "delivery possible in Mumbai" check needs a delivery-coverage field per product (or per supplier) first. It isn't shown, rather than guessed.
- **Match texts are English.** Hindi and Marathi copy needs translation decisions.

## Next phases: decisions needed

1. **Recipient Profiles ("Gift DNA") and the gift history.**
   - Storing a name, age band, interests, city, dislikes and past gifts about *another person* is personal data under the DPDP Act, 2023.
   - Decide:
     - consent wording, shown to the account holder and stating whose data it is;
     - which fields to keep, and whether to store age bands only;
     - how long to keep profiles, and deletion (one click, plus deletion with the account);
     - whether it's for signed-in users only (recommended).
   - Needs a migration (V7), API and Account pages; the quiz would then pre-fill from a saved profile.
2. **Occasion reminders.**
   - Decide:
     - channel: email (SMTP must be configured first) or WhatsApp (needs a provider and a template approval);
     - explicit opt-in and one-click opt-out;
     - which dates to store (with consent);
     - the default lead time (e.g. 7 days).
   - Needs a scheduler, a delivery log and unsubscribe handling.
3. **India-first landing pages** (e.g. *girlfriend birthday gift under ₹1,000*).
   - The storefront is a client-rendered SPA, so these pages need prerendering or server rendering to rank in search.
   - Decide the approach (prerender at build time, or a small SSR layer), the first 10 pages, and the languages.
4. **Curated catalogue.**
   - The brief's 300–500 products, with photos, clear prices, delivery cities, recipient and occasion tags, budget bands and a quality note.
   - This is sourcing work (suppliers or affiliate feeds, per the report's recommendation).
   - The schema would need delivery coverage and a quality note; the rest maps onto existing fields.
5. **Feedback buttons** ("Too expensive", "Not their style", "Perfect").
   - Listed under the report's "build first".
   - Decide whether to store feedback anonymously or per account; it would let the weights be tuned from real use.
