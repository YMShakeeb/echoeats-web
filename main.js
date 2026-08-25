/* ============================================================
   EchoEats — Main JavaScript
   ============================================================ */

/* ── TOAST NOTIFICATION ── */
function showToast(message, type) {
  var existing = document.querySelector('.ee-toast');
  if (existing) existing.remove();
  var toast = document.createElement('div');
  toast.className = 'ee-toast';
  toast.textContent = message;
  toast.style.cssText = 'position:fixed;bottom:32px;left:50%;transform:translateX(-50%) translateY(80px);background:' + (type === 'warning' ? '#1a1a1a' : 'var(--green-800, #1a4a26)') + ';color:white;padding:14px 28px;border-radius:100px;font-size:14px;font-weight:600;font-family:inherit;box-shadow:0 8px 32px rgba(0,0,0,0.25);z-index:9999;transition:transform 0.4s cubic-bezier(0.34,1.56,0.64,1);white-space:nowrap;border:1px solid ' + (type === 'warning' ? '#444' : 'var(--green-600, #166534)') + ';';
  document.body.appendChild(toast);
  requestAnimationFrame(function () { toast.style.transform = 'translateX(-50%) translateY(0)'; });
  setTimeout(function () {
    toast.style.transform = 'translateX(-50%) translateY(80px)';
    setTimeout(function () { if (toast.parentNode) toast.remove(); }, 400);
  }, 3500);
}

/* ── DEMAND MULTIPLIER ENGINE ──────────────────────────────────────────────
   Demand is tracked via localStorage key 'ee_demand' which stores an object
   mapping itemId → { views, reservations, lastView }.
   DemandMultiplier = clamp( reservations/views ratio → slow decay when hot )
   High demand  → multiplier close to 1.0  (price drops slowly)
   Low demand   → multiplier close to 0.65 (price drops faster to clear stock)
   ────────────────────────────────────────────────────────────────────────── */
var EE_DEMAND_KEY = 'ee_demand';

function getDemandData() {
  try { return JSON.parse(localStorage.getItem(EE_DEMAND_KEY)) || {}; }
  catch (e) { return {}; }
}

function saveDemandData(data) {
  try { localStorage.setItem(EE_DEMAND_KEY, JSON.stringify(data)); } catch (e) { }
}

/* Record a page-view for an item (called on listings page load) */
function recordView(itemId) {
  if (!itemId) return;
  var data = getDemandData();
  if (!data[itemId]) data[itemId] = { views: 0, reservations: 0 };
  data[itemId].views++;
  data[itemId].lastView = Date.now();
  saveDemandData(data);
}

/* Record a reservation (called when user confirms payment) */
function recordReservation(itemId) {
  if (!itemId) return;
  var data = getDemandData();
  if (!data[itemId]) data[itemId] = { views: 0, reservations: 0 };
  data[itemId].reservations++;
  saveDemandData(data);
}

/* Compute DemandMultiplier for an itemId.
   Formula: DemandMultiplier = 0.65 + 0.35 * conversionRate
   where conversionRate = min(1, reservations / max(1, views) * 20)
   → 0 reservations out of many views  → 0.65 (drop faster)
   → 5+ reservations out of any views  → 1.00 (drop slower, high demand)
*/
function getDemandMultiplier(itemId) {
  if (!itemId) return 0.85; // neutral default
  var data = getDemandData();
  var d = data[itemId] || { views: 0, reservations: 0 };
  var views = Math.max(1, d.views);
  var conversionRate = Math.min(1, (d.reservations / views) * 20);
  return 0.65 + 0.35 * conversionRate;
}

/* Compute final Price(t) using the full formula:
   Price(t) = BasePrice × DecayFunction(t) × DemandMultiplier
   t = fraction of time remaining (1.0 at start → 0.0 at expiry)   */
function computePrice(base, floor, curve, elapsedMinutes, totalMinutes, itemId) {
  var t = Math.max(0, 1 - elapsedMinutes / totalMinutes); // time-remaining fraction
  var decay;
  if (curve === 'linear') {
    decay = t;
  } else if (curve === 'exponential') {
    // Holds price well then drops sharply in last 20% of time
    decay = t < 0.2 ? t * 2 : 0.4 + (t - 0.2) * 0.75;
  } else { // stepped
    decay = t > 0.75 ? 0.9 : t > 0.5 ? 0.7 : t > 0.25 ? 0.5 : 0.3;
  }
  var demandMult = getDemandMultiplier(itemId);
  var rawPrice = base * decay * demandMult;
  return Math.max(floor, rawPrice);
}

/* ── RESERVE BUTTON (global) ── */
function reserveItem(btn, name) {
  var orig = btn.textContent;
  btn.textContent = '✓ Reserved!';
  btn.style.background = 'var(--green-400)';
  btn.style.color = 'var(--dark)';
  btn.disabled = true;
  showToast('🎉 "' + name + '" reserved! Pick up within 15 minutes.');
  setTimeout(function () {
    btn.textContent = orig;
    btn.style.background = '';
    btn.style.color = '';
    btn.disabled = false;
  }, 4000);
}

/* ── VENDOR SIGNUP (global) ── */
function vendorSignup(btn) {
  var form = btn.closest('.vendor-cta-form');
  var inputs = form.querySelectorAll('.form-input, .form-select');
  var valid = true;
  inputs.forEach(function (input) {
    if (!input.value.trim()) { input.style.borderColor = 'var(--red)'; valid = false; }
    else { input.style.borderColor = 'var(--green-400)'; }
  });
  if (!valid) { showToast('⚠️ Please fill in all fields to continue.', 'warning'); return; }
  btn.textContent = '✓ Application Received!';
  btn.style.background = 'var(--green-400)';
  btn.disabled = true;
  showToast('🚀 Welcome to EchoEats! We\'ll be in touch within 24 hours.');
}

/* ── WALLET CREDIT (store credit balance) ──────────────────────────────────
   Stored per-user on the ee_users record as `creditBalance` (a number, in
   dollars). Used when a paid order is cancelled within its 3-minute window —
   instead of a real refund, the amount is added to the user's site credit,
   redeemable on future orders.
   ────────────────────────────────────────────────────────────────────────── */
function getCurrentUserEmail() {
  try {
    var raw = localStorage.getItem('ee_current_user');
    if (!raw) return null;
    return JSON.parse(raw).email || null;
  } catch (e) { return null; }
}

function getCreditBalance(email) {
  if (!email) return 0;
  try {
    var users = JSON.parse(localStorage.getItem('ee_users') || '[]');
    var u = users.find(function (u) { return u.email === email; });
    return (u && typeof u.creditBalance === 'number') ? u.creditBalance : 0;
  } catch (e) { return 0; }
}

/* Adds `amount` dollars to the given user's credit balance. Returns the new balance. */
function addCreditBalance(email, amount) {
  if (!email || !amount) return getCreditBalance(email);
  var users = [];
  try { users = JSON.parse(localStorage.getItem('ee_users') || '[]'); } catch (e) { }
  var u = users.find(function (u) { return u.email === email; });
  if (!u) return 0; // no matching user record — nothing to credit
  u.creditBalance = (typeof u.creditBalance === 'number' ? u.creditBalance : 0) + amount;
  localStorage.setItem('ee_users', JSON.stringify(users));
  return u.creditBalance;
}

/* Deducts `amount` dollars from the given user's credit balance (floored at 0). */
function spendCreditBalance(email, amount) {
  if (!email || !amount) return getCreditBalance(email);
  var users = [];
  try { users = JSON.parse(localStorage.getItem('ee_users') || '[]'); } catch (e) { }
  var u = users.find(function (u) { return u.email === email; });
  if (!u) return 0;
  u.creditBalance = Math.max(0, (typeof u.creditBalance === 'number' ? u.creditBalance : 0) - amount);
  localStorage.setItem('ee_users', JSON.stringify(users));
  return u.creditBalance;
}

/* ── ITEM DETAIL DATA (for listing → item-detail.html navigation) ── */
var EE_ITEM_DETAILS = {
  'coffee-cake': { name: 'Coffee + Cake Bundle', vendor: 'Café Saffron', area: 'Manama', dist: '0.2km', description: 'A cozy end-of-day bundle from Café Saffron — a rich espresso-based coffee paired with a slice of their signature homemade cake. Made fresh this morning and pulled from the display case before closing.', address: 'Café Saffron, Manama, Bahrain', lat: 26.23329, lng: 50.59169 },
  'croissant-box': { name: 'Croissant Box × 4', vendor: 'Patisserie Nour', area: 'Manama', dist: '0.3km', description: 'Four buttery, flaky croissants baked this morning at Patisserie Nour. Perfect for breakfast tomorrow — just a day away from being tossed, but still soft and fresh.', address: 'Patisserie Nour, Manama, Bahrain', lat: 26.23355, lng: 50.58145 },
  'pizza-margherita': { name: 'Pizza Margherita (whole)', vendor: 'Pizzeria Roma', area: 'Manama', dist: '0.6km', description: 'A whole wood-fired Margherita pizza from Pizzeria Roma, made with San Marzano tomatoes, fresh mozzarella and basil. Extra from tonight\'s dinner service.', address: 'Pizzeria Roma, Manama, Bahrain', lat: 26.22761, lng: 50.59097 },
  'sushi-platter': { name: 'Sushi Salmon & California Roll Platter (8 pcs)', vendor: 'Sakura Kitchen', area: 'Manama', dist: '0.8km', description: 'Eight pieces of salmon nigiri and California rolls from Sakura Kitchen, prepared today with fresh fish. Best enjoyed within the pickup window.', address: 'Sakura Kitchen, Manama, Bahrain', lat: 26.22845, lng: 50.58454 },
  'mezze-platter': { name: 'Mezze Platter', vendor: 'Green Bowl', area: 'Manama', dist: '0.5km', description: 'A generous vegan mezze spread from Green Bowl — hummus, moutabal, tabbouleh, olives and warm pita. Last one from today\'s lunch prep.', address: 'Green Bowl, Manama, Bahrain', lat: 26.23274, lng: 50.58115 },
  'sourdough-loaf': { name: 'Sourdough Loaf', vendor: 'Daily Bread', area: 'Manama', dist: '1.1km', description: 'A naturally leavened sourdough loaf, baked this morning at Daily Bread using a 5-year-old starter. Slightly firmer crust by evening but perfect for toasting.', address: 'Daily Bread, Manama, Bahrain', lat: 26.22486, lng: 50.58328 },
  'grilled-chicken': { name: 'Grilled Chicken Meal', vendor: 'Al Waha Grill', area: 'Manama', dist: '0.7km', description: 'A hearty grilled chicken meal with rice and grilled vegetables from Al Waha Grill — today\'s lunch special, one portion left.', address: 'Al Waha Grill, Manama, Bahrain', lat: 26.22742, lng: 50.58186 },
  'avocado-bowl': { name: 'Avocado Grain Bowl', vendor: 'Blossom Kitchen', area: 'Manama', dist: '0.9km', description: 'A fresh grain bowl with avocado, quinoa, roasted chickpeas and tahini dressing from Blossom Kitchen. Made in-house today.', address: 'Blossom Kitchen, Manama, Bahrain', lat: 26.23269, lng: 50.58857 },
  'cupcake-box': { name: 'Cupcake Box (6 pcs)', vendor: 'Sugar & Spice', area: 'Manama', dist: '0.4km', description: 'Six assorted cupcakes with buttercream frosting from Sugar & Spice, baked this morning for today\'s counter display.', address: 'Sugar & Spice, Manama, Bahrain', lat: 26.22857, lng: 50.58043 },
  'lamb-kofta': { name: 'Lamb Kofta Platter', vendor: 'Sultan\'s Table', area: 'Manama', dist: '1.2km', description: 'A generous lamb kofta platter with rice, grilled vegetables and garlic sauce from Sultan\'s Table — extra portions from tonight\'s service.', address: 'Sultan\'s Table, Manama, Bahrain', lat: 26.23413, lng: 50.59189 },
  'veggie-ramen': { name: 'Veggie Ramen Bowl', vendor: 'Lotus Noodle', area: 'Manama', dist: '1.4km', description: 'A warm bowl of vegan ramen with miso broth, tofu and seasonal vegetables from Lotus Noodle. Freshly prepared today.', address: 'Lotus Noodle, Manama, Bahrain', lat: 26.23136, lng: 50.5869 },
  'falafel-wrap': { name: 'Falafel Wrap Combo', vendor: 'Wrap & Roll', area: 'Manama', dist: '0.5km', description: 'A falafel wrap combo with hummus, pickles and fries from Wrap & Roll — made fresh for today\'s lunch rush, one left.', address: 'Wrap & Roll, Manama, Bahrain', lat: 26.23138, lng: 50.59183 },
  'machboos-muharraq': { name: 'Chicken Machboos', vendor: 'Al Muharraq Kitchen', area: 'Muharraq', dist: '4.2km', description: 'Traditional Bahraini chicken machboos with spiced rice, from Al Muharraq Kitchen\'s family recipe — made fresh this afternoon.', address: 'Al Muharraq Kitchen, Muharraq, Bahrain', lat: 26.25683, lng: 50.60972 },
  'luqaimat-muharraq': { name: 'Luqaimat Box (12 pcs)', vendor: 'Bait Al Halwa', area: 'Muharraq', dist: '4.5km', description: 'A box of 12 golden, crispy luqaimat drizzled with date syrup from Bait Al Halwa. A local sweet treat made today.', address: 'Bait Al Halwa, Muharraq, Bahrain', lat: 26.26058, lng: 50.61542 },
  'shawarma-riffa': { name: 'Shawarma Party Box', vendor: 'Riffa Grill House', area: 'Riffa', dist: '9.1km', description: 'A party box of mixed shawarma wraps from Riffa Grill House, perfect for sharing — extra from today\'s catering order.', address: 'Riffa Grill House, Riffa, Bahrain', lat: 26.13487, lng: 50.55921 },
  'salad-hamad': { name: 'Power Salad Bowl', vendor: 'Fresh Co. Hamad', area: 'Hamad Town', dist: '11.3km', description: 'A protein-packed power salad with grilled veggies, quinoa and a citrus vinaigrette from Fresh Co. Hamad.', address: 'Fresh Co. Hamad, Hamad Town, Bahrain', lat: 26.11583, lng: 50.50937 },
  'biryani-hamad': { name: 'Lamb Biryani (family)', vendor: 'Spice Route', area: 'Hamad Town', dist: '11.8km', description: 'A family-size lamb biryani with fragrant basmati rice and slow-cooked lamb from Spice Route — today\'s signature dish.', address: 'Spice Route, Hamad Town, Bahrain', lat: 26.12251, lng: 50.51345 },
  'pastries-isa': { name: 'Mix Pastries', vendor: 'Isa Town Bakery', area: 'Isa Town', dist: '8.6km', description: 'An assorted box of fresh pastries from Isa Town Bakery, baked this morning — croissants, danishes and more.', address: 'Isa Town Bakery, Isa Town, Bahrain', lat: 26.16834, lng: 50.54339 },
  'fish-sitra': { name: 'Grilled Hammour Fillet', vendor: 'Sitra Fish Market', area: 'Sitra', dist: '6.4km', description: 'Freshly grilled hammour fillet from Sitra Fish Market, caught locally and grilled today with lemon and spices.', address: 'Sitra Fish Market, Sitra, Bahrain', lat: 26.14452, lng: 50.61888 },
  'smoothie-budaiya': { name: 'Smoothie Bowl + Granola', vendor: 'Budaiya Juice Bar', area: 'Budaiya', dist: '7.2km', description: 'A refreshing smoothie bowl topped with house-made granola and fresh fruit from Budaiya Juice Bar.', address: 'Budaiya Juice Bar, Budaiya, Bahrain', lat: 26.21944, lng: 50.45149 },
  'burger-juffair': { name: 'Smash Burger Meal', vendor: 'Juffair Bites', area: 'Juffair', dist: '2.1km', description: 'A smash burger meal with fries from Juffair Bites — extra patties from tonight\'s dinner rush, last chance before close.', address: 'Juffair Bites, Juffair, Bahrain', lat: 26.21163, lng: 50.59742 },
  'poke-seef': { name: 'Tuna Poke Bowl', vendor: 'Seef Poke Bar', area: 'Seef', dist: '3.0km', description: 'A fresh tuna poke bowl with rice, edamame and sesame dressing from Seef Poke Bar, prepared today.', address: 'Seef Poke Bar, Seef, Bahrain', lat: 26.23606, lng: 50.53158 },
  'hummus-zinj': { name: 'Hummus & Pita Platter', vendor: 'Zinj Deli', area: 'Zinj', dist: '2.5km', description: 'A generous hummus and warm pita platter from Zinj Deli, made fresh with today\'s batch of chickpeas.', address: 'Zinj Deli, Zinj, Bahrain', lat: 26.21555, lng: 50.58794 },
};

/* ── DOM-READY SECTION ── */
document.addEventListener('DOMContentLoaded', function () {

  /* ── NAVBAR SCROLL EFFECT ── */
  var navbar = document.getElementById('navbar');
  if (navbar) {
    window.addEventListener('scroll', function () {
      navbar.classList.toggle('scrolled', window.scrollY > 20);
    });
  }

  /* ── SCROLL REVEAL ANIMATIONS ── */
  var revealEls = document.querySelectorAll('.reveal');
  if (revealEls.length) {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('visible'); observer.unobserve(e.target); }
      });
    }, { threshold: 0.12 });
    revealEls.forEach(function (el) { observer.observe(el); });
  }

  /* ── LIVE PRICE COUNTDOWN — now uses full Price(t) formula ── */
  var priceEls = document.querySelectorAll('.listing-price-current');
  var barEls = document.querySelectorAll('.decay-bar-fill');

  // Seed data for the homepage/listings demo cards
  var prices = [
    { base: 5.00, floor: 1.00, curve: 'exponential', expMin: 45, itemId: 'coffee-cake' },
    { base: 6.00, floor: 1.50, curve: 'exponential', expMin: 80, itemId: 'croissant-box' },
    { base: 8.00, floor: 2.00, curve: 'linear', expMin: 120, itemId: 'sourdough-loaf' },
    { base: 18.0, floor: 4.00, curve: 'stepped', expMin: 100, itemId: 'sushi-platter' },
    { base: 10.0, floor: 3.00, curve: 'linear', expMin: 180, itemId: 'mezze-platter' },
    { base: 7.50, floor: 2.00, curve: 'exponential', expMin: 60, itemId: 'falafel-wrap' },
  ];

  if (priceEls.length) {
    // Record a page-view for each visible listing item
    prices.forEach(function (p) { recordView(p.itemId); });

    setInterval(function () {
      prices.forEach(function (p, i) {
        if (!priceEls[i]) return;
        var elapsed = ((Date.now() / 1000) % (p.expMin * 60)) / 60; // simulated elapsed minutes
        var price = computePrice(p.base, p.floor, p.curve, elapsed, p.expMin, p.itemId);
        priceEls[i].textContent = '$' + price.toFixed(2);
        var fraction = elapsed / p.expMin;
        if (fraction > 0.7) priceEls[i].style.color = 'var(--orange)';
        if (barEls[i]) barEls[i].style.width = Math.min(98, 15 + fraction * 85) + '%';
      });
    }, 3000);
  }

  /* ── HERO PHOTO SCREEN OVERLAY — live clock + price sync + navigation ──────
     Real, coded UI layered over the blank-screen stock photo, so it's crisp
     text (not a flattened image) and genuinely interactive, not just a
     clickable zone. Prices reuse the same Price(t) formula/itemIds as the
     "Live Listings Demo" cards further down, so numbers stay in sync. ───── */
  var phoneMockTime = document.getElementById('phoneMockTime');
  if (phoneMockTime) {
    var updatePhoneClock = function () {
      var d = new Date();
      var h = d.getHours() % 12 || 12;
      var m = ('0' + d.getMinutes()).slice(-2);
      phoneMockTime.textContent = h + ':' + m;
    };
    updatePhoneClock();
    setInterval(updatePhoneClock, 30000);
  }

  var phonePriceEls = document.querySelectorAll('.phone-price-live');
  if (phonePriceEls.length) {
    var phonePriceMap = {
      'croissant-box': { base: 6.00, floor: 1.50, curve: 'exponential', expMin: 80 },
      'sushi-platter': { base: 18.0, floor: 4.00, curve: 'stepped', expMin: 100 },
      'sourdough-loaf': { base: 8.00, floor: 2.00, curve: 'linear', expMin: 120 }
    };
    var updatePhonePrices = function () {
      phonePriceEls.forEach(function (el) {
        var p = phonePriceMap[el.getAttribute('data-item-id')];
        if (!p) return;
        var elapsed = ((Date.now() / 1000) % (p.expMin * 60)) / 60;
        var price = computePrice(p.base, p.floor, p.curve, elapsed, p.expMin, el.getAttribute('data-item-id'));
        el.textContent = '$' + price.toFixed(2);
      });
    };
    updatePhonePrices();
    setInterval(updatePhonePrices, 3000);
  }

  // Guaranteed-stable fallback photo per phone-mockup item. The mockup's own
  // <img> tags hotlink Unsplash photos with their own onerror handling (left
  // untouched here), but that means the src the click handler sees can be a
  // dead link that never got swapped out (e.g. an onerror that only hides the
  // image, like sourdough's) or one that hasn't been swapped out *yet* if the
  // image is still mid-load when the user clicks (a race, e.g. sushi's).
  // Either way item-detail.html would inherit a broken URL and show nothing.
  // Falling back to these known-good images guarantees item-detail.html
  // always has something real to display, regardless of the live state of
  // the mockup's own image element.
  var EE_PHONE_CARD_FALLBACK_IMG = {
    'croissant-box': 'https://picsum.photos/seed/croissant-box/500/300',
    'sushi-platter': 'https://picsum.photos/seed/sushi/500/300',
    'sourdough-loaf': 'https://picsum.photos/seed/bread-loaf/500/300'
  };

  // Full catalog (mirrors every card on listings.html) so the hero phone's
  // search bar can actually search the whole menu instead of only the 3
  // "Expiring soon" demo cards. Kept as plain data — no fetch/build step —
  // so the mockup stays a static, fast-loading part of the homepage.
  var EE_FULL_CATALOG = [
    { id: 'coffee-cake', name: 'Coffee + Cake Bundle', vendor: 'Café Saffron · 0.2km', price: '2.75', was: '5.00', timer: '30m', img: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=120&q=80&fit=crop&auto=format' },
    { id: 'croissant-box', name: 'Croissant x4', vendor: 'Patisserie Nour · 0.3km', price: '2.50', was: '6.00', timer: '45m', img: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=120&q=80&fit=crop&auto=format' },
    { id: 'pizza-margherita', name: 'Pizza Margherita (whole)', vendor: 'Pizzeria Roma · 0.6km', price: '5.00', was: '10.00', timer: '1h', img: 'https://picsum.photos/seed/pizza-margherita/120/120' },
    { id: 'sushi-platter', name: 'Sushi Salmon & California Roll (8 pcs)', vendor: 'Sakura Kitchen · 0.8km', price: '8.00', was: '18.00', timer: '1h 20m', img: 'https://images.unsplash.com/photo-1579584425555-c3ce17fd4351?w=120&q=80&fit=crop&auto=format' },
    { id: 'mezze-platter', name: 'Mezze Platter', vendor: 'Green Bowl · 0.5km', price: '6.00', was: '10.00', timer: '3h', img: 'https://picsum.photos/seed/mezze-platter/120/120' },
    { id: 'sourdough-loaf', name: 'Sourdough Loaf', vendor: 'Daily Bread · 1.1km', price: '3.50', was: '8.00', timer: '2h', img: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=120&q=80&fit=crop&auto=format' },
    { id: 'grilled-chicken', name: 'Grilled Chicken Meal', vendor: 'Al Waha Grill · 0.7km', price: '7.00', was: '12.00', timer: '1.5h', img: 'https://images.unsplash.com/photo-1598515214211-89d3c73ae83b?w=120&q=80&fit=crop&auto=format' },
    { id: 'avocado-bowl', name: 'Avocado Grain Bowl', vendor: 'Blossom Kitchen · 0.9km', price: '4.50', was: '7.00', timer: '2.5h', img: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=120&q=80&fit=crop&auto=format' },
    { id: 'cupcake-box', name: 'Cupcake Box (6 pcs)', vendor: 'Sugar & Spice · 0.4km', price: '3.00', was: '8.00', timer: '50m', img: 'https://images.unsplash.com/photo-1486427944299-d1955d23e34d?w=120&q=80&fit=crop&auto=format' },
    { id: 'lamb-kofta', name: 'Lamb Kofta Platter', vendor: "Sultan's Table · 1.2km", price: '9.00', was: '15.00', timer: '1h 40m', img: 'https://picsum.photos/seed/lamb-kofta/120/120' },
    { id: 'veggie-ramen', name: 'Veggie Ramen Bowl', vendor: 'Lotus Noodle · 1.4km', price: '5.50', was: '8.00', timer: '3.5h', img: 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=120&q=80&fit=crop&auto=format' },
    { id: 'falafel-wrap', name: 'Falafel Wrap Combo', vendor: 'Wrap & Roll · 0.5km', price: '4.00', was: '7.50', timer: '1h 10m', img: 'https://images.unsplash.com/photo-1562059390-a761a084768e?w=120&q=80&fit=crop&auto=format' },
    { id: 'machboos-muharraq', name: 'Chicken Machboos', vendor: 'Al Muharraq Kitchen · 4.2km', price: '5.50', was: '10.00', timer: '55m', img: 'https://picsum.photos/seed/machboos-muharraq/120/120' },
    { id: 'luqaimat-muharraq', name: 'Luqaimat Box (12 pcs)', vendor: 'Bait Al Halwa · 4.5km', price: '2.00', was: '5.00', timer: '40m', img: 'https://picsum.photos/seed/luqaimat-muharraq/120/120' },
    { id: 'shawarma-riffa', name: 'Shawarma Party Box', vendor: 'Riffa Grill House · 9.1km', price: '8.50', was: '15.00', timer: '1h 50m', img: 'https://picsum.photos/seed/shawarma-riffa/120/120' },
    { id: 'salad-hamad', name: 'Power Salad Bowl', vendor: 'Fresh Co. Hamad · 11.3km', price: '4.00', was: '6.50', timer: '2h 40m', img: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=120&q=80&fit=crop&auto=format' },
    { id: 'biryani-hamad', name: 'Lamb Biryani (family)', vendor: 'Spice Route · 11.8km', price: '6.50', was: '12.50', timer: '1h 15m', img: 'https://picsum.photos/seed/biryani-hamad/120/120' },
    { id: 'pastries-isa', name: 'Mix Pastries', vendor: 'Isa Town Bakery · 8.6km', price: '3.50', was: '7.00', timer: '1.5h', img: 'https://picsum.photos/seed/pastries-isa/120/120' },
    { id: 'fish-sitra', name: 'Grilled Hammour Fillet', vendor: 'Sitra Fish Market · 6.4km', price: '7.00', was: '15.00', timer: '1h 5m', img: 'https://picsum.photos/seed/fish-sitra/120/120' },
    { id: 'smoothie-budaiya', name: 'Smoothie Bowl + Granola', vendor: 'Budaiya Juice Bar · 7.2km', price: '3.00', was: '5.00', timer: '2h 10m', img: 'https://picsum.photos/seed/smoothie-budaiya/120/120' },
    { id: 'burger-juffair', name: 'Smash Burger Meal', vendor: 'Juffair Bites · 2.1km', price: '4.50', was: '10.00', timer: '35m', img: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=120&q=80&fit=crop&auto=format' },
    { id: 'poke-seef', name: 'Tuna Poke Bowl', vendor: 'Seef Poke Bar · 3.0km', price: '6.00', was: '12.00', timer: '50m', img: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=120&q=80&fit=crop&auto=format' },
    { id: 'hummus-zinj', name: 'Hummus & Pita Platter', vendor: 'Zinj Deli · 2.5km', price: '2.50', was: '4.00', timer: '2h 20m', img: 'https://picsum.photos/seed/hummus-zinj/120/120' }
  ];

  var phoneMockSearchForm = document.getElementById('phoneMockSearchForm');
  var phoneMockSearch = document.getElementById('phoneMockSearch');
  var phoneMockCardsWrap = document.getElementById('phoneMockCardsWrap');
  var phoneMockLabel = document.getElementById('phoneMockLabel');
  if (phoneMockSearchForm && phoneMockSearch && phoneMockCardsWrap) {
    var phoneMockDefaultHTML = phoneMockCardsWrap.innerHTML;

    var escapeHtml = function (s) {
      return String(s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    };

    var renderPhoneCard = function (item) {
      return '<button class="phone-photo-card" data-item-id="' + item.id + '">' +
        '<img src="' + item.img + '" alt="' + escapeHtml(item.name) + '" loading="lazy" ' +
        'onerror="this.onerror=null;this.src=\'https://picsum.photos/seed/' + item.id + '/120/120\'">' +
        '<span class="ppc-info">' +
        '<span class="ppc-name">' + escapeHtml(item.name) + '</span>' +
        '<span class="ppc-vendor">' + escapeHtml(item.vendor) + '</span>' +
        '<span class="ppc-bottom">' +
        '<span class="ppc-price">$' + item.price + '</span>' +
        '<span class="ppc-was">$' + item.was + '</span>' +
        '<span class="ppc-timer">⏱ ' + item.timer + '</span>' +
        '</span></span></button>';
    };

    // Search the entire catalog (every item on listings.html), not just the
    // 3 "Expiring soon" demo cards, so the hero search bar behaves like a
    // real search. Matches by name or vendor, live as the user types.
    phoneMockSearch.addEventListener('input', function () {
      var q = phoneMockSearch.value.trim().toLowerCase();

      if (!q) {
        phoneMockCardsWrap.innerHTML = phoneMockDefaultHTML;
        if (phoneMockLabel) phoneMockLabel.textContent = 'Expiring soon 🔥';
        bindPhoneCardClicks();
        return;
      }

      var matches = EE_FULL_CATALOG.filter(function (item) {
        return item.name.toLowerCase().indexOf(q) > -1 || item.vendor.toLowerCase().indexOf(q) > -1;
      }).slice(0, 5);

      if (phoneMockLabel) {
        phoneMockLabel.textContent = matches.length
          ? matches.length + ' result' + (matches.length === 1 ? '' : 's') + ' for "' + phoneMockSearch.value.trim() + '"'
          : 'No matches for "' + phoneMockSearch.value.trim() + '"';
      }

      phoneMockCardsWrap.innerHTML = matches.map(renderPhoneCard).join('');
      bindPhoneCardClicks();
    });

    // Pressing Enter (or tapping the search/go key on mobile) hands off to
    // the real search experience on listings.html, carrying the query along.
    phoneMockSearchForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var q = phoneMockSearch.value.trim();
      window.location.href = 'listings.html' + (q ? '?q=' + encodeURIComponent(q) : '');
    });
  }

  // (Re-)binds click-to-item-detail behavior to every card currently inside
  // the phone mockup. Called once on load and again each time search
  // results replace the card markup, since innerHTML swaps drop listeners.
  function bindPhoneCardClicks() {
    document.querySelectorAll('.phone-photo-card[data-item-id]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var itemId = btn.getAttribute('data-item-id');
        if (!itemId) return;

        // Cache this card's image/price too, same as the listings.html cards,
        // so item-detail.html doesn't fall back to the placeholder plate icon
        // and blank price when navigating from the hero phone mockup.
        try {
          var imgEl = btn.querySelector('img');
          var priceEl = btn.querySelector('.ppc-price');
          var wasEl = btn.querySelector('.ppc-was');

          // Only trust the mockup's live image if it actually finished loading
          // successfully and is still visible; otherwise use the stable
          // fallback so the item's photo never silently goes missing later.
          var liveSrc = null;
          if (imgEl && imgEl.getAttribute('src') && imgEl.naturalWidth > 0 &&
            imgEl.style.display !== 'none') {
            liveSrc = imgEl.getAttribute('src');
            // The mockup's <img> only needs a 38x38 thumbnail, so its src is
            // requested at w=120 — plenty sharp there, but item-detail.html
            // shows this same URL as a full-width hero image, and a 120px
            // source stretched that wide is what was reading as "blurry".
            // Re-request the same Unsplash photo at hero resolution instead
            // of reusing the thumbnail URL as-is.
            if (/images\.unsplash\.com/.test(liveSrc)) {
              liveSrc = liveSrc.replace(/([?&])w=\d+/, '$1w=900');
            }
          }

          var meta = {
            priceCurrent: priceEl ? priceEl.textContent.replace('$', '').trim() : null,
            priceWas: wasEl ? wasEl.textContent.replace('$', '').trim() : null,
            discount: null,
            img: liveSrc || EE_PHONE_CARD_FALLBACK_IMG[itemId] || null,
            tags: []
          };
          sessionStorage.setItem('ee_last_card_meta_' + itemId, JSON.stringify(meta));
        } catch (e) { }

        window.location.href = 'item-detail.html?item=' + encodeURIComponent(itemId);
      });
    });
  }
  bindPhoneCardClicks();

  /* ── CLICKABLE LISTING CARDS → item-detail.html ──────────────────────────
     Clicking anywhere on a .listing-card (except the Reserve button) opens
     the item's detail page, which shows a description and a map of the
     vendor's location. Each card also gets a small "Click here to know
     more →" hint appended to its body.
     ────────────────────────────────────────────────────────────────────── */
  document.querySelectorAll('.listing-card[data-item-id]').forEach(function (card) {
    var body = card.querySelector('.listing-body');
    if (body && !body.querySelector('.listing-more-hint')) {
      var hint = document.createElement('div');
      hint.className = 'listing-more-hint';
      hint.innerHTML = 'Click here to know more <span class="listing-more-arrow">&rarr;</span>';
      body.appendChild(hint);
    }
    card.style.cursor = 'pointer';
    card.addEventListener('click', function (e) {
      if (e.target.closest('.listing-reserve-btn')) return; // Reserve has its own handler
      var itemId = card.getAttribute('data-item-id');
      if (!itemId) return;

      // Cache this card's live price/tags/image so item-detail.html can show
      // matching info without re-deriving the demand/decay math.
      try {
        var priceEl = card.querySelector('.listing-price-current');
        var wasEl = card.querySelector('.listing-price-was');
        var discountEl = card.querySelector('.listing-discount');
        var imgEl = card.querySelector('.food-photo');
        var tagEls = card.querySelectorAll('.listing-tag');
        var meta = {
          priceCurrent: priceEl ? priceEl.textContent.replace('$', '').trim() : null,
          priceWas: wasEl ? wasEl.textContent.replace('$', '').trim() : null,
          discount: discountEl ? discountEl.textContent.replace(/[-%]/g, '').trim() : null,
          img: imgEl ? imgEl.getAttribute('src') : null,
          tags: Array.prototype.map.call(tagEls, function (t) { return t.textContent.trim(); })
        };
        sessionStorage.setItem('ee_last_card_meta_' + itemId, JSON.stringify(meta));
      } catch (e) { }

      window.location.href = 'item-detail.html?item=' + encodeURIComponent(itemId);
    });
  });

  /* ── SMOOTH ACTIVE NAV LINK ── */
  var sections = document.querySelectorAll('section[id]');
  var navLinks = document.querySelectorAll('.nav-links a');
  if (sections.length && navLinks.length) {
    window.addEventListener('scroll', function () {
      var current = '';
      sections.forEach(function (sec) { if (window.scrollY >= sec.offsetTop - 100) current = sec.id; });
      navLinks.forEach(function (a) { a.classList.toggle('active', a.getAttribute('href') === '#' + current); });
    });
  }

  /* ── BADGE HOVER ── */
  document.querySelectorAll('.badge-item:not(.locked)').forEach(function (badge) {
    badge.addEventListener('click', function () {
      var nameEl = badge.querySelector('.badge-name');
      if (nameEl) showToast('🏅 Badge unlocked: "' + nameEl.textContent + '"!');
    });
  });

  /* ── AUTH-AWARE NAVBAR ── */
  var raw = localStorage.getItem('ee_current_user');
  if (raw) {
    try {
      var user = JSON.parse(raw);
      var cta = document.querySelector('.nav-cta');
      if (cta && user) {
        var dashUrl = user.role === 'vendor' ? 'vendor-dashboard.html' : 'consumer-dashboard.html';
        var firstName = (user.name || 'Account').split(' ')[0];

        // Figure out which page we're currently on (works for nested paths too)
        var currentPage = window.location.pathname.split('/').pop() || 'index.html';
        var onOwnDashboard = currentPage === dashUrl;

        // While sitting on their own dashboard, swap "My Dashboard" for a
        // "Browse Deals" button with a little jumping arrow. Any other page
        // shows "My Dashboard" as usual.
        var actionBtnHtml = onOwnDashboard
          ? '<a href="listings.html" class="btn btn-primary btn-sm nav-browse-deals"><span class="jump-arrow">→</span> Browse Deals</a>'
          : '<a href="' + dashUrl + '" class="btn btn-primary btn-sm">My Dashboard</a>';

        cta.innerHTML = '<span class="nav-signin" style="font-weight:700;color:var(--green-700);cursor:default">👋 ' + firstName + '</span>' +
          actionBtnHtml +
          '<button class="btn btn-sm" style="background:var(--bg);color:var(--text-soft);border:1px solid var(--border);cursor:pointer" onclick="localStorage.removeItem(\'ee_current_user\');window.location.reload()">Sign Out</button>';
      }
    } catch (e) { }
  }

});
