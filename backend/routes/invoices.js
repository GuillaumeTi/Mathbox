const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const authMiddleware = require('../middleware/auth');
const { getStripe } = require('../services/stripe');

const prisma = new PrismaClient();

const APPLICATION_FEE_PERCENT = 5; // MathBox takes 5%

// ============ COURSE INVOICES (Marketplace) ============

// POST /api/invoices/create — Professor creates invoice for a course/parent
router.post('/create', authMiddleware, async (req, res) => {
    try {
        if (req.user.role !== 'PROFESSOR') {
            return res.status(403).json({ error: 'Only professors can create invoices' });
        }

        const { courseId, amount, description } = req.body;
        if (!courseId || !amount) {
            return res.status(400).json({ error: 'courseId and amount are required' });
        }

        // Validate the course belongs to this professor and has a student
        const course = await prisma.course.findFirst({
            where: { id: courseId, professorId: req.user.id },
            include: {
                student: {
                    select: { id: true, parentId: true },
                },
            },
        });

        if (!course) {
            return res.status(404).json({ error: 'Course not found' });
        }

        if (!course.student?.parentId) {
            return res.status(400).json({ error: "Cet élève n'a pas de parent associé" });
        }

        const invoice = await prisma.courseInvoice.create({
            data: {
                amount: parseFloat(amount),
                description: description || `Cours: ${course.title || courseId}`,
                courseId,
                professorId: req.user.id,
                parentId: course.student.parentId,
            },
            include: {
                course: { select: { title: true, code: true } },
                parent: { select: { name: true, email: true } },
            },
        });

        console.log(`[Invoices] Created invoice ${invoice.id} — ${amount}€ for course ${course.title}`);
        res.json({ invoice });
    } catch (error) {
        console.error('[Invoices] Create error:', error);
        res.status(500).json({ error: 'Failed to create invoice' });
    }
});

// GET /api/invoices — List invoices
// For PROFESSORS: their sent invoices
// For PARENTS: their received invoices
router.get('/', authMiddleware, async (req, res) => {
    try {
        let where = {};
        if (req.user.role === 'PROFESSOR') {
            where = { professorId: req.user.id };
        } else if (req.user.role === 'PARENT') {
            where = { parentId: req.user.id };
        } else {
            return res.status(403).json({ error: 'Access denied' });
        }

        const invoices = await prisma.courseInvoice.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            include: {
                course: { select: { title: true, code: true } },
                professor: { select: { name: true } },
                parent: { select: { name: true } },
            },
        });

        res.json({ invoices });
    } catch (error) {
        console.error('[Invoices] List error:', error);
        res.status(500).json({ error: 'Failed to fetch invoices' });
    }
});

// POST /api/invoices/:id/pay — Create PaymentIntent with destination charge
// Parent pays → Stripe takes fee → MathBox takes 5% → Professor gets the rest
router.post('/:id/pay', authMiddleware, async (req, res) => {
    try {
        const stripe = getStripe();
        if (!stripe) return res.status(400).json({ error: 'Stripe not configured' });

        if (req.user.role !== 'PARENT') {
            return res.status(403).json({ error: 'Only parents can pay invoices' });
        }

        const invoice = await prisma.courseInvoice.findFirst({
            where: { id: req.params.id, parentId: req.user.id, status: 'PENDING' },
            include: {
                professor: { select: { stripeAccountId: true, name: true } },
            },
        });

        if (!invoice) {
            return res.status(404).json({ error: 'Invoice not found or already paid' });
        }

        if (!invoice.professor?.stripeAccountId) {
            return res.status(400).json({ error: 'Le professeur n\'a pas encore configuré son compte de paiement' });
        }

        const amountCents = Math.round(invoice.amount * 100);
        const applicationFeeCents = Math.round(amountCents * APPLICATION_FEE_PERCENT / 100);

        // Ensure parent has a Stripe customer
        let parentUser = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: { stripeCustomerId: true, email: true, name: true },
        });

        let customerId = parentUser.stripeCustomerId;
        if (!customerId) {
            const customer = await stripe.customers.create({
                email: parentUser.email,
                name: parentUser.name,
                metadata: { userId: req.user.id },
            });
            customerId = customer.id;
            await prisma.user.update({
                where: { id: req.user.id },
                data: { stripeCustomerId: customerId },
            });
        }

        // Create PaymentIntent with destination charge
        const paymentIntent = await stripe.paymentIntents.create({
            amount: amountCents,
            currency: 'eur',
            customer: customerId,
            automatic_payment_methods: { enabled: true },
            application_fee_amount: applicationFeeCents,
            transfer_data: {
                destination: invoice.professor.stripeAccountId,
            },
            metadata: {
                type: 'course_invoice',
                courseInvoiceId: invoice.id,
                parentId: req.user.id,
                professorId: invoice.professorId,
            },
        });

        res.json({ clientSecret: paymentIntent.client_secret });
    } catch (error) {
        console.error('[Invoices] Pay error:', error);
        res.status(500).json({ error: error.message || 'Failed to create payment' });
    }
});

module.exports = router;
