const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const authMiddleware = require('../middleware/auth');

const prisma = new PrismaClient();

// GET /api/invoices - List invoices for the authenticated PARENT
router.get('/', authMiddleware, async (req, res) => {
    try {
        if (req.user.role !== 'PARENT') {
            return res.status(403).json({ error: 'Only parents can view invoices' });
        }

        const invoices = await prisma.invoice.findMany({
            where: { userId: req.user.id },
            orderBy: { createdAt: 'desc' },
        });

        res.json({ invoices });
    } catch (error) {
        console.error('[Invoices] List error:', error);
        res.status(500).json({ error: 'Failed to fetch invoices' });
    }
});

module.exports = router;
