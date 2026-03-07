const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const authMiddleware = require('../middleware/auth');
const { getStripe } = require('../services/stripe');
const { requireActiveTrial } = require('../middleware/trialGuard');
const { generateInvoicePDF } = require('../services/pdfGenerator');

const prisma = new PrismaClient();

const APPLICATION_FEE_PERCENT = 5; // MathBox takes 5%

// ============ COURSE INVOICES (Marketplace) ============

// POST /api/invoices/create — Professor creates invoice for a course/parent
router.post('/create', authMiddleware, requireActiveTrial, async (req, res) => {
    try {
        if (req.user.role !== 'PROFESSOR') {
            return res.status(403).json({ error: 'Only professors can create invoices' });
        }

        const { courseId, hours, hourlyRate, discount, description } = req.body;
        if (!courseId || !hours || !hourlyRate) {
            return res.status(400).json({ error: 'courseId, hours, and hourlyRate are required' });
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

        const parsedHours = parseFloat(hours);
        const parsedRate = parseFloat(hourlyRate);
        const parsedDiscount = discount ? parseFloat(discount) : 0;
        const amount = Math.max(0, (parsedHours * parsedRate) - parsedDiscount);

        const invoice = await prisma.courseInvoice.create({
            data: {
                amount,
                hours: parsedHours,
                hourlyRate: parsedRate,
                discount: parsedDiscount,
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
                professor: { select: { name: true, tvaStatus: true } },
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
                professor: { select: { stripeAccountId: true, name: true, commissionRate: true } },
            },
        });

        if (!invoice) {
            return res.status(404).json({ error: 'Invoice not found or already paid' });
        }

        if (!invoice.professor?.stripeAccountId) {
            return res.status(400).json({ error: 'Le professeur n\'a pas encore configuré son compte de paiement' });
        }

        const amountCents = Math.round(invoice.amount * 100);
        // Fallback to 10% if commissionRate is missing for some reason
        const commissionRate = invoice.professor.commissionRate || 0.10;
        const applicationFeeCents = Math.round(amountCents * commissionRate);

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

        // Save PaymentIntent ID so we can verify it proactively
        await prisma.courseInvoice.update({
            where: { id: invoice.id },
            data: { stripePaymentIntentId: paymentIntent.id }
        });

        res.json({ clientSecret: paymentIntent.client_secret });
    } catch (error) {
        console.error('[Invoices] Pay error:', error);
        res.status(500).json({ error: error.message || 'Failed to create payment' });
    }
});

// POST /api/invoices/:id/verify — Proactively verify payment status from frontend
router.post('/:id/verify', authMiddleware, async (req, res) => {
    try {
        const stripe = getStripe();
        if (!stripe) return res.status(400).json({ error: 'Stripe not configured' });

        const invoice = await prisma.courseInvoice.findUnique({
            where: { id: req.params.id },
            include: { professor: true, parent: true }
        });

        if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
        if (invoice.status === 'PAID') return res.json({ status: 'PAID' });
        if (!invoice.stripePaymentIntentId) return res.status(400).json({ error: 'No payment intent found' });

        // Check status directly with Stripe
        const paymentIntent = await stripe.paymentIntents.retrieve(invoice.stripePaymentIntentId);

        if (paymentIntent.status === 'succeeded') {
            const isPro = invoice.professor.legalStatus === 'PRO';
            const docType = isPro ? 'INVOICE' : 'RECEIPT';
            const fileName = `${docType.toLowerCase()}-${invoice.id.split('-')[0]}.pdf`;

            let documentUrl = null;
            try {
                documentUrl = await generateInvoicePDF(invoice, fileName);
            } catch (pdfErr) {
                console.error('[Invoices] PDF Generation failed', pdfErr);
            }

            await prisma.courseInvoice.update({
                where: { id: invoice.id },
                data: {
                    status: 'PAID',
                    paidAt: new Date(),
                    documentUrl,
                    type: docType
                },
            });

            // Emit socket event for real-time update
            const io = req.app.get('io');
            if (io && invoice.professorId && invoice.parentId) {
                io.to(`user:${invoice.professorId}`).emit('invoice:paid', { invoiceId: invoice.id });
                io.to(`user:${invoice.parentId}`).emit('invoice:paid', { invoiceId: invoice.id });
            }

            return res.json({ status: 'PAID' });
        }

        res.json({ status: invoice.status });
    } catch (error) {
        console.error('[Invoices] Verify error:', error);
        res.status(500).json({ error: 'Failed to verify payment' });
    }
});

// DELETE /api/invoices/:id — Professor deletes a pending invoice
router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        if (req.user.role !== 'PROFESSOR') {
            return res.status(403).json({ error: 'Seul un professeur peut supprimer une facture' });
        }

        const invoiceId = req.params.id;
        const invoice = await prisma.courseInvoice.findUnique({
            where: { id: invoiceId }
        });

        if (!invoice) {
            return res.status(404).json({ error: 'Facture introuvable' });
        }

        if (invoice.professorId !== req.user.id) {
            return res.status(403).json({ error: 'Action non autorisée sur cette facture' });
        }

        if (invoice.status === 'PAID') {
            return res.status(400).json({ error: 'Impossible de supprimer une facture déjà payée' });
        }

        await prisma.courseInvoice.delete({
            where: { id: invoiceId }
        });

        res.json({ success: true, message: 'Facture supprimée' });
    } catch (error) {
        console.error('[Invoices] Delete error:', error);
        res.status(500).json({ error: 'Erreur lors de la suppression de la facture' });
    }
});

module.exports = router;
