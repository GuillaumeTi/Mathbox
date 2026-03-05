// Backend Stripe Routes
// Subscription + Credit Payments — Embedded (no redirects)
const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const authMiddleware = require('../middleware/auth');
const { getStripe } = require('../services/stripe');

const prisma = new PrismaClient();

// ============ HELPERS ============

// Get or create a Stripe Customer for a user
async function ensureStripeCustomer(userId) {
    const stripe = getStripe();
    if (!stripe) throw new Error('Stripe not configured');

    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, name: true, stripeCustomerId: true },
    });

    if (!user) throw new Error('User not found');

    if (user.stripeCustomerId) {
        return user.stripeCustomerId;
    }

    // Create a new Stripe customer
    const customer = await stripe.customers.create({
        email: user.email,
        name: user.name,
        metadata: { userId: user.id },
    });

    await prisma.user.update({
        where: { id: userId },
        data: { stripeCustomerId: customer.id },
    });

    return customer.id;
}

// Look up the default price for a product
async function getProductPrice(productId) {
    const stripe = getStripe();
    const prices = await stripe.prices.list({
        product: productId,
        active: true,
        limit: 1,
    });
    if (prices.data.length === 0) {
        throw new Error(`No active price found for product ${productId}`);
    }
    return prices.data[0];
}

// ============ ROUTES ============

// GET /api/stripe/config — Return public key for frontend
router.get('/config', (req, res) => {
    res.json({
        publishableKey: process.env.STRIPE_PUBLIC_KEY || null,
    });
});

// GET /api/stripe/status — Return subscription + credit status
router.get('/status', authMiddleware, async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: {
                subscriptionStatus: true,
                stripeSubscriptionId: true,
                stripeCustomerId: true,
                credits: true,
            },
        });

        res.json({
            subscriptionStatus: user.subscriptionStatus,
            stripeSubscriptionId: user.stripeSubscriptionId,
            credits: user.credits,
            hasStripeCustomer: !!user.stripeCustomerId,
        });
    } catch (error) {
        console.error('[Stripe] Status error:', error);
        res.status(500).json({ error: 'Failed to get status' });
    }
});

// POST /api/stripe/create-subscription — Create subscription with incomplete status
// Returns clientSecret for the PaymentElement to confirm payment inline
router.post('/create-subscription', authMiddleware, async (req, res) => {
    try {
        const stripe = getStripe();
        if (!stripe) return res.status(400).json({ error: 'Stripe not configured' });

        if (req.user.role !== 'PROFESSOR') {
            return res.status(403).json({ error: 'Only professors can subscribe' });
        }

        const customerId = await ensureStripeCustomer(req.user.id);
        const productId = process.env.STRIPE_10SUB_ID;
        if (!productId) return res.status(500).json({ error: 'Subscription product not configured' });

        // Find the price for this product
        const price = await getProductPrice(productId.trim());

        // Create subscription with incomplete status — awaits payment
        const subscription = await stripe.subscriptions.create({
            customer: customerId,
            items: [{ price: price.id }],
            payment_behavior: 'default_incomplete',
            payment_settings: {
                save_default_payment_method: 'on_subscription',
            },
            expand: ['latest_invoice.payment_intent'],
            metadata: { userId: req.user.id },
        });

        // Save subscription ID
        await prisma.user.update({
            where: { id: req.user.id },
            data: { stripeSubscriptionId: subscription.id },
        });

        const clientSecret = subscription.latest_invoice.payment_intent.client_secret;

        res.json({
            subscriptionId: subscription.id,
            clientSecret,
        });
    } catch (error) {
        console.error('[Stripe] Create subscription error:', error);
        res.status(500).json({ error: error.message || 'Failed to create subscription' });
    }
});

// POST /api/stripe/create-credit-intent — One-off credit pack purchase
router.post('/create-credit-intent', authMiddleware, async (req, res) => {
    try {
        const stripe = getStripe();
        if (!stripe) return res.status(400).json({ error: 'Stripe not configured' });

        const { packId } = req.body; // '5credits' or '10credits'

        let productId, credits;
        if (packId === '5credits') {
            productId = process.env.STRIPE_5CREDIT_ID;
            credits = 5;
        } else if (packId === '10credits') {
            productId = process.env.STRIPE_10CREDIT_ID;
            credits = 10;
        } else {
            return res.status(400).json({ error: 'Invalid pack ID' });
        }

        if (!productId) return res.status(500).json({ error: 'Product not configured' });

        const price = await getProductPrice(productId.trim());
        const customerId = await ensureStripeCustomer(req.user.id);

        const paymentIntent = await stripe.paymentIntents.create({
            amount: price.unit_amount,
            currency: price.currency || 'eur',
            customer: customerId,
            automatic_payment_methods: { enabled: true },
            metadata: {
                userId: req.user.id,
                type: 'credits',
                credits: credits.toString(),
                packId,
            },
        });

        res.json({
            clientSecret: paymentIntent.client_secret,
        });
    } catch (error) {
        console.error('[Stripe] Create credit intent error:', error);
        res.status(500).json({ error: error.message || 'Failed to create payment intent' });
    }
});

// POST /api/stripe/cancel-subscription — Cancel active subscription
router.post('/cancel-subscription', authMiddleware, async (req, res) => {
    try {
        const stripe = getStripe();
        if (!stripe) return res.status(400).json({ error: 'Stripe not configured' });

        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: { stripeSubscriptionId: true },
        });

        if (!user?.stripeSubscriptionId) {
            return res.status(400).json({ error: 'No active subscription' });
        }

        await stripe.subscriptions.cancel(user.stripeSubscriptionId);

        await prisma.user.update({
            where: { id: req.user.id },
            data: {
                subscriptionStatus: 'EXPIRED',
                stripeSubscriptionId: null,
            },
        });

        res.json({ success: true });
    } catch (error) {
        console.error('[Stripe] Cancel subscription error:', error);
        res.status(500).json({ error: 'Failed to cancel subscription' });
    }
});

module.exports = router;
