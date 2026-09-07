<div align="center">

# 🎁 GiftGenius

### *India's AI-Powered Gift Recommendation Platform*

[![Made with Love](https://img.shields.io/badge/Made%20with-❤️-red?style=for-the-badge)](https://github.com/Shubham-Bhavar/GIFTGENIUS_Website)
[![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/HTML)
[![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/CSS)
[![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![Deployed on Vercel](https://img.shields.io/badge/Deployed%20on-Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white)](https://vercel.com)

<br/>

> **GiftGenius** is a thoughtfully designed, AI-powered gift recommendation platform that helps you find the *perfect gift* for every person and every occasion — in under 60 seconds.

<br/>

![GiftGenius Banner](https://images.unsplash.com/photo-1549465220-1a8b9238cd48?w=1200&q=85)

</div>

---

## ✨ What is GiftGenius?

GiftGenius takes the stress out of gift-giving. Instead of endlessly scrolling through generic product listings, you answer a few smart questions about the recipient and the occasion — and GiftGenius instantly recommends the most relevant, thoughtful gifts from a curated catalog.

It is not just a store. It is a **gift intelligence platform**.

---

## 🗂️ Project Structure

```
GIFTGENIUS_Website/
│
├── index.html          # Homepage — hero, products, filters, modals
├── styles.css          # All homepage styles (dark/light mode)
├── main.js             # All homepage JavaScript (modular IIFE pattern)
├── products.js         # Centralized product catalog (20 products)
│
├── quiz.html           # AI Gift Quiz — 6-step recommendation flow
├── product.html        # Dynamic product detail page
├── cart.html           # Cart and checkout UI
└── track.html          # Order tracking page
```

---

## 🚀 Core Features

### 🤖 AI Gift Quiz
A 6-step intelligent quiz that collects:
- **Who** you are gifting (recipient relationship)
- **What** the occasion is
- **Their interests** and personality vibe
- **Your budget**

The scoring engine then matches every product in the catalog against your answers and returns the **top 4 personalised recommendations** — with an explanation of why each product fits.

### 🛍️ Smart Product Catalog
- **20 curated products** across 9 categories
- Categories: Gift Sets, Accessories, Flowers, Fragrance, Personalized, Food & Sweets, Wellness, Home Decor, Cultural
- Every product has rich metadata: occasion tags, personality match, relationship match, budget range
- Dynamic rendering — all product cards are generated from `products.js`

### 🔍 Search & Filters
- **Fuzzy real-time search** with live dropdown suggestions
- **Filter pills**: All, For Her, For Him, Under ₹999, Premium, Personalized
- **Sort**: Featured, Price Low→High, Price High→Low, Top Rated
- Keyboard navigation support across the product grid

### 🎁 Gift Finder Modal
- 4-step in-page modal (Recipient → Occasion → Budget → Interests)
- Same recommendation engine as the full quiz
- Results shown inline with Add to Cart buttons

### 👁️ Quick View
- Click any product card to open a Quick View modal
- Shows image, name, description, rating, price, and Add to Cart
- Reads directly from `products.js` — no duplicate data

### 🛒 Cart System
- Full sidebar cart with item management
- Quantity controls, item removal
- Free shipping progress bar
- Persisted to `localStorage` — survives page refresh
- Links to `cart.html` for full checkout flow

### ❤️ Wishlist
- Heart toggle on every product card
- Wishlist badge in the header
- Persisted to `localStorage`

### 🌙 Dark / Light Mode
- Full dark mode with teal/gold theme
- Persisted to `localStorage`
- Syncs across all pages (homepage, quiz, product, cart)

### 📦 Dynamic Product Detail Page
- Click any product card → navigates to `product.html`
- Product ID stored in `localStorage`
- Correct product rendered dynamically: name, image, price, description, tags
- Related products from same category
- Personalisation inputs (custom name + message)
- Quantity selector
- Add to Cart → persists to localStorage

### 📍 Order Tracking
- Enter any Order ID to track
- Demo orders: `GG-482910`, `GG-123456`, `GG-999999`
- Live-style timeline with animated pulse indicator
- Reads last order from `localStorage` automatically

---

## 🏗️ Architecture

### Frontend Stack

| Technology | Purpose |
|---|---|
| HTML5 | Semantic multi-page structure |
| CSS3 | Custom design system with CSS variables |
| Vanilla JavaScript | Modular IIFE pattern — no framework needed |
| Google Fonts | Cormorant Garamond + Outfit + DM Mono |
| localStorage | Cart, wishlist, theme, product navigation |

### JavaScript Architecture

`main.js` is organized into self-contained IIFE modules:

```
EntryAnimation     → Gift box opening animation
Theme              → Dark/light mode toggle
NavPill            → Animated nav indicator
MobileMenu         → Hamburger menu
Cart               → Sidebar cart (add/remove/persist)
Wishlist           → Heart toggle + badge
AddToCart          → Wires .add-btn → Cart.addItem
Search             → Debounced fuzzy search
SearchSuggestions  → Live dropdown with keyboard nav
FilterPills        → Category filter tabs
Sort               → Price/rating sort
QuickView          → Product modal (reads products.js)
GiftFinder         → 4-step modal + recommendation engine
ProductNav         → Card click → product.html navigation
Newsletter         → Email validation + subscribe
ScrollReveal       → IntersectionObserver animations
KeyboardNav        → Arrow key product grid navigation
ProfileLogin       → Account modal (UI)
```

### Recommendation Engine

```
User Inputs (quiz or modal)
         ↓
Score every product in PRODUCTS[]

Scoring weights:
  Occasion match          → +30 points
  Budget fits             → +25 points
  Budget comfort (≤ 80%)  → +10 bonus
  Relationship match      → +20 points
  Interest/category match → +15 points
  Personality match       → +10 points
  Rating bonus            → up to +10 points

         ↓
Sort by score (descending)
         ↓
Return top 4 products
         ↓
Display with match reason
```

---

## 🗺️ Pages

| Page | Description |
|---|---|
| `index.html` | Homepage with hero, product grid, filters, search, modals |
| `quiz.html` | 6-step AI gift quiz with scored recommendations |
| `product.html` | Dynamic product detail (reads id from localStorage) |
| `cart.html` | Cart review, coupon, checkout flow |
| `track.html` | Order tracking with demo order data |

---

## 🎨 Design System

**Fonts:**
- `Cormorant Garamond` — headings (editorial, premium)
- `Outfit` — body text (clean, modern)
- `DM Mono` — labels, tags, metadata (technical, precise)

**Colour Palette:**

| Token | Value | Usage |
|---|---|---|
| `--teal` | `#6EC6CF` | Primary accent |
| `--teal-dark` | `#3A8F98` | Hover states, category labels |
| `--gold` | `#B8791A` | CTA buttons, highlights |
| `--gold-light` | `#D4AF37` | Dark mode accents |
| `--ink` | `#0F2225` | Primary text (light mode) |
| `--cream` | `#E6F7FA` | Background (light mode) |

---

## 📦 Product Catalog

20 products across 9 categories:

| # | Product | Category | Price |
|---|---|---|---|
| 1 | Luxury Hamper Box | Gift Sets | ₹499 |
| 2 | Engraved Timepiece | Accessories | ₹1,299 |
| 3 | Classic Rose Bouquet | Flowers | ₹599 |
| 4 | Signature Perfume | Fragrance | ₹1,199 |
| 5 | Personalised Memory Journal | Personalized | ₹349 |
| 6 | Artisan Chocolate Box | Food & Sweets | ₹299 |
| 7 | Pashmina Shawl | Accessories | ₹899 |
| 8 | Succulent Plant Gift Set | Home Decor | ₹449 |
| 9 | Customised Star Map Print | Personalized | ₹799 |
| 10 | Luxury Spa Gift Set | Wellness | ₹1,099 |
| 11 | Wireless Earbuds Premium | Accessories | ₹1,999 |
| 12 | Handmade Warli Art Frame | Cultural | ₹649 |
| 13 | Diwali Premium Sweets Box | Food & Sweets | ₹799 |
| 14 | Rakhi Special Gift Combo | Gift Sets | ₹499 |
| 15 | Leather Wallet & Card Holder | Accessories | ₹749 |
| 16 | Paithani Silk Bookmark Set | Cultural | ₹399 |
| 17 | Scented Candle Gift Set | Wellness | ₹549 |
| 18 | Graduation Memory Box | Personalized | ₹899 |
| 19 | Kolhapuri Craft Jewellery Box | Cultural | ₹849 |
| 20 | Couple Photo Book | Personalized | ₹699 |

---

## 🧭 Roadmap

### ✅ Completed (MVP Frontend)
- [x] Centralized product data system (`products.js`)
- [x] Dynamic product card rendering
- [x] Search + filter + sort
- [x] Quick View modal (reads from products.js)
- [x] Rule-based recommendation engine
- [x] Gift Finder modal (4-step)
- [x] AI Gift Quiz page (6-step)
- [x] Dynamic product detail page
- [x] Cart sidebar + localStorage persistence
- [x] Wishlist + localStorage persistence
- [x] Dark / light mode
- [x] Order tracking page (demo)
- [x] Navigation connected across all pages
- [x] Mobile responsive design

### 🔄 In Progress
- [ ] CultureConnect — Maharashtra cultural gifting section
- [ ] Festival Special — festival-specific gift discovery

### 📋 Planned
- [ ] GiftTwin — save recipient profiles
- [ ] No-Duplicate Gift Engine — avoid repeat gift categories
- [ ] AI Gift Box Builder — build a gift bundle within budget
- [ ] GiftReveal — QR-code digital gift experience
- [ ] Spring Boot backend (Java 17)
- [ ] MySQL product database
- [ ] Google Gemini AI integration
- [ ] User authentication
- [ ] Real payments & order management
- [ ] Admin dashboard
- [ ] Seller marketplace

---

## ⚙️ Getting Started

### Run Locally

No build tools, no npm, no setup required.

```bash
# 1. Clone the repository
git clone https://github.com/Shubham-Bhavar/GIFTGENIUS_Website.git

# 2. Open in browser
# Simply open index.html in any modern browser
# OR use VS Code Live Server extension for best experience
```

### File Load Order

The following script order in `index.html` is required:

```html
<script src="products.js" defer></script>   <!-- FIRST: product data -->
<script src="main.js" defer></script>        <!-- SECOND: all logic -->
```

`quiz.html` and `product.html` each load `products.js` independently.

---

## 🧪 Demo Data

**Order Tracking demo orders:**

| Order ID | Status |
|---|---|
| `GG-482910` | 🚚 In Transit |
| `GG-123456` | ✅ Delivered |
| `GG-999999` | 🔄 Processing |

**Gift Quiz — try this combination for best results:**
- Recipient: Partner
- Occasion: Anniversary
- Interests: Fragrance
- Vibe: Luxury & Premium
- Budget: ₹1,500 – ₹5,000

Expected result: Signature Perfume + Luxury Hamper Box as top recommendations.

---

## 🤝 Contributing

This is a student project actively under development. Contributions, suggestions, and feedback are welcome.

1. Fork the repository
2. Create your branch: `git checkout -b feature/your-feature`
3. Commit your changes: `git commit -m 'Add: your feature'`
4. Push to the branch: `git push origin feature/your-feature`
5. Open a Pull Request

---

## 👨‍💻 Author

**Shubham Bhavar**

A student developer building GiftGenius as a full-stack AI-powered gifting platform — from a static HTML page to a complete product with Spring Boot backend and Gemini AI integration.

- GitHub: [@Shubham-Bhavar](https://github.com/Shubham-Bhavar)

---

## 📄 License

This project is open source and available under the [MIT License](LICENSE).

---

<div align="center">

Made with ❤️ by Shubham Bhavar

*"The best gift is one that shows you truly know the person."*

⭐ Star this repo if GiftGenius helped you!

</div>
