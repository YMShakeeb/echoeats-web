// netlify/functions/create-payment-intent.js
//
// This is the ONE piece of "real Apple Pay" that cannot live in the
// browser: creating a Stripe PaymentIntent requires your Stripe SECRET
// key, which must never be shipped to client-side JS. Netlify Functions
// run this on Netlify's servers instead, where the secret key stays
// hidden as an environment variable.
//
// SETUP:
//   1. npm install stripe --save   (run this inside netlify/functions/,
//      or add "stripe" to a package.json at your repo root — Netlify
//      will install it during the build)
//   2. In the Netlify dashboard: Site settings → Environment variables
//      → add STRIPE_SECRET_KEY = sk_test_... (from your Stripe Dashboard)
//   3. In your Stripe Dashboard: Settings → Payment methods → Apple Pay
//      → add your Netlify domain (e.g. your-site.netlify.app) so Apple
//      will trust payment requests coming from it.
//   4. Deploy. The function is then reachable at:
//      https://your-site.netlify.app/.netlify/functions/create-payment-intent
//
// This matches CREATE_PAYMENT_INTENT_URL in listings.html.

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { amount, currency, description } = JSON.parse(event.body || '{}');

    // Basic server-side validation — never trust the amount blindly from
    // the client in a real production app; in a course project this is
    // fine, but note the improvement for anyone reading the code.
    const safeAmount = Math.max(50, Math.round(Number(amount) || 0));
    const safeCurrency = (currency || 'bhd').toLowerCase();

    const paymentIntent = await stripe.paymentIntents.create({
      amount: safeAmount,
      currency: safeCurrency,
      description: description || 'EchoEats order',
      automatic_payment_methods: { enabled: true },
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientSecret: paymentIntent.client_secret }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
