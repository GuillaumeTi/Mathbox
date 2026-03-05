// Stripe Singleton Service
// Gracefully returns null if STRIPE_SECRET_KEY is not configured

let stripe = null;

if (process.env.STRIPE_SECRET_KEY) {
    const Stripe = require('stripe');
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
        apiVersion: '2024-12-18.acacia',
    });
    console.log('[Stripe] Initialized with API key');
} else {
    console.warn('[Stripe] STRIPE_SECRET_KEY not set — Stripe features disabled');
}

function getStripe() {
    return stripe;
}

module.exports = { stripe, getStripe };
