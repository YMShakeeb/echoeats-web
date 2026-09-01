/* ============================================================
   EchoEats — Main JavaScript
   ============================================================ */

/* ── THEME (light / dark / system) ───────────────────────────────────────
   Preference stored in localStorage as 'ee_theme': 'light' | 'dark' |
   'system' (default). Resolved to an actual 'light'/'dark' value and
   applied as data-theme on <html>, which style.css keys off of to swap
   the surface CSS variables (--bg, --white, --dark, --border, etc.) for
   their dark-mode equivalents.
   Applied immediately here — not inside DOMContentLoaded — so it takes
   effect as soon as this script runs. Each page also carries a tiny
   inline copy of this same resolve-and-apply logic at the very top of
   <head> (before the stylesheet), which is what actually prevents a
   flash of the wrong theme on load; this copy here is what keeps things
   in sync afterwards and reacts to OS-level scheme changes. ── */
function eeGetThemePref() {
  try { return localStorage.getItem('ee_theme') || 'system'; } catch (e) { return 'system'; }
}
function eeResolveTheme(pref) {
  if (pref === 'dark' || pref === 'light') return pref;
  return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
}
function eeApplyTheme(pref) {
  document.documentElement.setAttribute('data-theme', eeResolveTheme(pref));
}
function eeSetThemePref(pref) {
  try { localStorage.setItem('ee_theme', pref); } catch (e) { }
  eeApplyTheme(pref);
  eeSyncThemeToggleUI();
}
eeApplyTheme(eeGetThemePref());
if (window.matchMedia) {
  try {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
      if (eeGetThemePref() === 'system') eeApplyTheme('system');
    });
  } catch (e) { /* older Safari without addEventListener on MediaQueryList */ }
}

/* ── AVATAR COLOR (per-person, deterministic) ────────────────────────────
   Google sign-up already stamps an `avatarColor` onto the user object
   (see login.html / register.html completeGoogleAuth) but nothing ever
   read it back, so every initials-avatar just fell back to a single
   hardcoded green in CSS regardless of who was signed in. This is the one
   shared place that decides an avatar's color, used everywhere an
   initials-avatar renders (sidebar, Settings, Edit Profile, admin vendor
   list) so they can never drift out of sync with each other again.
   Priority: a stored avatarColor wins (keeps Google sign-ups exactly as
   they were); otherwise it's derived the same way — hashing the first
   letter of a name/business name/email into this fixed palette — so
   plain email/password accounts (which never got avatarColor stamped at
   signup) still get a stable color instead of falling through to plain
   green. Pass any person-like object: a consumer, a vendor, etc. */
/* ── MULTI-ROLE ACCOUNTS ──────────────────────────────────────────────
   One email = one ee_users record, but that record can hold more than
   one role (e.g. someone registers as a consumer, then later also
   registers as a vendor with the same email — that adds a vendor
   profile onto the same account rather than creating a second one).
   The real list of roles an account holds lives in `roles` (array).
   `role` is just "whichever role the CURRENT session is acting as" —
   set at login/registration time and swappable via the "Continue as…"
   chooser in login.html when an account holds more than one role.
   Older records only ever had a single `role` string, so eeUserRoles()
   falls back to treating that as roles:[role] when `roles` is absent. */
/* ── PASSWORD VISIBILITY TOGGLE ───────────────────────────────────────
   Used by the small eye button placed inside password fields (login,
   register, reset password) so users can check what they typed. ── */
var EE_ICON_EYE = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
var EE_ICON_EYE_OFF = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.9 17.9A10.6 10.6 0 0 1 12 20c-7 0-11-8-11-8a21.6 21.6 0 0 1 5.1-6.1M9.5 4.4A10.7 10.7 0 0 1 12 4c7 0 11 8 11 8a21.6 21.6 0 0 1-3.2 4.4M14.1 14.1a3 3 0 1 1-4.2-4.2"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

function eeTogglePasswordVisibility(btn) {
  var targetId = btn.getAttribute('data-target');
  var input = document.getElementById(targetId);
  if (!input) return;
  if (input.type === 'password') {
    input.type = 'text';
    btn.innerHTML = EE_ICON_EYE_OFF;
    btn.setAttribute('aria-label', 'Hide password');
  } else {
    input.type = 'password';
    btn.innerHTML = EE_ICON_EYE;
    btn.setAttribute('aria-label', 'Show password');
  }
}

function eeUserRoles(user) {
  if (!user) return [];
  if (Array.isArray(user.roles) && user.roles.length) return user.roles;
  return user.role ? [user.role] : [];
}
function eeUserHasRole(user, role) {
  return eeUserRoles(user).indexOf(role) !== -1;
}

var EE_AVATAR_COLORS = ['#4285f4', '#34a853', '#ea4335', '#fbbc05', '#9c27b0'];
function eeGetAvatarColor(person) {
  if (person && person.avatarColor) return person.avatarColor;
  var seed = (person && (person.businessName || person.name || person.email)) || '?';
  var code = seed.trim().charAt(0).toUpperCase().charCodeAt(0) || 0;
  return EE_AVATAR_COLORS[code % EE_AVATAR_COLORS.length];
}

/* ── DATE-OF-BIRTH MANUAL ENTRY (DD/MM/YYYY) ─────────────────────────────
   Native <input type="date"> forces users into the browser's own calendar
   popup, which is painful for anyone paging back decades to an older
   birth year. This is a single plain text field the user just types
   into directly — "<baseId>" is its id — implemented as a fixed input
   mask: the field always displays the full "DD/MM/YYYY" template, the
   "/" separators are permanent and never disappear, and only the D/M/Y
   placeholder letters get replaced — one at a time, left to right — by
   the digits the user types. Backspace removes the most recently typed
   digit and restores its placeholder letter. Typing, backspace, and
   paste are all handled via 'beforeinput' so the browser never inserts
   raw text itself — we fully own what the field displays.
   Shared across register.html, consumer-dashboard.html and
   vendor-dashboard.html. Function names are kept the same as before so
   the pages that already call them don't need to change. ── */
var DOB_TEMPLATE = ['D', 'D', '/', 'M', 'M', '/', 'Y', 'Y', 'Y', 'Y'];
var DOB_DIGIT_POS = [0, 1, 3, 4, 6, 7, 8, 9]; // template indices that hold digits

function buildDobDisplay(digits) {
  var chars = DOB_TEMPLATE.slice();
  for (var i = 0; i < digits.length && i < DOB_DIGIT_POS.length; i++) {
    chars[DOB_DIGIT_POS[i]] = digits[i];
  }
  return chars.join('');
}
function dobCaretPos(digits) {
  return digits.length < 8 ? DOB_DIGIT_POS[digits.length] : 10;
}
function populateDobSelects(baseId) {
  var input = document.getElementById(baseId);
  if (!input || input.dataset.dobBound) return;
  input.dataset.dobBound = '1';
  input.setAttribute('inputmode', 'numeric');
  // No maxlength here on purpose: the field's displayed value is always
  // the full 10-char "DD/MM/YYYY" template, so a maxlength of 10 would
  // make the browser think the field is already full and silently block
  // every keystroke before our JS even runs. We cap input ourselves via
  // digits.slice(0, 8) instead.
  input.removeAttribute('maxlength');
  input.removeAttribute('placeholder'); // the template itself is now the visible value
  input.dataset.dobDigits = '';
  input.value = buildDobDisplay('');

  function render() {
    var digits = input.dataset.dobDigits || '';
    input.value = buildDobDisplay(digits);
    var caret = dobCaretPos(digits);
    input.setSelectionRange(caret, caret);
  }
  function placeCaret() { render(); }

  input.addEventListener('beforeinput', function (e) {
    e.preventDefault();
    var digits = input.dataset.dobDigits || '';
    var type = e.inputType || '';
    if (type.indexOf('insert') === 0) {
      var incoming = (e.data || (e.dataTransfer && e.dataTransfer.getData('text')) || '').replace(/\D/g, '');
      if (incoming) digits = (digits + incoming).slice(0, 8);
    } else if (type.indexOf('delete') === 0) {
      digits = digits.slice(0, -1);
    }
    input.dataset.dobDigits = digits;
    render();
  });
  // Fallback for the rare browser without 'beforeinput' support: undo
  // whatever the browser just inserted and re-derive digits normally.
  input.addEventListener('input', function (e) {
    if (typeof InputEvent !== 'undefined' && typeof InputEvent.prototype.getTargetRanges === 'function') return;
    var digits = (input.value.match(/\d/g) || []).join('').slice(0, 8);
    input.dataset.dobDigits = digits;
    render();
  });
  input.addEventListener('focus', placeCaret);
  input.addEventListener('click', placeCaret);
}

/* Reads the text field back out as a "YYYY-MM-DD" string (same format
   <input type="date"> produced), or '' if it isn't a fully-typed, valid
   date yet. Reads from the digits we've been tracking on the element
   rather than the displayed "DD/MM/YYYY"-templated text. */
function getDobValue(baseId) {
  var input = document.getElementById(baseId);
  if (!input) return '';
  var digits = input.dataset.dobDigits;
  if (digits === undefined) {
    // Field was never bound via populateDobSelects — fall back to
    // parsing the raw displayed value directly.
    var m = input.value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    digits = m ? (m[1] + m[2] + m[3]) : '';
  }
  if (digits.length !== 8) return '';
  var day = digits.slice(0, 2), month = digits.slice(2, 4), year = digits.slice(4, 8);
  var d = new Date(year + '-' + month + '-' + day);
  if (d.getFullYear() != year || (d.getMonth() + 1) != Number(month) || d.getDate() != Number(day)) return '';
  return year + '-' + month + '-' + day;
}

/* Sets the text field from a "YYYY-MM-DD" string (or clears it back to
   the bare "DD/MM/YYYY" template if given an empty/invalid value). */
function setDobValue(baseId, isoDate) {
  var input = document.getElementById(baseId);
  if (!input) return;
  var parts = (isoDate || '').split('-');
  var digits = parts.length === 3 ? (parts[2] + parts[1] + parts[0]) : '';
  input.dataset.dobDigits = digits;
  input.value = buildDobDisplay(digits);
}


/* ── SUPABASE SESSION CLEANUP ───────────────────────────────────────────────
   Supabase-js persists its own session token in localStorage under a key
   like "sb-<project-ref>-auth-token" — completely separate from EchoEats'
   own "ee_current_user" key. Signing out of EchoEats previously only ever
   cleared "ee_current_user", so that Supabase token was left behind and
   kept the browser "signed in" to Google forever, even across account
   deletion. This function is the single source of truth for nuking any
   Supabase session, and is safe to call from any page (it works purely
   off localStorage, so it doesn't need the supabase-js client to be
   loaded on that page). ── */
function clearSupabaseSession() {
  try {
    var keysToRemove = [];
    for (var i = 0; i < localStorage.length; i++) {
      var key = localStorage.key(i);
      if (key && /^sb-.*-auth-token$/.test(key)) keysToRemove.push(key);
    }
    keysToRemove.forEach(function (key) { localStorage.removeItem(key); });
    // Belt-and-suspenders: if a live supabase-js client happens to exist
    // on this page (e.g. login.html/register.html), also tell it to sign
    // out so its in-memory state matches localStorage.
    if (typeof supabaseClient !== 'undefined' && supabaseClient && supabaseClient.auth) {
      supabaseClient.auth.signOut().catch(function () { });
    }
  } catch (e) { /* localStorage unavailable — nothing we can do */ }
}

/* ── GOOGLE OAUTH ERROR MESSAGING ────────────────────────────────────────
   Supabase won't auto-link a Google identity to an account that already
   exists under a different provider (e.g. the email/password or OTP
   account created by manual sign-up) — it fails the OAuth exchange
   instead, for both sign-in AND sign-up. Turns Supabase's raw
   error_description into the one message that's actually true for every
   case we've seen this happen: the account exists another way, so
   Google can't be used for it (yet). Shared by login.html, register.html,
   and the stray-redirect catcher below so the wording is identical no
   matter where the error surfaces. */
function eeFriendlyOAuthErrorMessage(raw) {
  var msg = (raw || 'Google sign-in failed.').replace(/\+/g, ' ');
  if (/multiple accounts|already registered|already exists|already linked|already in use|already been registered/i.test(msg)) {
    return 'An account already exists with this email. Please sign in with your password instead.';
  }
  return '⚠️ ' + msg;
}

/* ── STRAY GOOGLE OAUTH ERROR CATCHER ────────────────────────────────────
   When the OAuth exchange above fails, Supabase can fail it server-side
   before ever reaching the page that started the flow (login.html or
   register.html) — instead it falls back to the project's default Site
   URL, landing the visitor on some other page entirely (usually the
   homepage) with ?error=... in the URL and no Google-specific script
   loaded to explain it. login.html/register.html handle the error
   themselves when it comes back to them directly; this is the same
   check for every other page, so a failed Google sign-in never just
   looks like "nothing happened" — it explains itself, then sends the
   visitor to sign in. Skipped on login.html/register.html themselves
   (both already handle this inline — detected by the #google-btn they
   share, rather than by `supabaseClient`, since main.js runs *before*
   their inline script defines that variable and would otherwise see it
   as undefined too and double up on the toast). */
(function () {
  if (document.getElementById('google-btn')) return;
  var params = new URLSearchParams(window.location.search);
  var hashParams = new URLSearchParams((window.location.hash || '').replace(/^#/, ''));
  var errDesc = params.get('error_description') || hashParams.get('error_description');
  var err = params.get('error') || hashParams.get('error');
  if (!err && !errDesc) return;
  var clean = window.location.origin + window.location.pathname;
  window.history.replaceState({}, document.title, clean);
  showToast(eeFriendlyOAuthErrorMessage(errDesc || err), 'warning');
  setTimeout(function () { window.location.href = 'login.html'; }, 2200);
})();

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
  showToast('🎉 "' + name + '" reserved! Head to the vendor to pick it up.');
  setTimeout(function () {
    btn.textContent = orig;
    btn.style.background = '';
    btn.style.color = '';
    btn.disabled = false;
  }, 4000);
}

/* ══════════════════════════════════════════════════════════════════
   SHOPPING CART (global) ─────────────────────────────────────────────
   A real running cart, stored in localStorage under 'ee_cart' as an
   array of { itemId, name, price, vendor, qty }. "Add to Cart" buttons
   on index.html / listings.html / item-detail.html push into this
   cart instead of checking out immediately. The cart icon + drawer
   live here in main.js since this file loads on every page, so the
   cart (and its item count badge) follows the user across the site.
   Checkout itself still happens on pages that have the payment modal
   (index.html, listings.html, item-detail.html) via the page-defined
   window.openCartCheckout(cart) hook; other pages redirect there.
   ══════════════════════════════════════════════════════════════════ */
var EE_CART_KEY = 'ee_cart';

function getCart() {
  try { return JSON.parse(localStorage.getItem(EE_CART_KEY)) || []; }
  catch (e) { return []; }
}

function saveCart(cart) {
  localStorage.setItem(EE_CART_KEY, JSON.stringify(cart));
  updateCartBadge();
  renderCartDrawerContents();
  syncCartControlsUI();
}

function cartCount() {
  return getCart().reduce(function (sum, line) { return sum + (line.qty || 1); }, 0);
}

function cartSubtotal() {
  return getCart().reduce(function (sum, line) { return sum + (line.price || 0) * (line.qty || 1); }, 0);
}

function isInCart(itemId) {
  if (!itemId) return false;
  return getCart().some(function (line) { return line.itemId === itemId; });
}

/* entry: { itemId, name, price (number), vendor, image } */
function addToCart(entry) {
  if (!entry || !entry.itemId) return getCart();
  var cart = getCart();
  var existing = cart.find(function (line) { return line.itemId === entry.itemId; });
  if (existing) {
    existing.qty = (existing.qty || 1) + 1;
    if (entry.image && !existing.image) existing.image = entry.image;
  } else {
    cart.push({
      itemId: entry.itemId,
      name: entry.name || 'Item',
      price: typeof entry.price === 'number' ? entry.price : 0,
      vendor: entry.vendor || '',
      image: entry.image || '',
      qty: 1
    });
  }
  saveCart(cart);
  return cart;
}

function removeFromCart(itemId) {
  var removedLine = getCart().find(function (line) { return line.itemId === itemId; });
  var cart = getCart().filter(function (line) { return line.itemId !== itemId; });
  saveCart(cart);
  if (removedLine) showToast('🗑️ "' + removedLine.name + '" removed from cart', 'warning');
  // Re-enable the matching "Add to Cart" button on this page, if present
  var btn = document.querySelector('.listing-reserve-btn[data-item-id="' + itemId + '"], #detail-reserve-btn[data-item-id="' + itemId + '"]');
  if (!btn) {
    var card = document.querySelector('.listing-card[data-item-id="' + itemId + '"]');
    if (card) btn = card.querySelector('.listing-reserve-btn');
  }
  if (btn && !isReservedGlobal(itemId)) {
    btn.textContent = 'Add to Cart';
    btn.disabled = false;
    btn.style.background = '';
    btn.style.color = '';
    btn.style.cursor = '';
  }
  return cart;
}

function setCartQty(itemId, qty) {
  var cart = getCart();
  var line = cart.find(function (l) { return l.itemId === itemId; });
  if (!line) return cart;
  if (qty <= 0) return removeFromCart(itemId);
  line.qty = qty;
  saveCart(cart);
  return cart;
}

function clearCart() {
  saveCart([]);
}

/* ── QTY STEPPER ON "ADD TO CART" BUTTONS (every page) ──
   Once an item is in the cart, its "Add to Cart" button is swapped for
   a small −/+ stepper — matching the one in the cart drawer — so the
   quantity can be adjusted right on the listing card (index.html,
   listings.html) or the big button on item-detail.html, without
   opening the drawer. Buttons already showing "✓ Reserved" (a
   completed purchase) are left alone. */
function getCartQty(itemId) {
  var line = getCart().find(function (l) { return l.itemId === itemId; });
  return line ? (line.qty || 1) : 0;
}

function getItemIdForReserveBtn(btn) {
  if (btn.dataset.itemId) return btn.dataset.itemId;
  var card = btn.closest('.listing-card');
  return card ? card.dataset.itemId : '';
}

function buildCartStepper(itemId, isDetail) {
  var wrap = document.createElement('div');
  wrap.className = 'listing-cart-stepper' + (isDetail ? ' listing-cart-stepper-detail' : '');
  wrap.dataset.itemId = itemId;
  wrap.innerHTML =
    '<button type="button" class="listing-cart-stepper-btn" data-action="dec" aria-label="Decrease quantity">−</button>' +
    '<span class="listing-cart-stepper-qty"></span>' +
    '<button type="button" class="listing-cart-stepper-btn" data-action="inc" aria-label="Increase quantity">+</button>';
  wrap.addEventListener('click', function (e) {
    var actionBtn = e.target.closest('[data-action]');
    if (!actionBtn) return;
    e.stopPropagation();
    e.preventDefault();
    var qty = getCartQty(itemId);
    if (actionBtn.dataset.action === 'inc') setCartQty(itemId, qty + 1);
    else setCartQty(itemId, qty - 1);
  });
  return wrap;
}

/* Swaps a single reserve button for its stepper (or back) based on
   current cart contents. */
function syncCartStepperForButton(btn) {
  var itemId = getItemIdForReserveBtn(btn);
  if (!itemId || isReservedGlobal(itemId)) return;

  var isDetail = btn.id === 'detail-reserve-btn';
  var qty = getCartQty(itemId);
  var stepper = btn.parentNode ? btn.parentNode.querySelector('.listing-cart-stepper[data-item-id="' + itemId + '"]') : null;

  if (qty > 0) {
    if (!stepper) {
      stepper = buildCartStepper(itemId, isDetail);
      btn.insertAdjacentElement('afterend', stepper);
    }
    stepper.querySelector('.listing-cart-stepper-qty').textContent = qty;
    stepper.style.display = 'flex';
    btn.style.display = 'none';
  } else {
    if (stepper) stepper.style.display = 'none';
    btn.style.display = '';
    btn.textContent = 'Add to Cart';
    btn.disabled = false;
    btn.style.background = '';
    btn.style.color = '';
    btn.style.cursor = '';
  }
}

/* Runs the swap above for every reserve button currently in the DOM.
   Called after every cart mutation (via saveCart) and once on load. */
function syncCartControlsUI() {
  document.querySelectorAll('.listing-reserve-btn, #detail-reserve-btn').forEach(function (btn) {
    syncCartStepperForButton(btn);
  });
}
document.addEventListener('DOMContentLoaded', syncCartControlsUI);

/* A completed purchase used to permanently lock the "Add to Cart" button
   (swapping it for a disabled "✓ Reserved" state). That's been removed —
   buying an item no longer affects the cart controls, so this always
   returns false and the +/- stepper syncs normally regardless of any
   past purchase. */
function isReservedGlobal(itemId) {
  return false;
}

/* Parses a displayed price like "BD 4.50" or "4.50" into a plain number.
   Shared here since index.html doesn't otherwise define it (listings.html
   and item-detail.html each already have their own local copy). */
function priceStringToDollars(priceStr) {
  var n = parseFloat(String(priceStr).replace(/[^0-9.]/g, ''));
  return isNaN(n) ? 0 : n;
}

function updateCartBadge() {
  var badge = document.querySelector('.nav-cart-badge');
  if (!badge) return;
  var count = cartCount();
  badge.textContent = count > 99 ? '99+' : String(count);
  badge.classList.toggle('show', count > 0);
}

function openCartDrawer() {
  var overlay = document.querySelector('.ee-cart-overlay');
  var drawer = document.querySelector('.ee-cart-drawer');
  if (!overlay || !drawer) return;
  renderCartDrawerContents();
  overlay.classList.add('open');
  drawer.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeCartDrawer() {
  var overlay = document.querySelector('.ee-cart-overlay');
  var drawer = document.querySelector('.ee-cart-drawer');
  if (!overlay || !drawer) return;
  overlay.classList.remove('open');
  drawer.classList.remove('open');
  document.body.style.overflow = '';
}

function escCartText(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function renderCartDrawerContents() {
  var body = document.querySelector('.ee-cart-drawer-body');
  var foot = document.querySelector('.ee-cart-drawer-foot');
  if (!body || !foot) return;
  var cart = getCart();

  if (!cart.length) {
    body.innerHTML = '<div class="ee-cart-empty">' +
      '<div style="font-weight:700;color:var(--dark);margin-bottom:4px">Your cart is empty</div>' +
      '<div style="font-size:13px">Add a deal to get started.</div></div>';
    foot.style.display = 'none';
    return;
  }

  foot.style.display = '';
  body.innerHTML = cart.map(function (line) {
    var iconHtml = line.image
      ? '<img src="' + escCartText(line.image) + '" alt="" onerror="this.parentElement.innerHTML=\'\'">'
      : '';
    return '<div class="ee-cart-line" data-item-id="' + escCartText(line.itemId) + '">' +
      '<div class="ee-cart-line-icon">' + iconHtml + '</div>' +
      '<div class="ee-cart-line-info">' +
      '<div class="ee-cart-line-name">' + escCartText(line.name) + '</div>' +
      (line.vendor ? '<div class="ee-cart-line-vendor">' + escCartText(line.vendor) + '</div>' : '') +
      '<div class="ee-cart-line-qty">' +
      '<button class="ee-cart-qty-btn" onclick="setCartQty(\'' + escCartText(line.itemId) + '\', ' + ((line.qty || 1) - 1) + ')">−</button>' +
      '<span style="font-size:12px;font-weight:700;min-width:14px;text-align:center">' + (line.qty || 1) + '</span>' +
      '<button class="ee-cart-qty-btn" onclick="setCartQty(\'' + escCartText(line.itemId) + '\', ' + ((line.qty || 1) + 1) + ')">+</button>' +
      '</div></div>' +
      '<div class="ee-cart-line-right">' +
      '<div class="ee-cart-line-price">BD ' + ((line.price || 0) * (line.qty || 1)).toFixed(3) + '</div>' +
      '<button class="ee-cart-line-remove" onclick="removeFromCart(\'' + escCartText(line.itemId) + '\')">Remove</button>' +
      '</div></div>';
  }).join('');

  foot.innerHTML = '<div class="ee-cart-subtotal"><span>Subtotal</span><span class="ee-cart-subtotal-amt">BD ' +
    cartSubtotal().toFixed(3) + '</span></div>' +
    '<button class="btn btn-primary" style="width:100%;justify-content:center;padding:14px" onclick="startCartCheckout()">Checkout</button>';
}

/* Checkout entry point used by the cart drawer's "Checkout" button.
   Pages with a payment modal (index.html, listings.html,
   item-detail.html) define window.openCartCheckout(cart) themselves;
   other pages send the shopper to listings.html to finish paying. */
function startCartCheckout() {
  var cart = getCart();
  if (!cart.length) { showToast('Your cart is empty', 'warning'); return; }
  if (typeof window.openCartCheckout === 'function') {
    closeCartDrawer();
    window.openCartCheckout(cart);
  } else {
    sessionStorage.setItem('ee_open_checkout_on_load', '1');
    window.location.href = 'listings.html';
  }
}

/* ── MY ORDERS (every page) ──
   A quick link into the consumer dashboard's "My Reservations" tab.
   Now folded into the single Menu dropdown below (see injectNavMenuUI)
   instead of its own standalone pill — kept as a plain page-skip check
   there so the link still doesn't show up on the dashboard itself. */

/* ── MY ORDERS — GUEST STATE (every page) ──
   Signed-in users get their own "My Orders" pill from eeRenderAuthNavbar,
   linking straight to the real reservations tab. Signed-out visitors get
   this stand-in instead: same look/position, but there's no order history
   to show yet, so tapping it just nudges them toward creating an account
   rather than bouncing them through the dashboard's own sign-in redirect. */
function injectGuestOrdersUI() {
  var cta = document.querySelector('.nav-cta');
  if (!cta || cta.querySelector('.nav-myorders-btn')) return;
  try {
    if (localStorage.getItem('ee_current_user')) return; // signed in — not our job
  } catch (e) { }

  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn btn-primary btn-sm nav-dash-btn nav-myorders-btn';
  btn.textContent = 'My Orders';
  btn.onclick = function () {
    showToast('Tap "Get Started" to create an account and start tracking your orders.');
  };
  cta.appendChild(btn);
}

function injectCartUI() {
  var cta = document.querySelector('.nav-cta');
  if (cta && !document.querySelector('.nav-cart-btn')) {
    var cartBtn = document.createElement('button');
    cartBtn.className = 'nav-cart-btn';
    cartBtn.setAttribute('aria-label', 'My Cart');
    cartBtn.innerHTML = '<span>My Cart</span><span class="nav-cart-badge"></span>';
    cartBtn.onclick = function () { openCartDrawer(); };
    // Order should read Sign In → Get Started (or My Dashboard, when
    // signed in) → My Cart → My Orders. So cart goes right before the
    // My Orders pill when it's present; otherwise it just lands last,
    // after Sign In/Get Started/My Dashboard.
    var ordersBtn = cta.querySelector('.nav-myorders-btn');
    if (ordersBtn) {
      cta.insertBefore(cartBtn, ordersBtn);
    } else {
      cta.appendChild(cartBtn);
    }
  }

  if (!document.querySelector('.ee-cart-overlay')) {
    var overlay = document.createElement('div');
    overlay.className = 'ee-cart-overlay';
    overlay.onclick = function () { closeCartDrawer(); };
    document.body.appendChild(overlay);

    var drawer = document.createElement('div');
    drawer.className = 'ee-cart-drawer';
    drawer.innerHTML =
      '<div class="ee-cart-drawer-head">' +
      '<div class="ee-cart-drawer-title">Your Cart</div>' +
      '<button class="ee-cart-drawer-close" onclick="closeCartDrawer()">✕</button>' +
      '</div>' +
      '<div class="ee-cart-drawer-body"></div>' +
      '<div class="ee-cart-drawer-foot"></div>';
    document.body.appendChild(drawer);
  }

  updateCartBadge();
}

/* ── SETTINGS (theme + account) ──────────────────────────────────────────
   Grouped with Get Help and My Orders on the left side of the navbar
   (see .nav-left-group), shown on every page to everyone — theme
   preference doesn't require an account. Email/password fields only
   appear once signed in and write straight to the same ee_users /
   ee_current_user localStorage records the rest of this demo already
   uses. There's no real backend account service behind this yet;
   eeSaveEmail()/eeSavePassword() below are the spot to wire one up (e.g.
   supabaseClient.auth.updateUser({ email }) / .updateUser({ password })). ── */
/* ── GENERIC EDIT PROFILE MODAL (every page without its own) ───────────────
   consumer-dashboard.html and vendor-dashboard.html each define their own
   richer openEditProfileModal()/saveProfile() (kept in sync with their
   sidebar avatar, business title, etc. — see the comment above
   eeRenderSettingsProfileSection()). Everywhere else, hasProfileModal was
   false, so Settings' Profile section — and its "Edit Profile" button —
   simply didn't render, even though Settings itself is available on every
   page. This injects a page-agnostic version of that same modal (reusing
   the .ep-* styles already defined globally in style.css) so profile
   editing works from Settings anywhere, not just from a dashboard.
   No-ops if a page-specific version is already defined, or if signed out. */
function injectEditProfileModalUI() {
  if (typeof window.openEditProfileModal === 'function') return;
  if (document.getElementById('edit-profile-modal')) return;
  if (!localStorage.getItem('ee_current_user')) return;

  var modal = document.createElement('div');
  modal.id = 'edit-profile-modal';
  modal.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9000;align-items:center;justify-content:center;padding:20px';
  modal.innerHTML =
    '<div style="background:var(--white);border-radius:20px;padding:32px;max-width:400px;width:100%;text-align:center;max-height:90vh;overflow-y:auto">' +
    '<div style="font-size:17px;font-weight:800;color:var(--dark);margin-bottom:20px">Edit Profile</div>' +
    '<input type="file" id="ep-avatar-input" accept="image/*" style="display:none" onchange="handleAvatarUpload(event)">' +
    '<div class="ep-avatar-wrap" onclick="document.getElementById(\'ep-avatar-input\').click()">' +
    '<div class="ep-avatar-preview" id="ep-avatar-preview">U</div>' +
    '<div class="ep-avatar-edit-badge">' +
    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M4 15.5V19a1 1 0 0 0 1 1h3.5L19 9.5a2 2 0 0 0 0-2.8L16.8 4.5a2 2 0 0 0-2.8 0L4 15.5Z" /></svg>' +
    '</div></div>' +
    '<div style="font-size:12px;color:var(--text-muted);margin-bottom:20px">Tap the avatar to change your photo</div>' +
    '<form onsubmit="saveProfile(event)" style="text-align:left">' +
    '<div class="ep-field"><label class="ep-label">Full Name</label>' +
    '<input type="text" id="ep-name" class="ep-input" required maxlength="60"></div>' +
    '<div class="ep-field" id="ep-biz-field" style="display:none"><label class="ep-label">Business Name</label>' +
    '<input type="text" id="ep-biz" class="ep-input" maxlength="80"></div>' +
    '<div class="ep-field"><label class="ep-label">Date of Birth</label>' +
    '<input type="text" id="ep-dob" class="ep-input" autocomplete="off" autocorrect="off" spellcheck="false" data-lpignore="true" name="dob-manual-entry"></div>' +
    '<div class="ep-field"><label class="ep-label">Gender</label>' +
    '<select id="ep-gender" class="ep-input"><option value="">Prefer not to say</option>' +
    '<option value="female">Female</option><option value="male">Male</option>' +
    '<option value="nonbinary">Non-binary</option><option value="other">Other</option></select></div>' +
    '<div style="display:flex;gap:10px;margin-top:22px">' +
    '<button type="button" class="btn btn-outline" style="flex:1;justify-content:center" onclick="closeEditProfileModal()">Cancel</button>' +
    '<button type="submit" class="btn btn-primary" style="flex:1;justify-content:center">Save Changes</button>' +
    '</div></form></div>';
  document.body.appendChild(modal);

  window.openEditProfileModal = function () {
    var user = {};
    try { user = JSON.parse(localStorage.getItem('ee_current_user') || '{}'); } catch (e) { }
    document.getElementById('ep-name').value = user.name || '';
    document.getElementById('ep-biz-field').style.display = user.role === 'vendor' ? '' : 'none';
    document.getElementById('ep-biz').value = user.businessName || '';
    populateDobSelects('ep-dob');
    setDobValue('ep-dob', user.dob || '');
    document.getElementById('ep-gender').value = user.gender || '';
    var preview = document.getElementById('ep-avatar-preview');
    var initial = ((user.businessName || user.name || 'U').charAt(0) || 'U').toUpperCase();
    preview.innerHTML = user.avatarUrl ? '<img src="' + user.avatarUrl + '" alt="">' : initial;
    preview.style.setProperty('--avatar-color', eeGetAvatarColor(user));
    document.getElementById('edit-profile-modal').style.display = 'flex';
  };

  window.closeEditProfileModal = function () {
    document.getElementById('edit-profile-modal').style.display = 'none';
  };

  window.handleAvatarUpload = function (event) {
    var file = event.target.files && event.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { showToast('Please choose an image file.'); return; }
    if (file.size > 2 * 1024 * 1024) { showToast('Image must be under 2MB.'); return; }
    var reader = new FileReader();
    reader.onload = function (e) {
      document.getElementById('ep-avatar-preview').innerHTML = '<img src="' + e.target.result + '" alt="">';
      document.getElementById('ep-avatar-preview').dataset.pending = e.target.result;
    };
    reader.readAsDataURL(file);
  };

  window.saveProfile = function (event) {
    event.preventDefault();
    var name = document.getElementById('ep-name').value.trim();
    if (!name) { showToast('Please enter your name.'); return; }
    var user = {};
    try { user = JSON.parse(localStorage.getItem('ee_current_user') || '{}'); } catch (e) { }
    var businessName = document.getElementById('ep-biz').value.trim();
    var dob = getDobValue('ep-dob');
    var gender = document.getElementById('ep-gender').value;
    var pendingAvatar = document.getElementById('ep-avatar-preview').dataset.pending;

    user.name = name;
    if (user.role === 'vendor' && businessName) user.businessName = businessName;
    user.dob = dob;
    user.gender = gender;
    if (pendingAvatar) user.avatarUrl = pendingAvatar;

    localStorage.setItem('ee_current_user', JSON.stringify(user));
    try {
      var users = JSON.parse(localStorage.getItem('ee_users') || '[]');
      var idx = users.findIndex(function (u) { return u.id === user.id || u.email === user.email; });
      if (idx >= 0) users[idx] = Object.assign({}, users[idx], user);
      localStorage.setItem('ee_users', JSON.stringify(users));
    } catch (e) { }

    delete document.getElementById('ep-avatar-preview').dataset.pending;
    closeEditProfileModal();
    eeRenderSettingsProfileSection();
    var navGreeting = document.querySelector('.nav-signin[style*="cursor:default"]');
    if (navGreeting) navGreeting.textContent = '👋 ' + name.split(' ')[0];
    showToast('✅ Profile updated!');
  };
}

function injectSettingsUI() {
  if (!document.querySelector('.ee-settings-overlay')) {
    var overlay = document.createElement('div');
    overlay.className = 'ee-settings-overlay';
    overlay.onclick = function () { closeSettingsModal(); };
    document.body.appendChild(overlay);

    var modal = document.createElement('div');
    modal.className = 'ee-settings-modal';
    modal.innerHTML =
      '<div class="ee-settings-head">' +
      '<div class="ee-settings-title">⚙️ Settings</div>' +
      '<button class="ee-settings-close" onclick="closeSettingsModal()">✕</button>' +
      '</div>' +
      '<div class="ee-settings-body">' +
      '<div class="ee-settings-section" id="eeSettingsProfileSection"></div>' +
      '<div class="ee-settings-section">' +
      '<div class="ee-settings-label">Appearance</div>' +
      '<div class="ee-theme-toggle">' +
      '<button type="button" class="ee-theme-toggle-btn" data-theme-choice="light" onclick="eeSetThemePref(\'light\')">Light</button>' +
      '<button type="button" class="ee-theme-toggle-btn" data-theme-choice="dark" onclick="eeSetThemePref(\'dark\')">Dark</button>' +
      '<button type="button" class="ee-theme-toggle-btn" data-theme-choice="system" onclick="eeSetThemePref(\'system\')">System</button>' +
      '</div>' +
      '</div>' +
      '<div class="ee-settings-section">' +
      '<div class="ee-settings-label">Notifications</div>' +
      '<div class="ee-notif-row">' +
      '<div class="ee-notif-row-text"><strong>Price drop alerts</strong><span>When a saved item\'s price falls</span></div>' +
      '<label class="ee-toggle"><input type="checkbox" data-notif-choice="priceDrops" onchange="eeSetNotifPref(\'priceDrops\',this.checked)"><span class="ee-t-slider"></span></label>' +
      '</div>' +
      '<div class="ee-notif-row">' +
      '<div class="ee-notif-row-text"><strong>Order updates</strong><span>Pickup reminders and order status</span></div>' +
      '<label class="ee-toggle"><input type="checkbox" data-notif-choice="orderUpdates" onchange="eeSetNotifPref(\'orderUpdates\',this.checked)"><span class="ee-t-slider"></span></label>' +
      '</div>' +
      '<div class="ee-notif-row">' +
      '<div class="ee-notif-row-text"><strong>New deals nearby</strong><span>Fresh surplus listings near you</span></div>' +
      '<label class="ee-toggle"><input type="checkbox" data-notif-choice="newDeals" onchange="eeSetNotifPref(\'newDeals\',this.checked)"><span class="ee-t-slider"></span></label>' +
      '</div>' +
      '</div>' +
      '<div class="ee-settings-section">' +
      '<div class="ee-settings-label">Location</div>' +
      '<div class="ee-notif-row">' +
      '<div class="ee-notif-row-text"><strong>Distance from you</strong><span id="eeLocationStatus">Off — Showing distances from central Manama.</span></div>' +
      '<button type="button" class="btn btn-outline btn-sm" id="eeLocationBtn" onclick="eeRequestLocationAccess()">Enable Location</button>' +
      '</div>' +
      '<div class="ee-notif-row">' +
      '<div class="ee-notif-row-text"><strong>Or pick your area</strong><span>Use this if location access isn\'t working</span></div>' +
      '<select class="btn btn-outline btn-sm" id="eeManualAreaSelect" style="cursor:pointer" onchange="if(this.value) eeSetManualLocation(this.value)">' +
      '<option value="">Choose area…</option>' +
      '</select>' +
      '</div>' +
      '</div>' +
      '<div class="ee-settings-section" id="eeSettingsAccountSection"></div>' +
      '</div>';
    document.body.appendChild(modal);

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeSettingsModal();
    });
  }

  eeSyncThemeToggleUI();
  eeSyncNotifToggleUI();
  eeSyncLocationStatusUI();
  eeRenderSettingsProfileSection();
  eeRenderSettingsAccountSection();
}

/* ── Bahrain locations — single source of truth ──────────────────────────
   Every "City / Area" field across the site (register.html's consumer/
   vendor/Google sign-up fields, the homepage vendor teaser) AND the
   Settings → Location → "pick your area" fallback all read from this one
   list, so there's exactly one place that needs updating and nothing can
   drift out of sync. Covers all five governorates — named cities, towns
   and the villages/districts people commonly search by — each with an
   approximate center point used for the manual "pick your area" distance
   fallback (see eeSetManualLocation below); these are reasonable
   approximations, not survey-grade coordinates. */
var EE_BAHRAIN_LOCATIONS = [
  { name: 'Manama', lat: 26.2167, lng: 50.5833 },
  { name: 'Adliya', lat: 26.2167, lng: 50.5794 },
  { name: 'Juffair', lat: 26.2115, lng: 50.6005 },
  { name: 'Seef', lat: 26.2345, lng: 50.5525 },
  { name: 'Gudaibiya', lat: 26.2231, lng: 50.5814 },
  { name: 'Hoora', lat: 26.2280, lng: 50.5825 },
  { name: 'Naim', lat: 26.2280, lng: 50.5720 },
  { name: 'Zinj', lat: 26.2135, lng: 50.5810 },
  { name: 'Salmaniya', lat: 26.2225, lng: 50.5765 },
  { name: 'Umm Al Hassam', lat: 26.2170, lng: 50.5760 },
  { name: 'Mahooz', lat: 26.2135, lng: 50.5715 },
  { name: 'Sanabis', lat: 26.2247, lng: 50.5647 },
  { name: 'Karbabad', lat: 26.2333, lng: 50.5333 },
  { name: 'Muharraq', lat: 26.2572, lng: 50.6119 },
  { name: 'Hidd', lat: 26.2500, lng: 50.6500 },
  { name: 'Galali', lat: 26.2667, lng: 50.6500 },
  { name: 'Busaiteen', lat: 26.2720, lng: 50.6090 },
  { name: 'Samaheej', lat: 26.2800, lng: 50.6350 },
  { name: 'Arad', lat: 26.2561, lng: 50.6322 },
  { name: 'Diyar Al Muharraq', lat: 26.2865, lng: 50.6349 },
  { name: 'Amwaj Islands', lat: 26.2935, lng: 50.6532 },
  { name: 'Riffa', lat: 26.1300, lng: 50.5550 },
  { name: 'Hamad Town', lat: 26.1195, lng: 50.5075 },
  { name: 'Isa Town', lat: 26.1735, lng: 50.5475 },
  { name: 'Zayed Town (Madinat Isa)', lat: 26.1736, lng: 50.5478 },
  { name: "A'ali", lat: 26.1478, lng: 50.5325 },
  { name: 'Sitra', lat: 26.1550, lng: 50.6215 },
  { name: 'Nuwaidrat', lat: 26.1333, lng: 50.6000 },
  { name: "Ma'ameer", lat: 26.1333, lng: 50.6086 },
  { name: 'Wadiyan', lat: 26.1580, lng: 50.6160 },
  { name: 'Sanad', lat: 26.1500, lng: 50.5833 },
  { name: 'Tubli', lat: 26.1869, lng: 50.5494 },
  { name: 'Jidd Hafs', lat: 26.2242, lng: 50.5394 },
  { name: 'Budaiya', lat: 26.2167, lng: 50.4500 },
  { name: 'Saar', lat: 26.1942, lng: 50.4819 },
  { name: 'Janabiya', lat: 26.2050, lng: 50.4700 },
  { name: 'Hamala', lat: 26.0654, lng: 50.4779 },
  { name: 'Bani Jamra', lat: 26.2069, lng: 50.4661 },
  { name: 'Duraz', lat: 26.2144, lng: 50.4600 },
  { name: 'Barbar', lat: 26.1950, lng: 50.5000 },
  { name: 'Karranah', lat: 26.1858, lng: 50.5011 },
  { name: 'Jasra', lat: 26.1836, lng: 50.4489 },
  { name: 'Al Markh', lat: 26.1550, lng: 50.4600 },
  { name: 'Al Malikiyah', lat: 26.1806, lng: 50.4972 },
  { name: 'Zallaq', lat: 26.0561, lng: 50.4756 },
  { name: 'Sakhir', lat: 26.0342, lng: 50.5228 },
  { name: 'Awali', lat: 26.0833, lng: 50.5500 },
  { name: 'Askar', lat: 26.0850, lng: 50.5750 },
  { name: 'Al Dur', lat: 26.0450, lng: 50.5350 },
  { name: 'Ras Ruman', lat: 26.1000, lng: 50.5150 },
  { name: 'Nabih Saleh', lat: 26.1697, lng: 50.5967 },
  { name: 'Dar Kulaib', lat: 26.0679, lng: 50.5050 },
  { name: 'Sehla', lat: 26.2069, lng: 50.4931 },
  { name: 'Shakhura', lat: 26.1972, lng: 50.4903 },
  { name: 'Salmabad', lat: 26.1833, lng: 50.5167 },
  { name: 'Damistan', lat: 26.1783, lng: 50.4933 },
  { name: 'Bu Quwah', lat: 26.1611, lng: 50.4972 },
  { name: 'Durrat Al Bahrain', lat: 25.8570, lng: 50.6570 }
];

/* ── Location permission (Settings → "Enable Location") ─────────────────
   Every page that shows a "distance from you" figure (homepage hero
   badge, homepage featured cards, listings.html cards/map) falls back to
   central Manama when location access isn't granted, and used to leave
   the visitor with no way to fix that short of a stray browser prompt.
   This gives Settings a real button: request permission, then tell every
   distance-aware bit of code on the current page to recompute via a
   shared 'ee:location-granted' event, rather than duplicating the
   geolocation call in each page.

   Browser/OS geolocation can fail for reasons no amount of retrying in
   this code can fix (OS-level location services stuck, corporate
   network/VPN blocking positioning, etc.) — see the manual area picker
   below for a fallback that doesn't depend on the browser at all. */

function eeSetManualLocation(areaName) {
  var area = null;
  for (var i = 0; i < EE_BAHRAIN_LOCATIONS.length; i++) {
    if (EE_BAHRAIN_LOCATIONS[i].name === areaName) { area = EE_BAHRAIN_LOCATIONS[i]; break; }
  }
  if (!area) return;
  window.eeLocationGrantedThisSession = true;
  window.eeManualAreaName = area.name;
  window.dispatchEvent(new CustomEvent('ee:location-granted', {
    detail: { lat: area.lat, lng: area.lng }
  }));
  eeSyncLocationStatusUI();
}

function eeSyncLocationStatusUI() {
  var statusEl = document.getElementById('eeLocationStatus');
  var btnEl = document.getElementById('eeLocationBtn');
  var selectEl = document.getElementById('eeManualAreaSelect');

  if (selectEl && !selectEl.dataset.populated) {
    EE_BAHRAIN_LOCATIONS.forEach(function (area) {
      var opt = document.createElement('option');
      opt.value = area.name;
      opt.textContent = area.name;
      selectEl.appendChild(opt);
    });
    selectEl.dataset.populated = '1';
  }
  if (selectEl) selectEl.value = window.eeManualAreaName || '';

  if (!statusEl || !btnEl) return;
  if (!('geolocation' in navigator)) {
    statusEl.textContent = "Your browser doesn't support location access — pick your area instead.";
    btnEl.disabled = true;
    return;
  }
  if (window.eeManualAreaName) {
    statusEl.textContent = 'On — Showing distances from ' + window.eeManualAreaName + '.';
    btnEl.textContent = 'Enable Location';
  } else if (window.eeLocationGrantedThisSession) {
    statusEl.textContent = 'On — distances shown are from your real location.';
    btnEl.textContent = 'Re-check Location';
  } else {
    statusEl.textContent = 'Off — Showing distances from central Manama.';
    btnEl.textContent = 'Enable Location';
  }
  btnEl.disabled = false;

}

function eeRequestLocationAccess() {
  var statusEl = document.getElementById('eeLocationStatus');
  var btnEl = document.getElementById('eeLocationBtn');
  if (!('geolocation' in navigator)) return;
  if (statusEl) statusEl.textContent = 'Requesting location access…';
  if (btnEl) btnEl.disabled = true;

  function onSuccess(pos) {
    window.eeLocationGrantedThisSession = true;
    window.eeManualAreaName = null;
    window.dispatchEvent(new CustomEvent('ee:location-granted', {
      detail: { lat: pos.coords.latitude, lng: pos.coords.longitude }
    }));
    eeSyncLocationStatusUI();
  }

  function onFinalError(err) {
    if (statusEl) {
      statusEl.textContent = err && err.code === 1
        ? "Location is blocked for this site. Open your browser's site settings (usually the icon next to the address bar) and allow Location, then tap Enable Location again."
        : "Couldn't get your location just now — check your device's location services are on and try again.";
    }
    if (btnEl) btnEl.disabled = false;
  }

  // A slow/first-time OS location fix (e.g. Wi-Fi-based positioning on a
  // laptop) can miss a short timeout even though it would succeed given a
  // bit longer. Permission-denied (code 1) is retried too, since some
  // browsers report a stale denial from an earlier page load — asking
  // again after a short delay lets the browser re-prompt if it's actually
  // going to. Only a second, longer-timeout failure is shown to the user.
  navigator.geolocation.getCurrentPosition(onSuccess, function (firstErr) {
    if (statusEl) statusEl.textContent = 'Still trying to get your location…';
    setTimeout(function () {
      navigator.geolocation.getCurrentPosition(onSuccess, onFinalError, {
        enableHighAccuracy: false, timeout: 15000, maximumAge: 0
      });
    }, 500);
  }, { enableHighAccuracy: false, timeout: 8000, maximumAge: 0 });
}

/* ── Profile section (avatar + name + "Edit Profile") ──────────────────
   The full profile form (avatar upload, name, DOB, gender/business name)
   already lives in each dashboard's own #edit-profile-modal +
   openEditProfileModal(), since the fields differ for consumers vs.
   vendors. Rather than duplicating that form here, this section just
   shows a quick identity summary and, on pages where that modal exists,
   a button that closes Settings and opens it. On pages without a
   dashboard-style profile modal (or when signed out), the section is
   simply omitted. */
function eeRenderSettingsProfileSection() {
  var section = document.getElementById('eeSettingsProfileSection');
  if (!section) return;

  var email = getCurrentUserEmail();
  var hasProfileModal = typeof openEditProfileModal === 'function';

  if (!email || !hasProfileModal) {
    section.innerHTML = '';
    section.style.display = 'none';
    return;
  }

  var user = {};
  try { user = JSON.parse(localStorage.getItem('ee_current_user') || '{}'); } catch (e) { }
  var name = user.name || 'there';
  var initial = ((user.businessName || name || 'U').trim().charAt(0) || 'U').toUpperCase();
  var avatarColor = eeGetAvatarColor(user);

  section.style.display = '';
  section.innerHTML =
    '<div class="ee-settings-label">Profile</div>' +
    '<div class="ee-settings-profile-row">' +
    '<div class="ee-settings-profile-avatar" style="--avatar-color:' + avatarColor + '">' +
    (user.avatarUrl ? '<img src="' + escCartText(user.avatarUrl) + '" alt="">' : escCartText(initial)) +
    '</div>' +
    '<div class="ee-settings-profile-text">' +
    '<strong>' + escCartText(name) + '</strong>' +
    '<span>' + escCartText(email) + '</span>' +
    '</div>' +
    '<button type="button" class="btn btn-outline btn-sm" onclick="closeSettingsModal();openEditProfileModal();">Edit Profile</button>' +
    '</div>';
}

/* ── Notification prefs — deliberately just 3 on/off switches stored in
   localStorage. No channels, quiet hours, or per-vendor settings; keep it
   this simple on purpose. ── */
function eeGetNotifPrefs() {
  var defaults = { priceDrops: true, orderUpdates: true, newDeals: true };
  try {
    var stored = JSON.parse(localStorage.getItem('ee_notif_prefs'));
    return Object.assign(defaults, stored || {});
  } catch (e) {
    return defaults;
  }
}

function eeSetNotifPref(key, value) {
  var prefs = eeGetNotifPrefs();
  prefs[key] = value;
  localStorage.setItem('ee_notif_prefs', JSON.stringify(prefs));
}

function eeSyncNotifToggleUI() {
  var prefs = eeGetNotifPrefs();
  document.querySelectorAll('[data-notif-choice]').forEach(function (input) {
    input.checked = !!prefs[input.getAttribute('data-notif-choice')];
  });
}

function eeSyncThemeToggleUI() {
  var pref = eeGetThemePref();
  document.querySelectorAll('.ee-theme-toggle-btn').forEach(function (btn) {
    btn.classList.toggle('active', btn.getAttribute('data-theme-choice') === pref);
  });
}

function eeRenderSettingsAccountSection() {
  var section = document.getElementById('eeSettingsAccountSection');
  if (!section) return;
  var email = getCurrentUserEmail();

  if (!email) {
    section.innerHTML =
      '<div class="ee-settings-label">Account</div>' +
      '<div class="ee-settings-signedout">Sign in to change your email or password.<br>' +
      '<a href="login.html" class="btn btn-primary btn-sm" style="margin-top:14px;display:inline-flex">Sign In</a>' +
      '<div style="margin-top:12px;font-size:12.5px">Don\'t have an account?</div>' +
      '<a href="register.html" class="btn btn-outline btn-sm" style="margin-top:8px;display:inline-flex">Get Started</a></div>';
    return;
  }

  section.innerHTML =
    '<div class="ee-settings-label">Change Email</div>' +
    '<div class="ee-settings-field"><label>New email</label>' +
    '<input type="email" class="ee-settings-input" id="eeSettingsNewEmail" placeholder="' + escCartText(email) + '"></div>' +
    '<button class="btn btn-primary btn-sm" style="width:100%;justify-content:center" onclick="eeSaveEmail()">Update Email</button>' +
    '<div class="ee-settings-label" style="margin-top:22px">Change Password</div>' +
    '<div class="ee-settings-field"><label>Current password</label>' +
    '<input type="password" class="ee-settings-input" id="eeSettingsCurPass"></div>' +
    '<div class="ee-settings-field"><label>New password</label>' +
    '<input type="password" class="ee-settings-input" id="eeSettingsNewPass" placeholder="At least 8 characters"></div>' +
    '<div class="ee-settings-field"><label>Confirm new password</label>' +
    '<input type="password" class="ee-settings-input" id="eeSettingsConfirmPass"></div>' +
    '<button class="btn btn-primary btn-sm" style="width:100%;justify-content:center" onclick="eeSavePassword()">Update Password</button>';
}

function openSettingsModal() {
  eeSyncThemeToggleUI();
  eeRenderSettingsProfileSection();
  eeRenderSettingsAccountSection();
  var overlay = document.querySelector('.ee-settings-overlay');
  var modal = document.querySelector('.ee-settings-modal');
  if (overlay) overlay.classList.add('open');
  if (modal) modal.classList.add('open');
}

function closeSettingsModal() {
  var overlay = document.querySelector('.ee-settings-overlay');
  var modal = document.querySelector('.ee-settings-modal');
  if (overlay) overlay.classList.remove('open');
  if (modal) modal.classList.remove('open');
}

/* Persists a new email onto both the ee_current_user record and its
   matching ee_users entry (matched by the OLD email, case-insensitively). */
function eeSaveEmail() {
  var input = document.getElementById('eeSettingsNewEmail');
  var newEmail = input ? input.value.trim().toLowerCase() : '';
  if (!newEmail) { showToast('Enter a new email first', 'warning'); return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) { showToast('⚠️ That email doesn\'t look valid', 'warning'); return; }

  var currentEmail = getCurrentUserEmail();
  if (!currentEmail) return;
  if (newEmail === currentEmail.toLowerCase()) { showToast('That\'s already your email', 'warning'); return; }

  var users = [];
  try { users = JSON.parse(localStorage.getItem('ee_users') || '[]'); } catch (e) { }
  var taken = users.some(function (u) {
    return u.email && u.email.toLowerCase() === newEmail && u.email.toLowerCase() !== currentEmail.toLowerCase();
  });
  if (taken) { showToast('⚠️ That email is already in use', 'warning'); return; }

  var record = users.find(function (u) { return u.email && u.email.toLowerCase() === currentEmail.toLowerCase(); });
  if (record) record.email = newEmail;
  localStorage.setItem('ee_users', JSON.stringify(users));

  var cur = null;
  try { cur = JSON.parse(localStorage.getItem('ee_current_user') || 'null'); } catch (e) { }
  if (cur) { cur.email = newEmail; localStorage.setItem('ee_current_user', JSON.stringify(cur)); }

  showToast('✅ Email updated to ' + newEmail);
  eeRenderSettingsAccountSection();
}

/* Validates the current password against the plaintext stored on the
   matching ee_users record — same simple check login.html already does
   in this demo — before writing the new one. */
function eeSavePassword() {
  var curInput = document.getElementById('eeSettingsCurPass');
  var newInput = document.getElementById('eeSettingsNewPass');
  var confirmInput = document.getElementById('eeSettingsConfirmPass');
  var cur = curInput ? curInput.value : '';
  var next = newInput ? newInput.value : '';
  var confirm = confirmInput ? confirmInput.value : '';

  var email = getCurrentUserEmail();
  if (!email) return;

  var users = [];
  try { users = JSON.parse(localStorage.getItem('ee_users') || '[]'); } catch (e) { }
  var record = users.find(function (u) { return u.email && u.email.toLowerCase() === email.toLowerCase(); });
  if (!record) { showToast('⚠️ Could not find your account', 'warning'); return; }

  if (record.password && cur !== record.password) { showToast('⚠️ Current password is incorrect', 'warning'); return; }
  if (next.length < 8) { showToast('⚠️ New password must be at least 8 characters', 'warning'); return; }
  if (next !== confirm) { showToast('⚠️ New passwords don\'t match', 'warning'); return; }

  record.password = next;
  localStorage.setItem('ee_users', JSON.stringify(users));

  showToast('✅ Password updated');
  if (curInput) curInput.value = '';
  if (newInput) newInput.value = '';
  if (confirmInput) confirmInput.value = '';
}

/* ── LIVE CHAT WIDGET (AI first, then human agent handoff) ───────────────────
   Fully client-side — there's no real support inbox behind this yet.
   Conversation state lives in sessionStorage so it survives navigation
   between pages during a visit and resets when the tab closes. The "AI"
   layer is a small keyword-matched FAQ pulled from EchoEats' own policies
   (pricing engine, 15-minute hold, cancellation window, etc.). If it can't
   help — or the shopper asks for a human — the widget "escalates" into an
   agent persona. To go live, replace the simulated setTimeout replies in
   eeChatEscalate()/eeChatHandleUserMessage() with real calls to a support
   inbox (Intercom, Zendesk, a Netlify function + WebSocket, etc.). ── */
var EE_CHAT_HISTORY_KEY = 'ee_chat_history';
var EE_CHAT_STATE_KEY = 'ee_chat_state'; // 'ai' | 'connecting' | 'agent'
var EE_CHAT_MISSES_KEY = 'ee_chat_misses';
var EE_CHAT_AGENT_KEY = 'ee_chat_agent_name';
var EE_CHAT_AGENT_NAMES = ['Layla', 'Fatima', 'Ahmed', 'Noor', 'Yousif', 'Maryam', 'Sara', 'Hessa', 'Zainab', 'Reem', 'Mariam', 'Hala', 'Sultan', 'Hamad'];

function eeChatGetAgentName() {
  try {
    var name = sessionStorage.getItem(EE_CHAT_AGENT_KEY);
    if (!name) {
      name = EE_CHAT_AGENT_NAMES[Math.floor(Math.random() * EE_CHAT_AGENT_NAMES.length)];
      sessionStorage.setItem(EE_CHAT_AGENT_KEY, name);
    }
    return name;
  } catch (e) {
    return EE_CHAT_AGENT_NAMES[0];
  }
}

function eeChatLoadHistory() {
  try { return JSON.parse(sessionStorage.getItem(EE_CHAT_HISTORY_KEY)) || []; } catch (e) { return []; }
}
function eeChatSaveHistory(history) {
  try { sessionStorage.setItem(EE_CHAT_HISTORY_KEY, JSON.stringify(history)); } catch (e) { }
}
function eeChatGetState() {
  try { return sessionStorage.getItem(EE_CHAT_STATE_KEY) || 'ai'; } catch (e) { return 'ai'; }
}
function eeChatSetState(state) {
  try { sessionStorage.setItem(EE_CHAT_STATE_KEY, state); } catch (e) { }
}

function eeChatFAQ(text) {
  var t = text.toLowerCase();
  if (/\b(hi|hello|hey)\b/.test(t)) return "Hey there! I'm the EchoEats assistant. Ask me about pricing, orders, pickup, refunds, or becoming a vendor \u2014 or tap \u201CTalk to an agent\u201D any time.";
  if (/how (does|do).*(work|it work)|what is echoeats|explain.*(app|echoeats|this)/.test(t)) return "EchoEats connects you with restaurants and shops selling surplus food at a discount before it expires. Browse live deals, prices drop the closer an item gets to its expiry, add to cart to lock your price, then pay and pick it up. Want more on pricing, pickup, or becoming a vendor?";
  if (/price|pricing|cost|discount|how much|expensive|cheap/.test(t)) return "Prices update automatically every 15 minutes with our dynamic pricing engine \u2014 the closer a listing gets to its expiry time, the lower the price drops. You'll always see the countdown and current discount right on the listing.";
  if (/hold|reserve|reservation|lock|cart/.test(t)) return "Adding an item to your cart locks it for you \u2014 enough time to pay and get to the vendor. Nobody else can grab it during that window.";
  if (/refund|cancel|money back/.test(t)) return "You can cancel within 15 minutes of checkout. Instead of a card refund, we add the amount as EchoEats wallet credit you can use on your next order.";
  if (/(become|sign up|join).*vendor|vendor|sell my food|list my food|restaurant|bakery/.test(t)) return "Vendors sign up on our For Vendors page \u2014 you list surplus food with an expiry window, and our pricing engine takes it from there.";
  if (/pickup|address|location|where.*pick|store hours|opening hours/.test(t)) return "Pickup details and the vendor's exact address are sent to you as soon as payment is confirmed. EchoEats is pickup-only \u2014 there's no delivery option yet.";
  if (/deliver/.test(t)) return "We're pickup-only for now, sorry \u2014 no delivery option yet!";
  if (/pay|payment|stripe|card|checkout/.test(t)) return "Checkout runs securely through Stripe \u2014 we never see or store your card details ourselves.";
  if (/account|login|log in|sign in|password|register|sign up|forgot/.test(t)) return "You can manage that from the Sign In / Register pages. Tell me a bit more about what's happening and I'll do my best to help \u2014 or I can connect you with an agent.";
  if (/co2|impact|badge|free meal|leaderboard|points|reward/.test(t)) return "Every meal you save counts toward your CO\u2082 impact, unlocks bronze, silver, and gold badges like \u201C50 Meals Saved\u201D and \u201CFree Meal Pro\u201D, and feeds the community leaderboard \u2014 check the Impact page for your stats.";
  if (/order|receipt|my orders|track/.test(t)) return "All your past and upcoming pickups are in My Orders, under the menu in the top navigation \u2014 you'll find pickup times, addresses, and receipts there.";
  if (/app|download|ios|android|mobile/.test(t)) return "EchoEats currently runs right in your browser \u2014 no separate app to download. You can add the site to your phone's home screen for quick access.";
  if (/thank/.test(t)) return "Anytime! Anything else I can help with?";
  if (/(page|site|app|website).*(not (working|loading)|broken|down|error|glitch|bug)|won'?t load|keeps crashing/.test(t)) return "Sorry about that! First try refreshing the page or clearing your browser cache \u2014 that fixes most glitches. Still stuck? Tap \u201CTalk to an agent\u201D below and we'll take a closer look.";
  if (/change.*(email|e-mail)|update.*(email|e-mail)/.test(t)) return "You can update the email on your account from Settings, in the menu at the top of the page. If it's not letting you save the change, tap \u201CTalk to an agent\u201D and we'll sort it out.";
  return null;
}

/* Issues where the AI shouldn't try to answer on its own \u2014 anything
   involving money, a specific order gone wrong, or account deletion goes
   straight to a human, with a short acknowledgment first so the shopper
   isn't left guessing why the bot didn't just reply normally. */
function eeChatNeedsImmediateAgent(text) {
  var t = text.toLowerCase();
  if (/charged twice|double charg|card (was )?declined|payment (failed|didn'?t go through|is stuck|stuck)|money (was )?taken|never (got|received) (my )?refund|refund never/.test(t)) {
    return "I'm sorry \u2014 payment issues need a real person to look at your account safely, so let me bring in an agent right away.";
  }
  if (/wrong (item|order)|missing (item|items|things)|didn'?t (get|receive) (my|the|everything)|not what i ordered|bad quality|spoiled|(vendor|restaurant) (didn'?t|did not) have|wasn'?t ready when i (got|arrived)|nothing (was )?ready/.test(t)) {
    return "I'm really sorry to hear that \u2014 let me get an agent to look into your specific order and make it right.";
  }
  if (/delete my account|remove my (data|account)|close my account|export my data/.test(t)) {
    return "Account deletion and data requests need to go through an agent so we can verify it's really you \u2014 connecting you now.";
  }
  return null;
}

function eeChatScrollToBottom() {
  var body = document.getElementById('eeChatBody');
  if (body) body.scrollTop = body.scrollHeight;
}

function eeChatRenderMessage(role, text) {
  var body = document.getElementById('eeChatBody');
  if (!body) return;
  var msg = document.createElement('div');
  if (role === 'system') {
    msg.className = 'ee-chat-system';
    msg.textContent = text;
  } else {
    msg.className = 'ee-chat-msg ee-chat-msg-' + role;
    var bubble = document.createElement('div');
    bubble.className = 'ee-chat-bubble';
    bubble.textContent = text;
    msg.appendChild(bubble);
  }
  body.appendChild(msg);
  eeChatScrollToBottom();
}

function eeChatPushMessage(role, text) {
  eeChatRenderMessage(role, text);
  var history = eeChatLoadHistory();
  history.push({ role: role, text: text });
  eeChatSaveHistory(history);
}

function eeChatShowTyping(who) {
  var body = document.getElementById('eeChatBody');
  if (!body) return null;
  var wrap = document.createElement('div');
  wrap.className = 'ee-chat-msg ee-chat-msg-' + who;
  wrap.innerHTML = '<div class="ee-chat-bubble ee-chat-typing"><span></span><span></span><span></span></div>';
  body.appendChild(wrap);
  eeChatScrollToBottom();
  return wrap;
}

function eeChatApplyState(state) {
  var statusEl = document.getElementById('eeChatStatus');
  var quick = document.getElementById('eeChatQuick');
  if (state === 'agent') {
    if (statusEl) statusEl.innerHTML = '<span class="ee-chat-status-dot"></span>Connected to ' + eeChatGetAgentName() + ' \u00B7 Support Agent';
    if (quick) quick.style.display = 'none';
  } else if (state === 'connecting') {
    if (statusEl) statusEl.innerHTML = '<span class="ee-chat-status-dot connecting"></span>Connecting you to an agent\u2026';
  } else {
    if (statusEl) statusEl.innerHTML = '<span class="ee-chat-status-dot"></span>AI Assistant \u00B7 online';
    if (quick) quick.style.display = '';
  }
}

function eeChatEscalate() {
  eeChatSetState('connecting');
  eeChatApplyState('connecting');
  eeChatPushMessage('system', 'Connecting you to a live agent\u2026');
  var typing = eeChatShowTyping('agent');
  setTimeout(function () {
    if (typing) typing.remove();
    eeChatSetState('agent');
    eeChatApplyState('agent');
    var agentName = eeChatGetAgentName();
    eeChatPushMessage('system', agentName + ' joined the chat');
    eeChatPushMessage('agent', "Hi, I'm " + agentName + " from the EchoEats support team \u2014 I can see what you've already told our assistant. What can I help you sort out?");
  }, 1900);
}

function eeChatHandleUserMessage(text) {
  var state = eeChatGetState();

  if (state === 'agent') {
    // Already handed off to a human. This is the single spot to wire up
    // a real support inbox (send `text` to it and stream the reply back).
    var agentTyping = eeChatShowTyping('agent');
    setTimeout(function () {
      if (agentTyping) agentTyping.remove();
      var faqReply = eeChatFAQ(text);
      if (faqReply) {
        eeChatPushMessage('agent', faqReply);
      } else {
        eeChatPushMessage('agent', "Thanks for the details \u2014 I've noted this on your account and I'm sorting it out now. You'll get an update shortly.");
      }
    }, 1400);
    return;
  }

  if (state === 'connecting') return; // already escalating, ignore extra input briefly

  if (/human|agent|representative|real person|talk to someone|speak to (a )?person|complaint|this is urgent|not happy|unhappy|unacceptable|manager|frustrat|disappointed/i.test(text)) {
    eeChatEscalate();
    return;
  }

  // Payment, order-gone-wrong, and account-deletion requests skip the FAQ
  // entirely \u2014 acknowledge briefly, then hand straight to a human.
  var immediateReason = eeChatNeedsImmediateAgent(text);
  if (immediateReason) {
    var ackTyping = eeChatShowTyping('bot');
    setTimeout(function () {
      if (ackTyping) ackTyping.remove();
      eeChatPushMessage('bot', immediateReason);
      eeChatEscalate();
    }, 900);
    return;
  }

  var typing = eeChatShowTyping('bot');
  setTimeout(function () {
    if (typing) typing.remove();
    var reply = eeChatFAQ(text);
    var misses = parseInt(sessionStorage.getItem(EE_CHAT_MISSES_KEY) || '0', 10);
    if (reply) {
      try { sessionStorage.setItem(EE_CHAT_MISSES_KEY, '0'); } catch (e) { }
      eeChatPushMessage('bot', reply);
    } else {
      misses += 1;
      try { sessionStorage.setItem(EE_CHAT_MISSES_KEY, String(misses)); } catch (e) { }
      if (misses >= 2) {
        eeChatPushMessage('bot', "I don't want to leave you stuck \u2014 let me bring in an agent who can help directly.");
        eeChatEscalate();
      } else {
        eeChatPushMessage('bot', "Hmm, I'm not totally sure about that one. Could you rephrase, or tap \u201CTalk to an agent\u201D below and I'll connect you with our support team?");
      }
    }
  }, 900);
}

function eeChatShowLeaveConfirm(panel) {
  if (document.querySelector('.ee-chat-leave-overlay')) return;

  var overlay = document.createElement('div');
  overlay.className = 'ee-chat-leave-overlay';
  overlay.style.cssText = 'position:absolute;inset:0;background:rgba(0,0,0,0.35);border-radius:inherit;display:flex;align-items:center;justify-content:center;z-index:5;';

  var card = document.createElement('div');
  card.style.cssText = 'background:var(--white);border-radius:16px;padding:22px 20px;width:84%;text-align:center;box-shadow:0 10px 30px rgba(0,0,0,0.18);';
  card.innerHTML =
    '<div style="font-size:14.5px;font-weight:800;color:var(--dark);margin-bottom:4px">Leave the chat?</div>' +
    '<p style="font-size:12.5px;color:var(--text-soft);line-height:1.5;margin-bottom:16px">Your conversation will be saved for this visit.</p>' +
    '<div style="display:flex;gap:8px">' +
    '<button class="btn btn-outline btn-sm" id="eeChatStay" style="flex:1;justify-content:center">I\u2019ll come back</button>' +
    '<button class="btn btn-primary btn-sm" id="eeChatLeave" style="flex:1;justify-content:center">Leave chat</button>' +
    '</div>';

  overlay.appendChild(card);
  panel.appendChild(overlay);

  overlay.querySelector('#eeChatStay').addEventListener('click', function () {
    overlay.remove();
    panel.classList.remove('open');
  });
  overlay.querySelector('#eeChatLeave').addEventListener('click', function () {
    overlay.remove();
    panel.classList.remove('open');
    try {
      sessionStorage.removeItem(EE_CHAT_HISTORY_KEY);
      sessionStorage.removeItem(EE_CHAT_STATE_KEY);
      sessionStorage.removeItem(EE_CHAT_MISSES_KEY);
      sessionStorage.removeItem(EE_CHAT_AGENT_KEY);
    } catch (e) { }
    var body = document.getElementById('eeChatBody');
    if (body) body.innerHTML = '';
    eeChatApplyState('ai');
  });
}

function injectLiveChatUI() {
  if (document.querySelector('.ee-chat-fab')) return;

  var fab = document.createElement('button');
  fab.className = 'ee-chat-fab';
  fab.setAttribute('aria-label', 'Open live chat');
  fab.innerHTML = '\uD83D\uDCAC Live Chat';
  document.body.appendChild(fab);

  var panel = document.createElement('div');
  panel.className = 'ee-chat-panel';
  panel.innerHTML =
    '<div class="ee-chat-head">' +
    '<div>' +
    '<div class="ee-chat-head-title">EchoEats Support</div>' +
    '<div class="ee-chat-head-status" id="eeChatStatus"><span class="ee-chat-status-dot"></span>AI Assistant \u00B7 online</div>' +
    '</div>' +
    '<button class="ee-chat-close" aria-label="Close chat">\u2715</button>' +
    '</div>' +
    '<div class="ee-chat-body" id="eeChatBody"></div>' +
    '<div class="ee-chat-quick" id="eeChatQuick">' +
    '<button class="ee-chat-chip" data-msg="How does pricing work?">Pricing</button>' +
    '<button class="ee-chat-chip" data-msg="Where do I pick up my order?">Pickup</button>' +
    '<button class="ee-chat-chip" data-msg="I want to become a vendor">Become a vendor</button>' +
    '<button class="ee-chat-chip ee-chat-chip-agent" data-msg="Talk to an agent">Talk to an agent</button>' +
    '</div>' +
    '<div class="ee-chat-input-row">' +
    '<input type="text" class="ee-chat-input" id="eeChatInput" placeholder="Type a message\u2026" maxlength="300" />' +
    '<button class="ee-chat-send" id="eeChatSend" aria-label="Send">\u27A4</button>' +
    '</div>';
  document.body.appendChild(panel);

  fab.addEventListener('click', function () {
    panel.classList.toggle('open');
    fab.classList.remove('ee-chat-fab-nudge');
    if (panel.classList.contains('open')) {
      var inputEl = document.getElementById('eeChatInput');
      if (inputEl) inputEl.focus();
      eeChatScrollToBottom();
    }
  });
  panel.querySelector('.ee-chat-close').addEventListener('click', function () {
    eeChatShowLeaveConfirm(panel);
  });

  var input = document.getElementById('eeChatInput');
  var sendBtn = document.getElementById('eeChatSend');
  function handleSend() {
    var val = input.value.trim();
    if (!val) return;
    input.value = '';
    eeChatPushMessage('user', val);
    eeChatHandleUserMessage(val);
  }
  sendBtn.addEventListener('click', handleSend);
  input.addEventListener('keydown', function (e) { if (e.key === 'Enter') handleSend(); });

  panel.querySelectorAll('.ee-chat-chip').forEach(function (chip) {
    chip.addEventListener('click', function () {
      var msg = chip.getAttribute('data-msg');
      eeChatPushMessage('user', msg);
      eeChatHandleUserMessage(msg);
    });
  });

  // Restore this session's conversation, or greet for the first time.
  var history = eeChatLoadHistory();
  if (!history.length) {
    eeChatPushMessage('bot', "Hi! I'm the EchoEats AI assistant. Ask me anything about pricing, orders, pickup, or vendors \u2014 and I'll bring in an agent if I can't sort it out.");
  } else {
    history.forEach(function (m) { eeChatRenderMessage(m.role, m.text); });
  }
  eeChatApplyState(eeChatGetState());

  // Gentle one-time nudge on the first page of each session.
  try {
    if (!sessionStorage.getItem('ee_chat_nudged')) {
      setTimeout(function () {
        if (!panel.classList.contains('open')) fab.classList.add('ee-chat-fab-nudge');
      }, 4000);
      sessionStorage.setItem('ee_chat_nudged', '1');
    }
  } catch (e) { }
}

/* ── HELP PAGE — RESTAURANT/VENDOR DIRECTORY ─────────────────────────────
   Built from the same vendors that already appear on listings.html,
   grouped by the areas they're clustered under there, with a contact
   number for each. ── */
var EE_HELP_DIRECTORY = [
  {
    area: 'Seef', vendors: [
      { name: 'Alusia Restaurant', phone: '+973 1758 2010' },
      { name: 'Romeos Cafe', phone: '+973 1758 3110' },
      { name: 'Hypermax', phone: '+973 1758 4210' },
      { name: 'Yasmine Lebanese Restaurant', phone: '+973 1758 5310' }
    ]
  },
  {
    area: 'Al Liwan (Hamala)', vendors: [
      { name: 'Blaza Pizza', phone: '+973 1769 1020' },
      { name: 'Alhan Lebanese Restaurant', phone: '+973 1769 2130' },
      { name: 'China Garden Restaurant', phone: '+973 1769 3240' }
    ]
  },
  {
    area: 'Manama Bay (The Avenues)', vendors: [
      { name: 'EL&N London', phone: '+973 1758 6410' },
      { name: 'Green Bowl', phone: '+973 1758 7520' },
      { name: 'Tim Hortons', phone: '+973 1758 8630' }
    ]
  },
  {
    area: 'Diyar Al Muharraq (Marassi Galleria)', vendors: [
      { name: 'Sushi Library', phone: '+973 1701 2233' },
      { name: 'Crumbles Cafe', phone: '+973 1701 3344' },
      { name: 'Awani Restaurant', phone: '+973 1701 4455' }
    ]
  },
  {
    area: 'Muharraq', vendors: [
      { name: 'Al Muharraq Kitchen', phone: '+973 1732 5566' },
      { name: 'Bait Al Halwa', phone: '+973 1732 6677' }
    ]
  },
  { area: 'Riffa', vendors: [{ name: 'Riffa Grill House', phone: '+973 1777 8899' }] },
  { area: 'Hamad Town', vendors: [{ name: 'Sangam Indian Cusine Seef', phone: '+973 1758 9900' }] },
  { area: 'Isa Town', vendors: [{ name: 'Lulu Hypermarket Saar', phone: '+973 1739 1122' }] },
  { area: 'Sitra', vendors: [{ name: 'Sitra Fish Market', phone: '+973 1773 2233' }] },
  { area: 'Juffair', vendors: [{ name: 'Supernova', phone: '+973 1772 4455' }] },
  { area: 'Zinj', vendors: [{ name: 'Shoo Fee Ma Fee Restaurant', phone: '+973 1729 5566' }] }
];

function renderHelpDirectory() {
  var mount = document.getElementById('helpVendorDirectory');
  if (!mount) return;
  var html = '';
  EE_HELP_DIRECTORY.forEach(function (group) {
    html += '<div class="help-area-group">' +
      '<div class="help-area-label">' + group.area + '</div>' +
      '<div class="help-vendor-list">';
    group.vendors.forEach(function (v) {
      html += '<div class="help-vendor-row">' +
        '<div class="help-vendor-name">' + v.name + '</div>' +
        '<div class="help-vendor-actions">' +
        '<a class="help-vendor-phone" href="tel:' + v.phone.replace(/\s+/g, '') + '">📞 ' + v.phone + '</a>' +
        '<a class="help-vendor-link" href="listings.html?q=' + encodeURIComponent(v.name) + '">View deals →</a>' +
        '</div>' +
        '</div>';
    });
    html += '</div></div>';
  });
  mount.innerHTML = html;
}

/* ── PROGRAMMATIC LIVE CHAT OPEN (used by help.html's "Start Chatting") ── */
function eeChatOpenPanel() {
  var panel = document.querySelector('.ee-chat-panel');
  var fab = document.querySelector('.ee-chat-fab');
  if (!panel) return;
  panel.classList.add('open');
  if (fab) fab.classList.remove('ee-chat-fab-nudge');
  var inputEl = document.getElementById('eeChatInput');
  if (inputEl) setTimeout(function () { inputEl.focus(); }, 60);
  eeChatScrollToBottom();
}

/* ── LEFT-SIDE UTILITY GROUP (Get Help / My Orders / Settings) ──
   These three sit together at the far left of the navbar, opposite the
   right-side actions (My Dashboard/Browse Deals, Sign Out, My Cart).
   This finds the existing group or creates it just before the logo the
   first time any of the three injectors below runs. */
function getOrCreateNavLeftGroup() {
  var group = document.querySelector('.nav-left-group');
  if (group) return group;
  var logo = document.querySelector('.nav-logo');
  var container = logo ? logo.parentElement : null;
  if (!container) return null;
  group = document.createElement('div');
  group.className = 'nav-left-group';
  container.insertBefore(group, logo);
  return group;
}

/* ── LEFT-SIDE MENU (Get Help / Settings / My Orders) ──────────────────
   These three used to sit as three separate always-visible pills, which
   crowded the navbar. Now they're one square icon button (three lines)
   that opens a small dropdown with all three — same destinations/
   behavior as before (Get Help + My Orders are plain links, Settings
   opens the existing settings modal via openSettingsModal), just
   collapsed into a single control. Must run after injectSettingsUI()
   so openSettingsModal()/the settings modal DOM already exist. */
function injectNavMenuUI() {
  var group = getOrCreateNavLeftGroup();
  if (!group || document.querySelector('.nav-menu-btn')) return;
  group.style.position = 'relative';

  var currentPage = window.location.pathname.split('/').pop() || 'index.html';
  var items = [];
  // Shows the shopper's EchoEats wallet credit (built up from cancelled
  // orders — see addCreditBalance/getCreditBalance below) right at the
  // top of the menu, above Settings. Signed-in users see their real
  // balance and jump straight to the dashboard; signed-out visitors
  // still see the entry, but tapping it just nudges them to sign in
  // first, since there's no balance to show without an account yet.
  var currentUserEmail = getCurrentUserEmail();
  if (currentUserEmail) {
    var creditBalance = getCreditBalance(currentUserEmail);
    items.push({
      href: 'credits.html',
      label: 'My Credits: BD ' + creditBalance.toFixed(3)
    });
  } else {
    items.push({
      label: 'My Credits',
      action: function () {
        showToast('Sign in to see your EchoEats credit balance.');
      }
    });
  }
  if (currentUserEmail) {
    if (currentPage !== 'consumer-dashboard.html') {
      items.push({ href: 'consumer-dashboard.html#reservations', label: 'My Orders' });
    }
  } else {
    items.push({
      label: 'My Orders',
      action: function () {
        showToast('Sign in to see your orders.');
      }
    });
  }
  items.push({ label: 'Settings', action: function () { openSettingsModal(); } });
  if (currentPage !== 'help.html') {
    items.push({ href: 'help.html', label: 'Get Help' });
  }
  items.push({
    label: 'Sign Out', action: function () {
      localStorage.removeItem('ee_current_user');
      if (typeof clearSupabaseSession === 'function') clearSupabaseSession();
      window.location.reload();
    }
  });

  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'nav-menu-btn';
  btn.setAttribute('aria-label', 'Menu');
  btn.setAttribute('aria-expanded', 'false');
  btn.innerHTML =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">' +
    '<line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="13" x2="20" y2="13"/><line x1="4" y1="19" x2="20" y2="19"/></svg>';

  var dropdown = document.createElement('div');
  dropdown.className = 'nav-menu-dropdown';
  dropdown.innerHTML = items.map(function (it, i) {
    return it.href
      ? '<a href="' + it.href + '">' + it.label + '</a>'
      : '<button type="button" data-nav-menu-idx="' + i + '">' + it.label + '</button>';
  }).join('');

  function positionDropdown() {
    var r = btn.getBoundingClientRect();
    dropdown.style.top = (r.bottom + 20) + 'px';
    // Right-align to the button so the menu doesn't run off the right
    // edge on narrow phones (it used to hang left:0 off the button,
    // which worked fine when it was nested inside the button's own
    // parent — now that it's positioned against the viewport directly,
    // anchor from the button's left edge the same way).
    dropdown.style.left = r.left + 'px';
  }

  function closeMenu() {
    dropdown.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
  }

  dropdown.querySelectorAll('button[data-nav-menu-idx]').forEach(function (elBtn) {
    var it = items[Number(elBtn.getAttribute('data-nav-menu-idx'))];
    elBtn.onclick = function () { closeMenu(); if (it.action) it.action(); };
  });

  btn.onclick = function (e) {
    e.stopPropagation();
    var willOpen = !dropdown.classList.contains('open');
    if (willOpen) positionDropdown();
    dropdown.classList.toggle('open', willOpen);
    btn.setAttribute('aria-expanded', String(willOpen));
  };
  document.addEventListener('click', function (e) {
    if (!group.contains(e.target) && !dropdown.contains(e.target)) closeMenu();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeMenu();
  });
  // The dropdown is now a fixed-position element living in <body>, no
  // longer nested inside the navbar it visually hangs off. Closing it
  // on scroll (rather than trying to keep it perfectly re-anchored
  // through iOS's toolbar-hiding animation) is the simplest way to
  // guarantee it's never left stranded at a stale position.
  window.addEventListener('scroll', function () {
    if (dropdown.classList.contains('open')) closeMenu();
  }, { passive: true });
  window.addEventListener('resize', function () {
    if (dropdown.classList.contains('open')) positionDropdown();
  });

  group.appendChild(btn);
  document.body.appendChild(dropdown);
}

/* ── GET HELP (folded into the Menu dropdown — see injectNavMenuUI) ── */

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

/* ── VENDOR SIGNUP TEASER (index.html hero card) ──────────────────────────
   The homepage's "List your first item free" card is just a lightweight
   teaser — it doesn't run its own registration (no password/OTP/plan
   picker), so submitting it can't actually create an account on its own.
   Instead it validates what's been typed, hands it off via sessionStorage,
   and sends the person into the real vendor sign-up on register.html —
   same flow as the nav's "Get Started" — with those fields pre-filled so
   they don't have to retype anything. ── */

/* ── City / Area datalist (register.html sign-up fields, homepage teaser)
   Shares EE_BAHRAIN_LOCATIONS (defined above, near the Settings location
   code) as its single source of city names. ── */
function eePopulateBahrainCityDatalist() {
  var list = document.getElementById('eeBahrainCitiesList');
  if (!list) {
    list = document.createElement('datalist');
    list.id = 'eeBahrainCitiesList';
    document.body.appendChild(list);
  }
  if (list.dataset.populated) return;
  EE_BAHRAIN_LOCATIONS.forEach(function (area) {
    var opt = document.createElement('option');
    opt.value = area.name;
    list.appendChild(opt);
  });
  list.dataset.populated = '1';
}
document.addEventListener('DOMContentLoaded', eePopulateBahrainCityDatalist);

function populateTeaserCityDropdown() {
  eePopulateBahrainCityDatalist();
}
document.addEventListener('DOMContentLoaded', function () {
  populateTeaserCityDropdown();
  populateDobSelects('teaser-dob');
  setDobValue('teaser-dob', '');
});

function vendorSignupTeaser(btn) {
  var form = btn.closest('.vendor-cta-form');
  var bizInput = form.querySelector('#teaser-biz');
  var emailInput = form.querySelector('#teaser-email');
  var biztypeInput = form.querySelector('#teaser-biztype');
  var addressInput = form.querySelector('#teaser-address');
  var cityInput = form.querySelector('#teaser-city');
  var dobInput = form.querySelector('#teaser-dob');
  var genderInput = form.querySelector('#teaser-gender');
  var phoneInput = form.querySelector('#teaser-phone');
  var planInput = form.querySelector('#teaser-plan');

  // Same required set as register.html: business name, business type,
  // city, DOB and gender are required there; address and phone are optional.
  var requiredInputs = [bizInput, emailInput, biztypeInput, cityInput, genderInput];

  var valid = true;
  requiredInputs.forEach(function (input) {
    if (!input.value.trim()) { input.style.borderColor = 'var(--red)'; valid = false; }
    else { input.style.borderColor = 'var(--green-400)'; }
  });
  var dobValue = getDobValue('teaser-dob');
  if (!dobValue) { dobInput.style.borderColor = 'var(--red)'; valid = false; }
  else { dobInput.style.borderColor = 'var(--green-400)'; }
  if (!valid) { showToast('⚠️ Please fill in all fields to continue.', 'warning'); return; }

  try {
    sessionStorage.setItem('ee_vendor_prefill', JSON.stringify({
      businessName: bizInput.value.trim(),
      email: emailInput.value.trim(),
      businessType: biztypeInput.value,
      address: addressInput.value.trim(),
      city: cityInput.value,
      dob: dobValue,
      gender: genderInput.value,
      phone: phoneInput.value.trim(),
      plan: planInput.value
    }));
  } catch (e) { /* sessionStorage unavailable — register.html just opens blank */ }

  btn.textContent = 'Taking you to sign up…';
  btn.disabled = true;
  window.location.href = 'register.html?role=vendor';
}

/* ── WALLET CREDIT (store credit balance) ──────────────────────────────────
   Stored per-user on the ee_users record as `creditBalance` (a number, in
   dollars). Used when a paid order is cancelled within its 15-minute window —
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
  'coffee-cake': { name: 'Coffee & Cake Bundle', vendor: 'EL&N London - The Avenues', area: 'The Avenues', dist: '0.2km', description: 'A cozy end-of-day bundle from EL&N London — a rich espresso-based coffee paired with a slice of their signature homemade cake. Made fresh this morning and pulled from the display case before closing.', address: 'EL&N London, The Avenues, Manama, Bahrain', lat: 26.2475, lng: 50.5858 },
  'croissant-box': { name: 'Croissant Box - 4 Pieces', vendor: 'Romeos Cafe - City Centre', area: 'City Centre Bahrain', dist: '0.3km', description: 'Four buttery, flaky croissants baked this morning at Romeos Cafe. Perfect for breakfast tomorrow — just a day away from being tossed, but still soft and fresh.', address: 'Romeos Cafe, City Centre Bahrain, Seef, Bahrain', lat: 26.234528, lng: 50.5525 },
  'pizza-margherita': { name: 'Margherita Pizza  - Large', vendor: 'Blaza Pizza - Al Liwan', area: 'Al Liwan', dist: '0.4km', description: 'A whole wood-fired Margherita pizza from Blaza Pizza, made with San Marzano tomatoes, fresh mozzarella and basil. Extra from tonight\'s dinner service.', address: 'Blaza Pizza, Al Liwan, Hamala, Bahrain', lat: 26.164145, lng: 50.468918 },
  'sushi-platter': { name: 'Sushi Salmon & California Roll Platter (8 pcs)', vendor: 'Sushi Library - Marrasi Galleria', area: 'Marassi Galleria', dist: '0.8km', description: 'Eight pieces of salmon nigiri and California rolls from Sushi Library, prepared today with fresh fish. Best enjoyed within the pickup window.', address: 'Sushi Library, Marassi Galleria, Diyar Al Muharraq, Bahrain', lat: 26.304737, lng: 50.642284 },
  'mezze-platter': { name: 'Mezze Platter', vendor: 'Yasmine Lebanese Cafe - The Avenues', area: 'The Avenues', dist: '0.5km', description: 'A generous vegan mezze spread from Yasmine Lebanese Cafe — hummus, moutabal, tabbouleh, olives and warm pita. Last one from today\'s lunch prep.', address: 'Yasmine Lebanese Cafe, The Avenues, Manama, Bahrain', lat: 26.245120, lng: 50.584654 },
  'sourdough-loaf': { name: 'Sourdough Loaf', vendor: 'Hypermax - City Centre', area: 'City Centre Bahrain', dist: '0.5km', description: 'A naturally leavened sourdough loaf, baked this morning at Hypermax. Slightly firmer crust by evening but perfect for toasting.', address: 'Hypermax, City Centre Bahrain, Seef, Bahrain', lat: 26.234528, lng: 50.5525 },
  'grilled-chicken': { name: 'Grilled Chicken Meal', vendor: 'Alhan Lebanese Restaurant - Al Liwan', area: 'Al Liwan', dist: '0.6km', description: 'A hearty grilled chicken meal with rice and grilled vegetables from Alhan Lebanese Restaurant — today\'s lunch special, one portion left.', address: 'Alhan Lebanese Restaurant, Al Liwan, Hamala, Bahrain', lat: 26.162545, lng: 50.471218 },
  'avocado-bowl': { name: 'Avocado Grain Bowl', vendor: 'Crumbles Cafe - Marrasi Galleria', area: 'Marassi Galleria', dist: '0.5km', description: 'A fresh grain bowl with avocado, quinoa, roasted chickpeas and tahini dressing from Crumbles Cafe. Made in-house today.', address: 'Crumbles Cafe, Marrasi Galleria, Diyar Al Muharraq, Bahrain', lat: 26.303337, lng: 50.644284 },
  'cupcake-box': { name: 'Cupcake Box (6 pcs)', vendor: 'Tim Hortons - The Avenues', area: 'The Avenues', dist: '0.3km', description: 'Six assorted cupcakes with buttercream frosting from Tim Hortons, baked this morning for today\'s counter display.', address: 'Tim Hortons, The Avenues, Manama, Bahrain', lat: 26.2473, lng: 50.5872 },
  'lamb-kofta': { name: 'Lamb Kofta Platter', vendor: 'Allo Beirut - City Centre', area: 'City Centre Bahrain', dist: '0.7km', description: 'A generous lamb kofta platter with rice, grilled vegetables and garlic sauce from Allo Beirut — extra portions from tonight\'s service.', address: 'Allo Beirut, City Centre Bahrain, Seef, Bahrain', lat: 26.234528, lng: 50.5525 },
  'veggie-ramen': { name: 'Veggie Ramen Bowl', vendor: 'China Garden - Al Liwan', area: 'Al Liwan', dist: '0.5km', description: 'A warm bowl of vegan ramen with miso broth, tofu and seasonal vegetables from China Garden. Freshly prepared today.', address: 'China Garden, Al Liwan, Hamala, Bahrain', lat: 26.163845, lng: 50.470718 },
  'falafel-wrap': { name: 'Falafel Wrap Combo', vendor: 'Awani Restaurant - Marrasi Galleria', area: 'Marassi Galleria', dist: '0.4km', description: 'A falafel wrap combo with hummus, pickles and fries from Awani Restaurant — made fresh for today\'s lunch rush, one left.', address: 'Awani Restaurant, Marassi Galleria, Diyar Al Muharraq, Bahrain', lat: 26.304537, lng: 50.643884 },
  'biryani-hamad': { name: 'Lamb Biryani - Large', vendor: 'Sangam Indian Cusine Seef - Aali Mall', area: 'Seef', dist: '0.4km', description: 'A family-size lamb biryani with fragrant basmati rice and slow-cooked lamb from Sangam Indian Cusine Seef — today\'s signature dish.', address: 'Sangam Indian Cusine, Seef, Bahrain', lat: 26.232463, lng: 50.540016 },
  'pastries-isa': { name: 'Mix Pastries', vendor: 'Lulu Hypermarket Saar - Atrium Mall', area: 'Saar', dist: '0.3km', description: 'An assorted box of fresh pastries from Lulu Hypermarket, baked this morning — croissants, danishes and more.', address: 'Lulu Hypermarket, Saar, Bahrain', lat: 26.175956, lng: 50.483521 },
  'burger-juffair': { name: 'Smash Burger Meal', vendor: 'Supernova - The Avenues', area: 'The Avenues', dist: '0.6km', description: 'A smash burger meal with fries from Supernova — extra patties from tonight\'s dinner rush, last chance before close.', address: 'Supernova, The Avenues, Manama, Bahrain', lat: 26.2463, lng: 50.5856 },
  'poke-seef': { name: 'Tuna Poke Bowl', vendor: 'Alusia Restaurant - City Centre', area: 'City Centre Bahrain', dist: '0.4km', description: 'A fresh tuna poke bowl with rice, edamame and sesame dressing from Alusia Restaurant, prepared today.', address: 'Alusia Restaurant, City Centre Bahrain, Seef, Bahrain', lat: 26.234528, lng: 50.5525 },
  'hummus-zinj': { name: 'Hummus & Pita Platter', vendor: 'Shoo Fee Ma Fee Restaurant - Al Liwan', area: 'Al Liwan', dist: '0.3km', description: 'A generous hummus and warm pita platter from Shoo Fee Ma Fee Restaurant, made fresh with today\'s batch of chickpeas.', address: 'Shoo Fee Ma Fee Restaurant, Al Liwan, Hamala, Bahrain', lat: 26.162745, lng: 50.469118 },
};

/* Builds the "Vendor · Area" label shown under each item in the checkout
   modal's itemized list. Falls back to the vendor name alone if the item
   isn't in EE_ITEM_DETAILS or has no area on file. */
function vendorLineWithArea(itemId, vendorFallback) {
  var details = (typeof EE_ITEM_DETAILS !== 'undefined' && itemId) ? EE_ITEM_DETAILS[itemId] : null;
  var vendor = (details && details.vendor) || vendorFallback || '';
  var area = details && details.area;
  if (!area) return vendor;

  // The vendor string often already ends with "- <area>" (e.g. "Blaza Pizza - Al Liwan",
  // "Romeos Cafe - City Centre"). Compare the vendor's trailing segment to the area word-by-word
  // (not just exact substring) so near-matches like "City Centre" vs "City Centre Bahrain" or
  // "Marrasi Galleria" vs "Marassi Galleria" are still caught, rather than getting appended again.
  var suffix = vendor.split(' - ').pop().toLowerCase();
  var areaLower = area.toLowerCase();
  var suffixWords = suffix.split(/\s+/).filter(function (w) { return w.length >= 4; });
  var isDuplicate = suffixWords.some(function (w) { return areaLower.indexOf(w) !== -1; });

  return isDuplicate ? vendor : (vendor + ' · ' + area);
}

/* ── DOM-READY SECTION ── */
document.addEventListener('DOMContentLoaded', function () {

  /* If the shopper clicked "Checkout" on a page with no payment modal,
     they were sent here with this flag set — open checkout automatically
     once this page's own checkout hook is ready. */
  if (sessionStorage.getItem('ee_open_checkout_on_load') === '1') {
    sessionStorage.removeItem('ee_open_checkout_on_load');
    setTimeout(function () {
      if (typeof window.openCartCheckout === 'function' && getCart().length) {
        window.openCartCheckout(getCart());
      }
    }, 300);
  }


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

  /* ── LIVE PRICE COUNTDOWN — now uses full Price(t) formula ──
     Each config below is keyed by itemId and looked up against the
     matching .listing-card on the page (via data-item-id), rather than
     assumed to line up positionally with the DOM order of the price
     elements. That positional assumption previously caused every card
     to display another item's computed price whenever the array order
     didn't exactly match the card order in the markup. */
  var priceConfig = {
    'coffee-cake': { base: 4.00, floor: 1.00, curve: 'exponential', expMin: 45 },
    'croissant-box': { base: 4.70, floor: 1.50, curve: 'exponential', expMin: 80 },
    'sourdough-loaf': { base: 2.10, floor: 2.00, curve: 'linear', expMin: 120 },
    'sushi-platter': { base: 5.90, floor: 4.00, curve: 'stepped', expMin: 100 },
    'mezze-platter': { base: 5.50, floor: 3.00, curve: 'linear', expMin: 180 },
    'pizza-margherita': { base: 5.00, floor: 2.50, curve: 'exponential', expMin: 60 }
  };

  var priceCards = document.querySelectorAll('.listing-card[data-item-id]');

  if (priceCards.length) {
    // Record a page-view for each visible listing item that has pricing config
    priceCards.forEach(function (card) {
      var itemId = card.getAttribute('data-item-id');
      if (priceConfig[itemId]) recordView(itemId);
    });

    // NOTE: the after-discount price shown on each card is intentionally
    // fixed to whatever's authored in the HTML (e.g. "BD 2.50") — it is
    // no longer recomputed/overwritten here. The "before discount" (was)
    // price stays static in the markup as it always has. The decay bar /
    // urgency color below is purely a visual indicator of time-to-expiry
    // and no longer drives the displayed price.
    setInterval(function () {
      priceCards.forEach(function (card) {
        var itemId = card.getAttribute('data-item-id');
        var p = priceConfig[itemId];
        if (!p) return;
        var priceEl = card.querySelector('.listing-price-current');
        var barEl = card.querySelector('.decay-bar-fill');
        if (!priceEl) return;
        var elapsed = ((Date.now() / 1000) % (p.expMin * 60)) / 60; // simulated elapsed minutes
        var fraction = elapsed / p.expMin;
        if (fraction > 0.7) priceEl.style.color = 'var(--orange)';
        if (barEl) barEl.style.width = Math.min(98, 15 + fraction * 85) + '%';
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
    // NOTE: phone-mockup prices must always match the corresponding listing
    // card exactly. Listing prices are static (authored in HTML, never
    // recomputed — see note above), so the phone mockup mirrors that same
    // static value instead of independently recalculating Price(t). Two
    // separate calls to the pricing formula would drift apart over time
    // (different elapsed-time snapshots), which is what caused the phone
    // and listing prices to show different discounted amounts.
    var syncPhonePrices = function () {
      phonePriceEls.forEach(function (el) {
        var itemId = el.getAttribute('data-item-id');
        var listingCard = document.querySelector('.listing-card[data-item-id="' + itemId + '"]');
        var listingPriceEl = listingCard && listingCard.querySelector('.listing-price-current');
        if (listingPriceEl) {
          el.textContent = listingPriceEl.textContent;
        }
      });
    };
    syncPhonePrices();
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
    { id: 'coffee-cake', name: 'Coffee & Cake Bundle', vendor: 'EL&N London - The Avenues · 0.2km', price: '2.75', was: '4.00', timer: '30m', img: 'https://images.unsplash.com/photo-1455731248858-078f60393874?w=120&q=80&fit=crop&auto=format' },
    { id: 'croissant-box', name: 'Croissant - 4 Pieces', vendor: 'Romeos Cafe - City Centre · 0.3km', price: '2.80', was: '4.70', timer: '45m', img: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=120&q=80&fit=crop&auto=format' },
    { id: 'pizza-margherita', name: 'Margherita Pizza - Large', vendor: 'Blaza Pizza - Al Liwan · 0.6km', price: '3.00', was: '5.00', timer: '1h', img: 'data:image/jpeg;base64,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' },
    { id: 'sushi-platter', name: 'Sushi Salmon & California Roll Platter (8 pcs)', vendor: 'Sushi Library - Marrasi Galleria · 0.8km', price: '3.40', was: '5.90', timer: '1h 20m', img: 'https://images.unsplash.com/photo-1579584425555-c3ce17fd4351?w=120&q=80&fit=crop&auto=format' },
    { id: 'mezze-platter', name: 'Mezze Platter', vendor: 'Yasmine Lebanese Cafe - The Avenues · 0.5km', price: '4.00', was: '5.50', timer: '3h', img: 'https://gimmedelicious.com/wp-content/uploads/2025/03/Mezzeh-Platter-1.jpg' },
    { id: 'sourdough-loaf', name: 'Sourdough Loaf', vendor: 'Hypermax - City Centre · 1.1km', price: '1.20', was: '2.10', timer: '2h', img: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=120&q=80&fit=crop&auto=format' },
    { id: 'grilled-chicken', name: 'Grilled Chicken Meal', vendor: 'Alhan Lebanese Restaurant - Al Liwan · 0.7km', price: '4.30', was: '6.00', timer: '1.5h', img: 'https://images.unsplash.com/photo-1598515214211-89d3c73ae83b?w=120&q=80&fit=crop&auto=format' },
    { id: 'avocado-bowl', name: 'Avocado Grain Bowl', vendor: 'Crumbles Cafe - Marrasi Galleria · 0.9km', price: '3.00', was: '4.00', timer: '2.5h', img: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=120&q=80&fit=crop&auto=format' },
    { id: 'cupcake-box', name: 'Cupcake Box (6 pcs)', vendor: 'Tim Hortons - The Avenues · 0.4km', price: '2.30', was: '4.00', timer: '50m', img: 'https://images.unsplash.com/photo-1486427944299-d1955d23e34d?w=120&q=80&fit=crop&auto=format' },
    { id: 'lamb-kofta', name: 'Lamb Kofta Platter', vendor: "Allo Beirut - City Centre · 1.2km", price: '3.00', was: '4.50', timer: '1h 40m', img: 'data:image/jpeg;base64,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' },
    { id: 'veggie-ramen', name: 'Veggie Ramen Bowl', vendor: 'China Garden - Al Liwan · 1.4km', price: '3.50', was: '4.50', timer: '3.5h', img: 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=120&q=80&fit=crop&auto=format' },
    { id: 'falafel-wrap', name: 'Falafel Wrap Combo', vendor: 'Awani Restaurant - Marrasi Galleria · 0.5km', price: '2.50', was: '3.80', timer: '1h 10m', img: 'https://images.unsplash.com/photo-1562059390-a761a084768e?w=120&q=80&fit=crop&auto=format' },
    { id: 'biryani-hamad', name: 'Lamb Biryani - Large', vendor: 'Sangam Indian Cusine Seef - Aali Mall · 11.8km', price: '4.80', was: '6.50', timer: '1h 15m', img: 'data:image/jpeg;base64,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' },
    { id: 'pastries-isa', name: 'Mix Pastries', vendor: 'Lulu Hypermarket Saar - Atrium Mall · 8.6km', price: '2.30', was: '3.50', timer: '1.5h', img: 'data:image/jpeg;base64,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' },
    { id: 'burger-juffair', name: 'Smash Burger Meal', vendor: 'Supernova - The Avenues · 2.1km', price: '4.50', was: '6.50', timer: '35m', img: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=120&q=80&fit=crop&auto=format' },
    { id: 'poke-seef', name: 'Tuna Poke Bowl', vendor: 'Alusia Restaurant - City Centre · 3.0km', price: '2.90', was: '3.90', timer: '50m', img: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=120&q=80&fit=crop&auto=format' },
    { id: 'hummus-zinj', name: 'Hummus & Pita Platter', vendor: 'Shoo Fee Ma Fee Restaurant - Al Liwan · 2.5km', price: '2.50', was: '3.50', timer: '2h 20m', img: 'data:image/jpeg;base64,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' }
  ];

  // ── HERO "closest deal to you" STAT ──────────────────────────────────
  // Used to be a hardcoded "0.3km" that never matched reality. Compute it
  // the same way listings.html does: real straight-line (haversine)
  // distance from the shopper's actual location to every vendor we have
  // coordinates for, then take the minimum. Falls back to central Manama
  // if location access is denied/unavailable, same as listings.html.
  var heroClosestDealEl = document.getElementById('heroClosestDeal');
  if (heroClosestDealEl) {
    var heroHaversineKm = function (lat1, lng1, lat2, lng2) {
      var R = 6371;
      var dLat = (lat2 - lat1) * Math.PI / 180;
      var dLng = (lng2 - lng1) * Math.PI / 180;
      var a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLng / 2) ** 2;
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    };
    var applyHeroClosestDeal = function (userLat, userLng) {
      var closestKm = Infinity;
      for (var key in EE_ITEM_DETAILS) {
        var d = EE_ITEM_DETAILS[key];
        if (typeof d.lat !== 'number' || typeof d.lng !== 'number') continue;
        var km = heroHaversineKm(userLat, userLng, d.lat, d.lng);
        if (km < closestKm) closestKm = km;
      }
      if (closestKm === Infinity) return;
      heroClosestDealEl.textContent = (closestKm < 10 ? closestKm.toFixed(1) : Math.round(closestKm)) + 'km';
    };
    var HERO_MANAMA_FALLBACK = { lat: 26.2285, lng: 50.5860 };
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        function (pos) { applyHeroClosestDeal(pos.coords.latitude, pos.coords.longitude); },
        function () { applyHeroClosestDeal(HERO_MANAMA_FALLBACK.lat, HERO_MANAMA_FALLBACK.lng); },
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }
      );
    } else {
      applyHeroClosestDeal(HERO_MANAMA_FALLBACK.lat, HERO_MANAMA_FALLBACK.lng);
    }
    window.addEventListener('ee:location-granted', function (e) {
      applyHeroClosestDeal(e.detail.lat, e.detail.lng);
    });
  }

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
        '<span class="ppc-price">BD ' + item.price + '</span>' +
        '<span class="ppc-was">BD ' + item.was + '</span>' +
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
        if (phoneMockLabel) phoneMockLabel.textContent = 'Live Deals 🔥';
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

    /* ── LIVE-FEELING ROTATION ──────────────────────────────────────────
       The 3 "Live Deals" cards used to be permanently hard-coded to the
       same croissant/sushi/sourdough trio. Every few seconds, swap in a
       fresh random trio from the same full catalog the search bar uses,
       so the hero genuinely looks like deals are updating in real time.
       Paused while the shopper is actively searching (input has a value)
       so their results aren't yanked out from under them, and resumes
       cleanly once they clear the box. */
    var pickRandomPhoneCards = function (count) {
      var pool = EE_FULL_CATALOG.slice();
      var picks = [];
      while (picks.length < count && pool.length) {
        var idx = Math.floor(Math.random() * pool.length);
        picks.push(pool.splice(idx, 1)[0]);
      }
      return picks;
    };

    var rotatePhoneCards = function () {
      if (phoneMockSearch.value.trim()) return; // don't disrupt an active search
      var picks = pickRandomPhoneCards(3);
      if (!picks.length) return;
      phoneMockDefaultHTML = picks.map(renderPhoneCard).join('');
      phoneMockCardsWrap.innerHTML = phoneMockDefaultHTML;
      if (phoneMockLabel) phoneMockLabel.textContent = 'Live Deals 🔥';
      bindPhoneCardClicks();
    };

    setInterval(rotatePhoneCards, 120000); // every 2 minutes
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
            priceCurrent: priceEl ? priceEl.textContent.replace('BD', '').trim() : null,
            priceWas: wasEl ? wasEl.textContent.replace('BD', '').trim() : null,
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
      if (e.target.closest('.listing-reserve-btn, .listing-cancel-timer, .listing-vim-btn')) return; // Interactive card controls have their own handlers
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
          priceCurrent: priceEl ? priceEl.textContent.replace('BD', '').trim() : null,
          priceWas: wasEl ? wasEl.textContent.replace('BD', '').trim() : null,
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

  /* ── AUTH-AWARE NAVBAR ──
     Exposed on window so pages with in-page tab navigation (like the
     dashboard's sidebar tabs, which don't trigger a full reload) can
     re-run this after switching tabs and updating the hash, keeping the
     navbar's Browse Deals/My Orders buttons in sync without a refresh. */
  function eeRenderAuthNavbar() {
    var raw = localStorage.getItem('ee_current_user');
    if (!raw) return;
    try {
      var user = JSON.parse(raw);
      var cta = document.querySelector('.nav-cta');
      if (cta && user) {
        var dashUrl = user.role === 'vendor' ? 'vendor-dashboard.html' : 'consumer-dashboard.html';
        var firstName = (user.name || 'Account').split(' ')[0];

        // Figure out which page we're currently on (works for nested paths too)
        var currentPage = window.location.pathname.split('/').pop() || 'index.html';
        var onOwnDashboard = currentPage === dashUrl;
        var onMyOrdersPage = onOwnDashboard && window.location.hash === '#reservations';

        // Accounts that hold both roles (this email has signed up as both
        // a consumer and a vendor at some point) get to flip which
        // dashboard they're acting as without signing out.
        var roles = eeUserRoles(user);
        var hasBothRoles = roles.length > 1;
        var otherRole = user.role === 'vendor' ? 'consumer' : 'vendor';
        var otherLabel = otherRole === 'vendor' ? 'Switch to Vendor' : 'Switch to Consumer';
        var switchRoleBtnHtml = '<button type="button" class="btn btn-primary btn-sm nav-dash-btn" onclick="eeSwitchActiveRole(\'' + otherRole + '\')">' + otherLabel + '</button>';

        // The button in this slot depends on where they're standing:
        //  - On the My Orders tab: nothing — "My Orders" already sits in
        //    the navbar and a second pill next to it was redundant.
        //  - On their own dashboard, dual-role account: "Switch to
        //    Vendor"/"Switch to Consumer" takes this slot instead of
        //    "Browse Deals", so they flip roles without leaving the page.
        //  - On their own dashboard, single-role vendor: nothing —
        //    "Browse Deals" doesn't apply to a vendor-only account.
        //  - On their own dashboard, single-role consumer: the usual
        //    "Browse Deals" button with a little jumping arrow.
        //  - Anywhere else on the site: "My Dashboard" as usual.
        var actionBtnHtml = onMyOrdersPage
          ? ''
          : onOwnDashboard
            ? (hasBothRoles
              ? switchRoleBtnHtml
              : user.role === 'vendor'
                ? ''
                : '<a href="listings.html" class="btn btn-primary btn-sm nav-browse-deals nav-dash-btn"><span class="jump-arrow">→</span> Browse Deals</a>')
            : '<a href="' + dashUrl + '" class="btn btn-primary btn-sm nav-dash-btn">My Dashboard</a>';

        // Hide the "My Orders" pill while sitting anywhere else on the
        // dashboard (Overview, My Impact, Notifications, etc.) — it's
        // redundant with the sidebar there. It reappears on the My Orders
        // tab itself and on every other page across the site.
        var myOrdersHtml = (onOwnDashboard && !onMyOrdersPage)
          ? ''
          : '<a href="consumer-dashboard.html#reservations" class="btn btn-primary btn-sm nav-dash-btn nav-myorders-btn">My Orders</a>';

        // Away from their own dashboard, a dual-role account still gets
        // the "Switch to…" button alongside "My Dashboard" — this is the
        // one spot it appears separately, since "My Dashboard" occupies
        // the actionBtnHtml slot there.
        var switchRoleHtml = (hasBothRoles && !onOwnDashboard) ? switchRoleBtnHtml : '';

        cta.innerHTML = '<button class="btn btn-sm" style="background:var(--bg);color:var(--text-soft);border:1px solid var(--border);cursor:default;font-weight:700" disabled>Welcome, ' + firstName + '</button>' +
          switchRoleHtml +
          actionBtnHtml +
          myOrdersHtml;
      }
    } catch (e) { }
  }
  window.eeRenderAuthNavbar = eeRenderAuthNavbar;
  eeRenderAuthNavbar();

  /* ── SWITCH ACTIVE ROLE (Switch to Vendor / Switch to Consumer) ──
     Flips which role the current session acts as, on an account that
     holds both roles, then sends them to that role's dashboard. Only
     touches ee_current_user (the active-session marker) — same as the
     "Continue as…" chooser in login.html, it never rewrites the `role`
     field on the underlying ee_users record. If the vendor profile is
     still pending, vendor-dashboard.html's own pending-approval screen
     takes it from there. */
  function eeSwitchActiveRole(newRole) {
    var raw = localStorage.getItem('ee_current_user');
    if (!raw) return;
    try {
      var user = JSON.parse(raw);
      user.role = newRole;
      localStorage.setItem('ee_current_user', JSON.stringify(user));
      window.location.href = newRole === 'vendor' ? 'vendor-dashboard.html' : 'consumer-dashboard.html';
    } catch (e) { }
  }
  window.eeSwitchActiveRole = eeSwitchActiveRole;

  /* ── EDIT PROFILE MODAL FALLBACK (every page without its own) ──
     Must run before injectSettingsUI() below, since its Profile section
     checks for openEditProfileModal to decide whether to render. On
     consumer-dashboard.html/vendor-dashboard.html this is a no-op — their
     own inline scripts (which run before this DOMContentLoaded handler)
     already defined a richer, page-specific version. */
  injectEditProfileModalUI();

  /* ── SETTINGS MODAL (every page) ── */
  injectSettingsUI();

  /* ── LEFT-SIDE MENU (every page) ──
     Single "≡" button holding Get Help / Settings / My Orders — must run
     after injectSettingsUI() so openSettingsModal() and its modal DOM
     already exist for the Settings item to open. */
  injectNavMenuUI();

  /* ── MY ORDERS — GUEST STATE (every page) ──
     Must run before injectCartUI() below, which looks for an existing
     .nav-myorders-btn to slot "My Cart" in right before it. No-ops
     entirely once signed in (eeRenderAuthNavbar's own pill already
     exists by the time this runs). */
  injectGuestOrdersUI();

  /* ── CART ICON + DRAWER (every page) ──
     Injected last, after the auth-aware navbar block above, since that
     block replaces .nav-cta's innerHTML entirely when the shopper is
     signed in — injecting any earlier would just get wiped out. The
     "My Cart" button is appended after "Sign Out" / "My Dashboard" on
     the right side of the navbar. */
  injectCartUI();

  /* ── LIVE CHAT (every page) ── */
  injectLiveChatUI();

  /* ── HELP PAGE DIRECTORY (help.html only — no-ops elsewhere) ── */
  renderHelpDirectory();

});