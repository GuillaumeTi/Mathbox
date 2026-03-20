/**
 * Admin Routes
 * 
 * Protected with hardcoded auth for MVP.
 * Provides platform management actions.
 */

const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const { generateMonthlyB2BInvoices } = require('../services/b2bInvoiceGenerator');

const prisma = new PrismaClient();

// ============ HARDCODED AUTH MIDDLEWARE (MVP) ============
function adminAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Basic ')) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    const credentials = Buffer.from(authHeader.split(' ')[1], 'base64').toString();
    const [username, password] = credentials.split(':');

    if (username === 'admin' && password === 'admin') {
        next();
    } else {
        res.status(401).json({ error: 'Invalid credentials' });
    }
}

// Apply auth to all routes
router.use(adminAuth);

// ============ METRICS ============

// GET /api/admin/metrics — Platform KPIs
router.get('/metrics', async (req, res) => {
    try {
        const profCount = await prisma.user.count({ where: { role: 'PROFESSOR' } });
        const parentCount = await prisma.user.count({ where: { role: 'PARENT' } });
        const activeCourses = await prisma.course.count({ where: { status: { not: 'CANCELLED' } } });

        let totalCommissions = 0;
        let totalMRR = 0;
        try {
            const commResult = await prisma.platformTransaction.aggregate({
                where: { type: 'COMMISSION' },
                _sum: { amount: true },
            });
            totalCommissions = commResult._sum.amount || 0;
            const subResult = await prisma.platformTransaction.aggregate({
                where: { type: 'SUBSCRIPTION' },
                _sum: { amount: true },
            });
            totalMRR = subResult._sum.amount || 0;
        } catch (e) {
            console.error('[Admin] PlatformTransaction query failed (model may not exist):', e.message);
        }

        res.json({
            professors: profCount,
            parents: parentCount,
            activeCourses,
            totalCommissions,
            totalMRR,
        });
    } catch (error) {
        console.error('[Admin] Metrics error:', error);
        res.status(500).json({ error: 'Failed to fetch metrics' });
    }
});

// ============ LISTS ============

// GET /api/admin/professors
router.get('/professors', async (req, res) => {
    try {
        const professors = await prisma.user.findMany({
            where: { role: 'PROFESSOR' },
            select: {
                id: true, name: true, email: true, legalStatus: true,
                subscriptionStatus: true, commissionRate: true, billingMandate: true,
                createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
        });
        res.json({ professors });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch professors' });
    }
});

// GET /api/admin/parents
router.get('/parents', async (req, res) => {
    try {
        const parents = await prisma.user.findMany({
            where: { role: 'PARENT' },
            select: {
                id: true, name: true, email: true, createdAt: true,
                children: { select: { id: true, name: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
        res.json({ parents: parents.map(p => ({ ...p, childrenCount: p.children.length })) });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch parents' });
    }
});

// GET /api/admin/invoices — All invoices
router.get('/invoices', async (req, res) => {
    try {
        const invoices = await prisma.courseInvoice.findMany({
            orderBy: { createdAt: 'desc' },
            include: {
                professor: { select: { name: true } },
                parent: { select: { name: true } },
                course: { select: { title: true } },
            },
        });
        res.json({ invoices });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch invoices' });
    }
});

// GET /api/admin/transactions — Platform transactions
router.get('/transactions', async (req, res) => {
    try {
        const transactions = await prisma.platformTransaction.findMany({
            orderBy: { createdAt: 'desc' },
            include: { prof: { select: { name: true } } },
        });
        res.json({ transactions });
    } catch (error) {
        console.error('[Admin] Transactions error:', error.message);
        // Return empty array instead of 500 if model doesn't exist
        res.json({ transactions: [] });
    }
});

// ============ ACTIONS ============

// POST /api/admin/generate-b2b — Force B2B invoice generation
router.post('/generate-b2b', async (req, res) => {
    try {
        const results = await generateMonthlyB2BInvoices();
        res.json({ success: true, generatedCount: results.length, invoices: results });
    } catch (error) {
        console.error('[Admin] B2B generation error:', error);
        res.status(500).json({ error: 'Failed to generate B2B invoices' });
    }
});

// POST /api/admin/force-refund/:invoiceId — Force refund on any invoice
router.post('/force-refund/:invoiceId', async (req, res) => {
    try {
        const { getStripe } = require('../services/stripe');
        const stripe = getStripe();
        if (!stripe) return res.status(400).json({ error: 'Stripe not configured' });

        const invoice = await prisma.courseInvoice.findUnique({
            where: { id: req.params.invoiceId },
        });

        if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
        if (invoice.status !== 'PAID') return res.status(400).json({ error: 'Invoice is not paid' });
        if (!invoice.stripePaymentIntentId) return res.status(400).json({ error: 'No Stripe payment to refund' });

        const refundAmount = Math.round(invoice.amount * 100);

        const refund = await stripe.refunds.create({
            payment_intent: invoice.stripePaymentIntentId,
            amount: refundAmount,
            refund_application_fee: false,
            reverse_transfer: true,
        });

        await prisma.courseInvoice.update({
            where: { id: invoice.id },
            data: { status: 'CANCELLED' },
        });

        console.log(`[Admin] Forced refund on invoice ${invoice.invoiceNumber} — ${invoice.amount}€`);
        res.json({ success: true, refundId: refund.id, refundedAmount: invoice.amount });
    } catch (error) {
        console.error('[Admin] Force refund error:', error);
        res.status(500).json({ error: error.message || 'Failed to process refund' });
    }
});

module.exports = router;
