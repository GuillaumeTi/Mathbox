const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const authMiddleware = require('../middleware/auth');

const prisma = new PrismaClient();

// Credit pack definitions
const CREDIT_PACKS = [
    { id: 'pack_5', name: '5 Crédits IA', credits: 5, price: 9.99, popular: false },
    { id: 'pack_10', name: '10 Crédits IA', credits: 10, price: 14.99, popular: true },
    { id: 'pack_25', name: '25 Crédits IA', credits: 25, price: 29.99, popular: false },
    { id: 'pack_50', name: '50 Crédits IA', credits: 50, price: 49.99, popular: false },
];

// Subscription plans
const PLANS = [
    {
        id: 'free',
        name: 'Gratuit',
        price: 0,
        features: [
            '3 cours/semaine',
            '1 Go de stockage',
            'Tableau blanc basique',
            '2 crédits IA/mois',
        ],
    },
    {
        id: 'pro',
        name: 'Pro',
        price: 19.99,
        features: [
            'Cours illimités',
            '10 Go de stockage',
            'Tableau blanc avancé',
            '10 crédits IA/mois',
            'Support prioritaire',
            'Rapports IA détaillés',
        ],
        popular: true,
    },
    {
        id: 'enterprise',
        name: 'Entreprise',
        price: 49.99,
        features: [
            'Tout Pro +',
            '100 Go de stockage',
            'Crédits IA illimités',
            'API access',
            'Account manager dédié',
            'Formation personnalisée',
        ],
    },
];

// GET /api/shop/plans - Get subscription plans
router.get('/plans', (req, res) => {
    res.json({ plans: PLANS });
});

// GET /api/shop/credits - Get credit packs
router.get('/credits', (req, res) => {
    res.json({ packs: CREDIT_PACKS });
});

// POST /api/shop/credits/purchase - Purchase credits (mocked)
router.post('/credits/purchase', authMiddleware, async (req, res) => {
    try {
        if (req.user.role !== 'PROF') {
            return res.status(403).json({ error: 'Only professors can purchase credits' });
        }

        const { packId } = req.body;
        const pack = CREDIT_PACKS.find(p => p.id === packId);

        if (!pack) {
            return res.status(400).json({ error: 'Invalid pack' });
        }

        // Mock Stripe payment - in production, create a Stripe Checkout Session
        // const session = await stripe.checkout.sessions.create({...})

        // Add credits
        const user = await prisma.user.update({
            where: { id: req.user.id },
            data: { credits: { increment: pack.credits } },
        });

        // Record transaction
        await prisma.aICredit.create({
            data: {
                amount: pack.credits,
                type: 'PURCHASE',
                description: `Achat: ${pack.name}`,
                userId: req.user.id,
            },
        });

        res.json({
            success: true,
            credits: user.credits,
            message: `${pack.credits} crédits ajoutés ! (paiement simulé)`,
        });
    } catch (error) {
        console.error('[Shop] Purchase error:', error);
        res.status(500).json({ error: 'Purchase failed' });
    }
});

// GET /api/shop/transactions - Credit transaction history
router.get('/transactions', authMiddleware, async (req, res) => {
    try {
        const transactions = await prisma.aICredit.findMany({
            where: { userId: req.user.id },
            orderBy: { createdAt: 'desc' },
            take: 50,
        });

        res.json({ transactions });
    } catch (error) {
        console.error('[Shop] Transactions error:', error);
        res.status(500).json({ error: 'Failed to get transactions' });
    }
});

module.exports = router;
