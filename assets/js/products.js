/**
 * GiftGenius — products.js
 * Centralized product data — the ONLY place product info should live.
 *
 * FIELD GUIDE (for the recommendation engine):
 *
 * id            — unique number
 * name          — display name
 * category      — matches GiftFinder INTERESTS values (lowercase)
 *                 "flowers" | "fragrance" | "accessories" | "gift sets"
 *                 | "personalized" | "food & sweets" | "experience"
 *                 | "cultural" | "wellness" | "home decor"
 * price         — sale price in ₹ (number)
 * originalPrice — crossed-out price in ₹ (number)
 * rating        — 4.0–5.0
 * reviewCount   — number
 * starsDisplay  — "★★★★★" or "★★★★☆"
 * image         — CDN URL
 * alt           — image alt text
 * badge         — { text, className }
 *                 className: pbadge--bestseller | pbadge--new | pbadge--sale | pbadge--rated
 * tags          — array used by FilterPills on homepage
 *                 values: "for-her" | "for-him" | "premium" | "budget" | "personalized"
 * occasion      — array matching GiftFinder OCCASIONS values
 *                 "birthday" | "anniversary" | "festival" | "graduation" | "valentine"
 * forWhom       — array: "her" | "him" | "both"
 * personality   — array: "introvert" | "extrovert" | "minimalist" | "expressive" | "creative" | "practical"
 * relationship  — array: "friend" | "partner" | "parent" | "sibling" | "colleague" | "self"
 * description   — one-line product description (used in Quick View and recommendation explanation)
 * isCultural    — boolean, true for CultureConnect products
 * isFestival    — boolean, true for Festival Special products
 */

'use strict';

const PRODUCTS = [

  /* ─── 1 ─── */
  {
    id: 1,
    name: "Luxury Hamper Box",
    category: "gift sets",
    price: 499,
    originalPrice: 699,
    rating: 4.9,
    reviewCount: 182,
    starsDisplay: "★★★★★",
    image: "https://t4.ftcdn.net/jpg/05/32/64/27/240_F_532642742_3lStpC5P0U4FrndE82prkwm61F5OnQgj.jpg",
    alt: "Luxury gift hamper box with curated items",
    badge: { text: "Bestseller", className: "pbadge--bestseller" },
    tags: ["for-her", "for-him", "premium"],
    occasion: ["birthday", "anniversary", "festival"],
    forWhom: ["her", "him"],
    personality: ["expressive", "extrovert"],
    relationship: ["partner", "parent", "friend"],
    description: "A beautifully curated hamper packed with premium goodies — perfect for any celebration.",
    isCultural: false,
    isFestival: false
  },

  /* ─── 2 ─── */
  {
    id: 2,
    name: "Engraved Timepiece",
    category: "accessories",
    price: 1299,
    originalPrice: 1699,
    rating: 4.8,
    reviewCount: 94,
    starsDisplay: "★★★★★",
    image: "https://etchcraftemporium.in/cdn/shop/files/ChatGPT_Image_Aug_14_2025_07_16_41_PM.png?v=1755179225&width=800",
    alt: "Elegant engraved timepiece watch gift",
    badge: { text: "New", className: "pbadge--new" },
    tags: ["for-him", "premium", "personalized"],
    occasion: ["birthday", "anniversary", "graduation"],
    forWhom: ["him"],
    personality: ["minimalist", "practical"],
    relationship: ["partner", "parent", "sibling"],
    description: "A timeless watch with custom engraving — the gift that tells time and stories.",
    isCultural: false,
    isFestival: false
  },

  /* ─── 3 ─── */
  {
    id: 3,
    name: "Classic Rose Bouquet",
    category: "flowers",
    price: 599,
    originalPrice: 799,
    rating: 4.6,
    reviewCount: 310,
    starsDisplay: "★★★★☆",
    image: "https://www.uflowershop.com/1294-large_default/valentine-s-day-classic-red-rose-bouquet.webp",
    alt: "Classic red rose bouquet for gifting",
    badge: { text: "Sale", className: "pbadge--sale" },
    tags: ["for-her", "budget"],
    occasion: ["valentine", "anniversary", "birthday"],
    forWhom: ["her"],
    personality: ["expressive", "extrovert"],
    relationship: ["partner", "friend"],
    description: "Fresh red roses arranged by expert florists — delivered same day in Mumbai.",
    isCultural: false,
    isFestival: false
  },

  /* ─── 4 ─── */
  {
    id: 4,
    name: "Signature Perfume",
    category: "fragrance",
    price: 1199,
    originalPrice: 1499,
    rating: 4.9,
    reviewCount: 218,
    starsDisplay: "★★★★★",
    image: "https://images.stockcake.com/public/e/b/3/eb3d9618-4d24-4f60-bf9c-17168329eb84_large/elegant-perfume-bottle-stockcake.jpg",
    alt: "Elegant signature perfume bottle gift",
    badge: { text: "Top Rated", className: "pbadge--rated" },
    tags: ["for-her", "for-him", "premium"],
    occasion: ["birthday", "valentine", "anniversary"],
    forWhom: ["her", "him"],
    personality: ["expressive", "minimalist"],
    relationship: ["partner", "friend", "sibling"],
    description: "A sophisticated fragrance crafted to leave a lasting impression — luxury in a bottle.",
    isCultural: false,
    isFestival: false
  },

  /* ─── 5 ─── */
  {
    id: 5,
    name: "Personalised Memory Journal",
    category: "personalized",
    price: 349,
    originalPrice: 499,
    rating: 4.7,
    reviewCount: 143,
    starsDisplay: "★★★★☆",
    image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQYHMpPD82BbPD-XU5Sy5FkvJ18kjiHDYcGeAvo_ebW_Q&s=10",
    alt: "Open leather journal for writing",
    badge: { text: "Sale", className: "pbadge--sale" },
    tags: ["for-her", "for-him", "personalized", "budget"],
    occasion: ["birthday", "graduation", "anniversary"],
    forWhom: ["her", "him"],
    personality: ["introvert", "creative", "minimalist"],
    relationship: ["friend", "sibling", "partner"],
    description: "A custom-name embossed leather journal — perfect for the thinker, writer, or dreamer.",
    isCultural: false,
    isFestival: false
  },

  /* ─── 6 ─── */
  {
    id: 6,
    name: "Artisan Chocolate Box",
    category: "food & sweets",
    price: 299,
    originalPrice: 399,
    rating: 4.8,
    reviewCount: 276,
    starsDisplay: "★★★★★",
    image: "https://www.fnp.com/images/pr/x/v20240619124652/artisan-chocolate-medley_1.jpg",
    alt: "Assorted artisan chocolate gift box",
    badge: { text: "Bestseller", className: "pbadge--bestseller" },
    tags: ["for-her", "for-him", "budget"],
    occasion: ["birthday", "valentine", "festival"],
    forWhom: ["her", "him"],
    personality: ["extrovert", "expressive", "practical"],
    relationship: ["friend", "colleague", "sibling", "parent"],
    description: "Handcrafted Belgian chocolates in an elegant box — a crowd-pleasing delight for all ages.",
    isCultural: false,
    isFestival: false
  },

  /* ─── 7 ─── */
  {
    id: 7,
    name: "Pashmina Shawl",
    category: "accessories",
    price: 899,
    originalPrice: 1199,
    rating: 4.7,
    reviewCount: 88,
    starsDisplay: "★★★★☆",
    image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRYVNFC5xSccFz_ABiLHmqALbxu8wtUT3JaE_badgJZZq0AOYVwcBse63QH&s=10",
    alt: "Soft folded pashmina shawl in warm tones",
    badge: { text: "Sale", className: "pbadge--sale" },
    tags: ["for-her", "premium"],
    occasion: ["birthday", "anniversary", "festival"],
    forWhom: ["her"],
    personality: ["minimalist", "practical", "introvert"],
    relationship: ["mother", "parent", "partner", "sibling"],
    description: "A buttery-soft pure pashmina shawl — a timeless, elegant gift for the women in your life.",
    isCultural: false,
    isFestival: false
  },

  /* ─── 8 ─── */
  {
    id: 8,
    name: "Succulent Plant Gift Set",
    category: "home decor",
    price: 449,
    originalPrice: 599,
    rating: 4.5,
    reviewCount: 192,
    starsDisplay: "★★★★☆",
    image: "https://nurserylive.com/cdn/shop/products/nurserylive-bulk-gifts-splendid-succulents-gift-pack-16969345368204.jpg?v=1634229204&width=800",
    alt: "Small succulent plants in decorative pots",
    badge: { text: "New", className: "pbadge--new" },
    tags: ["for-her", "for-him", "budget"],
    occasion: ["birthday", "graduation", "anniversary"],
    forWhom: ["her", "him"],
    personality: ["introvert", "creative", "minimalist"],
    relationship: ["friend", "colleague", "sibling"],
    description: "A charming set of low-maintenance succulents — a living, growing reminder of your care.",
    isCultural: false,
    isFestival: false
  },

  /* ─── 9 ─── */
  {
    id: 9,
    name: "Customised Star Map Print",
    category: "personalized",
    price: 799,
    originalPrice: 999,
    rating: 4.9,
    reviewCount: 127,
    starsDisplay: "★★★★★",
    image: "http://www.nookatyou.com/cdn/shop/files/9_be3ba05c-077c-47f0-bc13-dba884092b05.png?v=1758794209",
    alt: "Night sky star map art print",
    badge: { text: "Top Rated", className: "pbadge--rated" },
    tags: ["for-her", "for-him", "personalized", "premium"],
    occasion: ["anniversary", "valentine", "birthday"],
    forWhom: ["her", "him"],
    personality: ["creative", "expressive", "introvert"],
    relationship: ["partner", "friend"],
    description: "A framed print of the night sky on your most special date — a deeply personal, one-of-a-kind gift.",
    isCultural: false,
    isFestival: false
  },

  /* ─── 10 ─── */
  {
    id: 10,
    name: "Luxury Spa Gift Set",
    category: "wellness",
    price: 1099,
    originalPrice: 1499,
    rating: 4.8,
    reviewCount: 201,
    starsDisplay: "★★★★★",
    image: "https://m.media-amazon.com/images/I/61goHt3M-rL._AC_UF1000,1000_QL80_.jpg",
    alt: "Spa products flatlay with bath oils and flowers",
    badge: { text: "Bestseller", className: "pbadge--bestseller" },
    tags: ["for-her", "premium"],
    occasion: ["birthday", "anniversary", "valentine"],
    forWhom: ["her"],
    personality: ["introvert", "minimalist", "expressive"],
    relationship: ["partner", "friend", "sibling", "parent"],
    description: "Bath salts, essential oils, and face masks in an elegant box — the ultimate self-care collection.",
    isCultural: false,
    isFestival: false
  },

  /* ─── 11 ─── */
  {
    id: 11,
    name: "Wireless Earbuds Premium",
    category: "accessories",
    price: 1999,
    originalPrice: 2499,
    rating: 4.7,
    reviewCount: 156,
    starsDisplay: "★★★★☆",
    image: "https://www.leafstudios.in/cdn/shop/files/1_5e005039-83c1-4054-ba73-cda7f78fb128_800x.png?v=1786005631",
    alt: "White wireless earbuds in charging case",
    badge: { text: "New", className: "pbadge--new" },
    tags: ["for-him", "for-her", "premium"],
    occasion: ["birthday", "graduation", "anniversary"],
    forWhom: ["him", "her"],
    personality: ["practical", "extrovert", "minimalist"],
    relationship: ["sibling", "friend", "partner"],
    description: "Crystal-clear sound, active noise cancellation — a gift for the music lover and the focused worker.",
    isCultural: false,
    isFestival: false
  },

  /* ─── 12 ─── */
  {
    id: 12,
    name: "Handmade Warli Art Frame",
    category: "cultural",
    price: 649,
    originalPrice: 899,
    rating: 4.8,
    reviewCount: 73,
    starsDisplay: "★★★★★",
    image: "https://umedmart.com/cdn/shop/files/UM-BC-WPWF-06.jpg?v=1753864866&width=1200",
    alt: "Colourful handmade art painting on canvas",
    badge: { text: "Bestseller", className: "pbadge--bestseller" },
    tags: ["for-her", "for-him", "personalized"],
    occasion: ["birthday", "anniversary", "festival"],
    forWhom: ["her", "him"],
    personality: ["creative", "introvert", "expressive"],
    relationship: ["parent", "friend", "partner"],
    description: "Authentic hand-painted Warli art from Maharashtra tribal artists — culture, heritage, and beauty in one frame.",
    isCultural: true,
    isFestival: false
  },

  /* ─── 13 ─── */
  {
    id: 13,
    name: "Diwali Premium Sweets Box",
    category: "food & sweets",
    price: 799,
    originalPrice: 999,
    rating: 4.9,
    reviewCount: 341,
    starsDisplay: "★★★★★",
    image: "https://www.fnp.com/images/pr/l/v20250924141021/diwali-premium-sweetness-box_1.jpg",
    alt: "Traditional Indian mithai sweets in box",
    badge: { text: "Bestseller", className: "pbadge--bestseller" },
    tags: ["for-her", "for-him", "premium"],
    occasion: ["festival"],
    forWhom: ["her", "him"],
    personality: ["extrovert", "expressive", "practical"],
    relationship: ["parent", "colleague", "friend", "partner"],
    description: "A royal box of premium mithai, dry fruits, and handmade chocolates — the perfect Diwali gift.",
    isCultural: false,
    isFestival: true
  },

  /* ─── 14 ─── */
  {
    id: 14,
    name: "Rakhi Special Gift Combo",
    category: "gift sets",
    price: 499,
    originalPrice: 699,
    rating: 4.7,
    reviewCount: 189,
    starsDisplay: "★★★★☆",
    image: "https://m.media-amazon.com/images/I/71zJoiEofWL._AC_UF894,1000_QL80_.jpg",
    alt: "Colourful thread bracelet gift for sibling",
    badge: { text: "Sale", className: "pbadge--sale" },
    tags: ["for-him", "budget"],
    occasion: ["festival", "birthday"],
    forWhom: ["him"],
    personality: ["practical", "extrovert"],
    relationship: ["sibling"],
    description: "A thoughtfully curated Rakhi combo with chocolates, dry fruits, and a personalised card for your brother.",
    isCultural: false,
    isFestival: true
  },

  /* ─── 15 ─── */
  {
    id: 15,
    name: "Leather Wallet & Card Holder",
    category: "accessories",
    price: 749,
    originalPrice: 999,
    rating: 4.6,
    reviewCount: 112,
    starsDisplay: "★★★★☆",
    image: "https://www.starelabs.com/wp-content/uploads/2023/10/Vegan-Leather-Card-And-Cash-Holder-2-2-600x400.jpg",
    alt: "Brown leather bifold wallet open on surface",
    badge: { text: "Sale", className: "pbadge--sale" },
    tags: ["for-him", "premium"],
    occasion: ["birthday", "graduation", "anniversary"],
    forWhom: ["him"],
    personality: ["minimalist", "practical"],
    relationship: ["partner", "friend", "sibling", "parent"],
    description: "Full-grain leather wallet with RFID protection and matching card holder — practical luxury for everyday life.",
    isCultural: false,
    isFestival: false
  },

  /* ─── 16 ─── */
  {
    id: 16,
    name: "Paithani Silk Bookmark Set",
    category: "cultural",
    price: 399,
    originalPrice: 549,
    rating: 4.6,
    reviewCount: 47,
    starsDisplay: "★★★★☆",
    image: "http://froggmag.com/cdn/shop/files/FDBM2B6-1-1.png?v=1689835808",
    alt: "Books with decorative silk bookmark",
    badge: { text: "New", className: "pbadge--new" },
    tags: ["for-her", "budget", "personalized"],
    occasion: ["birthday", "graduation", "festival"],
    forWhom: ["her"],
    personality: ["introvert", "creative", "minimalist"],
    relationship: ["friend", "sibling", "colleague"],
    description: "Handwoven Paithani silk bookmarks in traditional Maharashtra patterns — a cultural treasure in miniature.",
    isCultural: true,
    isFestival: false
  },

  /* ─── 17 ─── */
  {
    id: 17,
    name: "Scented Candle Gift Set",
    category: "wellness",
    price: 549,
    originalPrice: 749,
    rating: 4.7,
    reviewCount: 168,
    starsDisplay: "★★★★☆",
    image: "https://houseofaroma.in/wp-content/uploads/2023/02/scented-candle-gift-set-combo-pack-4.webp",
    alt: "Three lit scented candles glowing warmly",
    badge: { text: "Sale", className: "pbadge--sale" },
    tags: ["for-her", "premium", "budget"],
    occasion: ["birthday", "anniversary", "valentine"],
    forWhom: ["her"],
    personality: ["introvert", "minimalist", "expressive"],
    relationship: ["friend", "partner", "sibling"],
    description: "Three hand-poured soy wax candles in signature scents — for evenings that deserve to feel special.",
    isCultural: false,
    isFestival: false
  },

  /* ─── 18 ─── */
  {
    id: 18,
    name: "Graduation Memory Box",
    category: "personalized",
    price: 899,
    originalPrice: 1199,
    rating: 4.8,
    reviewCount: 91,
    starsDisplay: "★★★★★",
    image: "https://m.media-amazon.com/images/I/81v1jwVtBRL._AC_UF350,350_QL80_.jpg",
    alt: "Graduation cap and diploma certificate",
    badge: { text: "Top Rated", className: "pbadge--rated" },
    tags: ["for-her", "for-him", "personalized", "premium"],
    occasion: ["graduation", "birthday"],
    forWhom: ["her", "him"],
    personality: ["expressive", "creative", "extrovert"],
    relationship: ["friend", "sibling", "partner"],
    description: "A personalised keepsake box with photo frame and memory slots — celebrate their achievement in style.",
    isCultural: false,
    isFestival: false
  },

  /* ─── 19 ─── */
  {
    id: 19,
    name: "Kolhapuri Craft Jewellery Box",
    category: "cultural",
    price: 849,
    originalPrice: 1099,
    rating: 4.8,
    reviewCount: 62,
    starsDisplay: "★★★★★",
    image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQdZTE8mUeso3MUIngRXQbzHKlMeTHaWjA4uGi0fC5kQQ&s=10",
    alt: "Open jewellery box with compartments",
    badge: { text: "Bestseller", className: "pbadge--bestseller" },
    tags: ["for-her", "premium", "personalized"],
    occasion: ["birthday", "anniversary", "festival"],
    forWhom: ["her"],
    personality: ["expressive", "creative", "extrovert"],
    relationship: ["partner", "parent", "friend"],
    description: "A hand-carved Kolhapuri leather jewellery box — exquisite craftsmanship from Maharashtra's artisans.",
    isCultural: true,
    isFestival: false
  },

  /* ─── 20 ─── */
  {
    id: 20,
    name: "Couple Photo Book",
    category: "personalized",
    price: 699,
    originalPrice: 899,
    rating: 4.9,
    reviewCount: 203,
    starsDisplay: "★★★★★",
    image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTMVe5ghu_yzrPAaGPNdJpXo0ej72Q839A1bBNH7c5ofA&s=10",
    alt: "Open photo album with memories",
    badge: { text: "Top Rated", className: "pbadge--rated" },
    tags: ["for-her", "for-him", "personalized", "premium"],
    occasion: ["anniversary", "valentine", "birthday"],
    forWhom: ["her", "him"],
    personality: ["expressive", "creative", "extrovert"],
    relationship: ["partner"],
    description: "A custom hardcover photo book filled with your shared memories — a gift that tells your story.",
    isCultural: false,
    isFestival: false
  }

];

/* ═══════════════════════════════════════════════
   CARD BUILDER
   Generates one .pcard element from a product object.
   Markup matches what main.js modules expect.
═══════════════════════════════════════════════ */
function buildProductCard(product) {
  const tagsAttr = product.tags.join(' ');

  return `
    <article
      class="pcard"
      role="listitem"
      data-id="${product.id}"
      data-name="${product.name.toLowerCase()}"
      data-category="${product.category.toLowerCase()}"
      data-tags="${tagsAttr}"
      data-price="${product.price}"
      data-rating="${product.rating}"
    >
      <div class="pcard-img">
        <span class="pbadge ${product.badge.className}">${product.badge.text}</span>
        <button class="wish-btn" aria-label="Add ${product.name} to wishlist" aria-pressed="false">🤍</button>
        <img src="${product.image}" alt="${product.alt}" loading="lazy">
        <button class="quickview-btn" data-id="${product.id}" aria-label="Quick view ${product.name}">Quick View</button>
      </div>
      <div class="pcard-body">
        <p class="pcard-cat">${product.category}</p>
        <h3 class="pcard-name">${product.name}</h3>
        <div class="pcard-rating" aria-label="Rating: ${product.rating} out of 5, ${product.reviewCount} reviews">
          <span class="stars" aria-hidden="true">${product.starsDisplay}</span>
          <span>${product.rating} (${product.reviewCount})</span>
        </div>
        <div class="pcard-foot">
          <div class="pcard-price">
            <span class="price-og"><span class="sr-only">Original price:</span>₹${product.originalPrice.toLocaleString('en-IN')}</span>
            <span class="price-now"><span class="sr-only">Sale price:</span>₹${product.price.toLocaleString('en-IN')}</span>
          </div>
          <button
            class="add-btn"
            data-name="${product.name}"
            data-price="${product.price}"
            data-img="${product.image}"
            data-id="${product.id}"
            aria-label="Add ${product.name} to cart"
          >
            + Add
          </button>
        </div>
      </div>
    </article>
  `;
}

/* ═══════════════════════════════════════════════
   RENDER
   Renders a product list into #productGrid.
   Call this before main.js modules init.
═══════════════════════════════════════════════ */
function renderProducts(list) {
  const grid = document.getElementById('productGrid');
  if (!grid) return;
  const items = list !== undefined ? list : PRODUCTS;
  grid.innerHTML = items.map(buildProductCard).join('');
}

/* ═══════════════════════════════════════════════
   LOOKUP HELPER
   Returns a product by id — used by QuickView
   and product detail page.
═══════════════════════════════════════════════ */
function getProductById(id) {
  return PRODUCTS.find(p => p.id === Number(id)) || null;
}
