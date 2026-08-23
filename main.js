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

        cta.innerHTML = '<a href="' + dashUrl + '" class="nav-signin" style="font-weight:700;color:var(--green-700)">👋 ' + firstName + '</a>' +
          actionBtnHtml +
          '<button class="btn btn-sm" style="background:var(--bg);color:var(--text-soft);border:1px solid var(--border);cursor:pointer" onclick="localStorage.removeItem(\'ee_current_user\');window.location.reload()">Sign Out</button>';
      }
    } catch (e) { }
  }

});