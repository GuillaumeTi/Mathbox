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

        let cancelAtPeriodEnd = false;
        let currentPeriodEnd = null;

        if (user.stripeSubscriptionId) {
            const stripe = getStripe();
            if (stripe) {
                try {
                    const sub = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
                    cancelAtPeriodEnd = sub.cancel_at_period_end;
                    currentPeriodEnd = sub.current_period_end; // unix timestamp
                } catch (e) {
                    console.error('Error fetching subscription from Stripe:', e);
                }
            }
        }

        res.json({
            subscriptionStatus: user.subscriptionStatus,
            stripeSubscriptionId: user.stripeSubscriptionId,
            credits: user.credits,
            hasStripeCustomer: !!user.stripeCustomerId,
            cancelAtPeriodEnd,
            currentPeriodEnd
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

        // Instead of immediate cancel, we set cancel_at_period_end to true
        await stripe.subscriptions.update(user.stripeSubscriptionId, {
            cancel_at_period_end: true
        });

        // We DO NOT set subscriptionStatus to 'EXPIRED' here.
        // The webhook 'customer.subscription.deleted' will handle it when it actually expires at the period end.

        res.json({ success: true });
    } catch (error) {
        console.error('[Stripe] Cancel subscription error:', error);
        res.status(500).json({ error: 'Failed to cancel subscription' });
    }
});

// POST /api/stripe/reactivate-subscription — Reactivate canceled auto-renew
router.post('/reactivate-subscription', authMiddleware, async (req, res) => {
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

        // Set cancel_at_period_end back to false
        await stripe.subscriptions.update(user.stripeSubscriptionId, {
            cancel_at_period_end: false
        });

        res.json({ success: true });
    } catch (error) {
        console.error('[Stripe] Reactivate subscription error:', error);
        res.status(500).json({ error: 'Failed to reactivate subscription' });
    }
});

// POST /api/stripe/confirm-subscription — Frontend calls after successful payment
// Verifies with Stripe that the subscription is active, then updates DB
router.post('/confirm-subscription', authMiddleware, async (req, res) => {
    try {
        const stripe = getStripe();
        if (!stripe) return res.status(400).json({ error: 'Stripe not configured' });

        const { subscriptionId } = req.body;
        if (!subscriptionId) return res.status(400).json({ error: 'subscriptionId required' });

        // Verify with Stripe
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        if (subscription.status !== 'active' && subscription.status !== 'trialing') {
            return res.status(400).json({ error: `Subscription status is ${subscription.status}, not active` });
        }

        // Verify this subscription belongs to this user's customer
        const user = await prisma.user.findUnique({ where: { id: req.user.id } });
        if (user.stripeCustomerId !== subscription.customer) {
            return res.status(403).json({ error: 'Subscription does not belong to this user' });
        }

        // Update DB
        await prisma.user.update({
            where: { id: req.user.id },
            data: {
                subscriptionStatus: 'ACTIVE',
                stripeSubscriptionId: subscription.id,
            },
        });

        console.log(`[Stripe] Subscription confirmed ACTIVE for user ${req.user.id}`);
        res.json({ success: true, status: 'ACTIVE' });
    } catch (error) {
        console.error('[Stripe] Confirm subscription error:', error);
        res.status(500).json({ error: error.message || 'Failed to confirm subscription' });
    }
});

// POST /api/stripe/confirm-credit-payment — Frontend calls after successful credit purchase
// Verifies payment with Stripe, then adds credits
router.post('/confirm-credit-payment', authMiddleware, async (req, res) => {
    try {
        const stripe = getStripe();
        if (!stripe) return res.status(400).json({ error: 'Stripe not configured' });

        const { paymentIntentId } = req.body;
        if (!paymentIntentId) return res.status(400).json({ error: 'paymentIntentId required' });

        // Verify with Stripe
        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
        if (paymentIntent.status !== 'succeeded') {
            return res.status(400).json({ error: `Payment status is ${paymentIntent.status}, not succeeded` });
        }

        // Check metadata
        const { type, userId, credits, packId } = paymentIntent.metadata || {};
        if (type !== 'credits' || userId !== req.user.id) {
            return res.status(403).json({ error: 'Payment does not match this user or type' });
        }

        const creditAmount = parseInt(credits);
        if (!creditAmount || creditAmount <= 0) {
            return res.status(400).json({ error: 'Invalid credit amount in payment metadata' });
        }

        // Check if already processed (idempotency)
        const existing = await prisma.aICredit.findFirst({
            where: {
                userId: req.user.id,
                description: { contains: paymentIntentId },
            },
        });
        if (existing) {
            return res.json({ success: true, message: 'Already processed', credits: creditAmount });
        }

        // Add credits
        const updatedUser = await prisma.user.update({
            where: { id: req.user.id },
            data: { credits: { increment: creditAmount } },
        });

        // Record transaction
        await prisma.aICredit.create({
            data: {
                amount: creditAmount,
                type: 'PURCHASE',
                description: `Achat de ${creditAmount} crédits IA (${paymentIntentId})`,
                userId: req.user.id,
            },
        });

        console.log(`[Stripe] ${creditAmount} credits confirmed for user ${req.user.id}`);
        res.json({ success: true, credits: updatedUser.credits });
    } catch (error) {
        console.error('[Stripe] Confirm credit payment error:', error);
        res.status(500).json({ error: error.message || 'Failed to confirm credit payment' });
    }
});

// POST /api/stripe/create-setup-intent — Update default payment method
router.post('/create-setup-intent', authMiddleware, async (req, res) => {
    try {
        const stripe = getStripe();
        if (!stripe) return res.status(400).json({ error: 'Stripe not configured' });

        const customerId = await ensureStripeCustomer(req.user.id);

        const setupIntent = await stripe.setupIntents.create({
            customer: customerId,
            payment_method_types: ['card'],
        });

        res.json({ clientSecret: setupIntent.client_secret });
    } catch (error) {
        console.error('[Stripe] Create SetupIntent error:', error);
        res.status(500).json({ error: 'Failed to create setup intent' });
    }
});

// ============ STRIPE CONNECT (Professors receiving payments) ============

// POST /api/stripe/connect/create-account — Create Express account
router.post('/connect/create-account', authMiddleware, async (req, res) => {
    try {
        const stripe = getStripe();
        if (!stripe) return res.status(400).json({ error: 'Stripe not configured' });

        if (req.user.role !== 'PROFESSOR') {
            return res.status(403).json({ error: 'Only professors can create Connect accounts' });
        }

        // Check if already has an account
        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: { stripeAccountId: true, email: true, name: true, legalStatus: true },
        });

        if (user.stripeAccountId) {
            return res.json({ accountId: user.stripeAccountId, alreadyExists: true });
        }

        const businessType = user.legalStatus === 'PRO' ? 'company' : 'individual';

        // Create Express account
        const account = await stripe.accounts.create({
            type: 'express',
            country: 'FR',
            email: user.email,
            capabilities: {
                card_payments: { requested: true },
                transfers: { requested: true },
            },
            business_type: businessType,
            metadata: { userId: req.user.id },
        });

        // Save account ID
        await prisma.user.update({
            where: { id: req.user.id },
            data: { stripeAccountId: account.id },
        });

        res.json({ accountId: account.id });
    } catch (error) {
        console.error('[Stripe] Connect create account error:', error);
        res.status(500).json({ error: error.message || 'Failed to create Connect account' });
    }
});

// POST /api/stripe/connect/account-session — Create AccountSession for embedded components
router.post('/connect/account-session', authMiddleware, async (req, res) => {
    try {
        const stripe = getStripe();
        if (!stripe) return res.status(400).json({ error: 'Stripe not configured' });

        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: { stripeAccountId: true },
        });

        if (!user?.stripeAccountId) {
            return res.status(400).json({ error: 'No Connect account found. Create one first.' });
        }

        const accountSession = await stripe.accountSessions.create({
            account: user.stripeAccountId,
            components: {
                account_onboarding: { enabled: true },
                payments: { enabled: true, features: { refund_management: true } },
                payouts: { enabled: true },
            },
        });

        res.json({ clientSecret: accountSession.client_secret });
    } catch (error) {
        console.error('[Stripe] Connect account session error:', error);
        res.status(500).json({ error: error.message || 'Failed to create account session' });
    }
});

// GET /api/stripe/connect/status — Get Connect account status
router.get('/connect/status', authMiddleware, async (req, res) => {
    try {
        const stripe = getStripe();
        if (!stripe) return res.status(400).json({ error: 'Stripe not configured' });

        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: { stripeAccountId: true },
        });

        if (!user?.stripeAccountId) {
            return res.json({ hasAccount: false });
        }

        const account = await stripe.accounts.retrieve(user.stripeAccountId);

        res.json({
            hasAccount: true,
            accountId: user.stripeAccountId,
            chargesEnabled: account.charges_enabled,
            payoutsEnabled: account.payouts_enabled,
            detailsSubmitted: account.details_submitted,
            requirements: account.requirements?.currently_due || [],
        });
    } catch (error) {
        console.error('[Stripe] Connect status error:', error);
        res.status(500).json({ error: 'Failed to get Connect status' });
    }
});

module.exports = router;
