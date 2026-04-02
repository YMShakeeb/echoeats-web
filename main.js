/* ============================================================
   EchoEats — Main JavaScript
   ============================================================ */

/* ── NAVBAR SCROLL EFFECT ── */
const navbar = document.getElementById('navbar');
window.addEventListener('scroll', () => {
  navbar.classList.toggle('scrolled', window.scrollY > 20);
});

/* ── SCROLL REVEAL ANIMATIONS ── */
const revealEls = document.querySelectorAll('.reveal');
const observer  = new IntersectionObserver(
  (entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('visible');
        observer.unobserve(e.target);
      }
    });
  },
  { threshold: 0.12 }
);
revealEls.forEach(el => observer.observe(el));

/* ── LIVE PRICE COUNTDOWN SIMULATION ── */
// Simulates real-time price drops on the listing cards
function simulatePriceUpdates() {
  const prices = [
    { el: null, base: 2.50, floor: 1.00, expMin: 45  },
    { el: null, base: 8.00, floor: 4.00, expMin: 80  },
    { el: null, base: 3.50, floor: 1.50, expMin: 120 },
    { el: null, base: 6.00, floor: 3.00, expMin: 180 },
    { el: null, base: 5.00, floor: 2.00, expMin: 60  },
    { el: null, base: 2.75, floor: 1.00, expMin: 30  },
  ];
  const priceEls = document.querySelectorAll('.listing-price-current');
  const barEls   = document.querySelectorAll('.decay-bar-fill');

  if (!priceEls.length) return;

  // Tick every 3 seconds to simulate live pricing
  setInterval(() => {
    prices.forEach((p, i) => {
      if (!priceEls[i]) return;
      // Exponential decay simulation
      const now     = Date.now();
      const elapsed = ((now / 1000) % p.expMin) / p.expMin; // 0→1 cycle
      const decay   = Math.max(p.floor, p.base * (1 - elapsed * 0.6));
      priceEls[i].textContent = '$' + decay.toFixed(2);
      priceEls[i].style.transition = 'color 0.5s';
      if (elapsed > 0.7) {
        priceEls[i].style.color = 'var(--orange)';
      }
      // Update bar width
      if (barEls[i]) {
        const barW = Math.min(98, 15 + elapsed * 85);
        barEls[i].style.width = barW + '%';
      }
    });
  }, 3000);
}
simulatePriceUpdates();

/* ── RESERVE BUTTON ── */
function reserveItem(btn, name) {
  const orig = btn.textContent;
  btn.textContent = '✓ Reserved!';
  btn.style.background = 'var(--green-400)';
  btn.style.color = 'var(--dark)';
  btn.disabled = true;

  // Show toast
  showToast(`🎉 "${name}" reserved! Pick up within 15 minutes.`);

  setTimeout(() => {
    btn.textContent = orig;
    btn.style.background = '';
    btn.style.color = '';
    btn.disabled = false;
  }, 4000);
}

/* ── VENDOR SIGNUP ── */
function vendorSignup(btn) {
  const form = btn.closest('.vendor-cta-form');
  const inputs = form.querySelectorAll('.form-input, .form-select');
  let valid = true;

  inputs.forEach(input => {
    if (!input.value.trim()) {
      input.style.borderColor = 'var(--red)';
      valid = false;
    } else {
      input.style.borderColor = 'var(--green-400)';
    }
  });

  if (!valid) {
    showToast('⚠️ Please fill in all fields to continue.', 'warning');
    return;
  }

  btn.textContent = '✓ Application Received!';
  btn.style.background = 'var(--green-400)';
  btn.disabled = true;
  showToast('🚀 Welcome to EchoEats! We\'ll be in touch within 24 hours.');
}

/* ── TOAST NOTIFICATION ── */
function showToast(message, type = 'success') {
  // Remove existing toast
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    bottom: 32px;
    left: 50%;
    transform: translateX(-50%) translateY(80px);
    background: ${type === 'warning' ? '#1a1a1a' : 'var(--green-800)'};
    color: white;
    padding: 14px 28px;
    border-radius: 100px;
    font-size: 14px;
    font-weight: 600;
    font-family: var(--font-main);
    box-shadow: 0 8px 32px rgba(0,0,0,0.25);
    z-index: 9999;
    transition: transform 0.4s cubic-bezier(0.34,1.56,0.64,1);
    white-space: nowrap;
    border: 1px solid ${type === 'warning' ? '#444' : 'var(--green-600)'};
  `;
  document.body.appendChild(toast);
  requestAnimationFrame(() => {
    toast.style.transform = 'translateX(-50%) translateY(0)';
  });
  setTimeout(() => {
    toast.style.transform = 'translateX(-50%) translateY(80px)';
    setTimeout(() => toast.remove(), 400);
  }, 3500);
}

/* ── SMOOTH ACTIVE NAV LINK ── */
const sections = document.querySelectorAll('section[id]');
const navLinks  = document.querySelectorAll('.nav-links a');
window.addEventListener('scroll', () => {
  let current = '';
  sections.forEach(sec => {
    if (window.scrollY >= sec.offsetTop - 100) current = sec.id;
  });
  navLinks.forEach(a => {
    a.classList.toggle('active', a.getAttribute('href') === `#${current}`);
  });
});

/* ── BADGE HOVER ── */
document.querySelectorAll('.badge-item:not(.locked)').forEach(badge => {
  badge.addEventListener('click', () => {
    const name = badge.querySelector('.badge-name').textContent;
    showToast(`🏅 Badge unlocked: "${name}"!`);
  });
});
