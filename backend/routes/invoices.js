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
                    select: { id: true, parentId: true, name: true },
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

        // Calculate Incremental Number
        const currentCount = await prisma.courseInvoice.count({
            where: { professorId: req.user.id }
        });
        const prefix = req.user.id.substring(0, 6).toUpperCase();
        const increment = String(currentCount + 1).padStart(4, '0');
        const invoiceNumber = `FAC-${prefix}-${increment}`;

        let invoice = await prisma.courseInvoice.create({
            data: {
                invoiceNumber,
                amount,
                hours: parsedHours,
                hourlyRate: parsedRate,
                discount: parsedDiscount,
                description: description || `Cours de ${course.subject || course.title} pour ${course.student.name || 'élève'}`,
                courseId,
                professorId: req.user.id,
                parentId: course.student.parentId,
                type: 'ACOMPTE' // Advance invoice — hours credited on payment
            },
            include: {
                course: { select: { title: true, code: true } },
                parent: { select: { name: true, email: true, address: true, street: true, zipCode: true, city: true } },
                professor: true,
            },
        });

        // Immediately generate the UNPAID version of the PDF
        const fileName = `${invoiceNumber}.pdf`;
        const documentUrl = await generateInvoicePDF(invoice, fileName, false);

        invoice = await prisma.courseInvoice.update({
            where: { id: invoice.id },
            data: { documentUrl },
            include: {
                course: { select: { title: true, code: true } },
                parent: { select: { name: true, email: true } },
            }
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
            where = {
                parentId: req.user.id,
                status: { not: 'CANCELLED' },
                OR: [
                    { type: { not: 'CREDIT_NOTE' } },
                    { type: null }
                ]
            };
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
            const fileName = `${invoice.invoiceNumber || invoice.id.split('-')[0]}.pdf`;

            const paidAtTime = new Date();

            await prisma.courseInvoice.update({
                where: { id: invoice.id },
                data: {
                    status: 'PAID',
                    paidAt: paidAtTime,
                    type: docType
                },
            });

            // Credit StudentStock if this was an ACOMPTE with hours
            if (invoice.type === 'ACOMPTE' && invoice.hours && invoice.hours > 0) {
                await creditStudentStock(invoice);
            }

            // Re-fetch to ensure the PDF generator has the fresh paidAt attribute
            const updatedInvoice = await prisma.courseInvoice.findUnique({
                where: { id: invoice.id },
                include: { professor: true, parent: true }
            });

            let documentUrl = null;
            try {
                documentUrl = await generateInvoicePDF(updatedInvoice, fileName, true); // true = isPaid
            } catch (pdfErr) {
                console.error('[Invoices] PDF Generation failed', pdfErr);
            }

            if (documentUrl) {
                await prisma.courseInvoice.update({
                    where: { id: invoice.id },
                    data: { documentUrl }
                });
            }

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

        if (invoice.status === 'CANCELLED') {
            return res.status(400).json({ error: 'Cette facture est déjà annulée' });
        }

        // Calculate Incremental Number for the Credit Note
        const currentCount = await prisma.courseInvoice.count({
            where: { professorId: req.user.id }
        });
        const prefix = req.user.id.substring(0, 6).toUpperCase();
        const increment = String(currentCount + 1).padStart(4, '0');
        const creditNoteNumber = `FAC-${prefix}-${increment}`;

        // Create the Credit Note (Avoir)
        let creditNote = await prisma.courseInvoice.create({
            data: {
                invoiceNumber: creditNoteNumber,
                amount: -invoice.amount,
                hours: invoice.hours ? -invoice.hours : null,
                hourlyRate: invoice.hourlyRate, // rate stays positive, hours are negative
                discount: invoice.discount ? -invoice.discount : null,
                description: `Avoir annulant la facture ${invoice.invoiceNumber || invoice.id}`,
                courseId: invoice.courseId,
                professorId: invoice.professorId,
                parentId: invoice.parentId,
                type: 'CREDIT_NOTE',
                status: 'PAID' // Credit notes are instantly deemed closed
            },
            include: {
                course: { select: { title: true, code: true } },
                parent: { select: { name: true, email: true, address: true, street: true, zipCode: true, city: true } },
                professor: true,
            },
        });

        // Generate PDF for the Credit Note
        const fileName = `${creditNoteNumber}.pdf`;
        const documentUrl = await generateInvoicePDF(creditNote, fileName, true); // We pass true to signify it's a closed/issued doc

        await prisma.courseInvoice.update({
            where: { id: creditNote.id },
            data: { documentUrl }
        });

        // Mark original as Cancelled
        await prisma.courseInvoice.update({
            where: { id: invoiceId },
            data: { status: 'CANCELLED' }
        });

        res.json({ success: true, message: 'Facture annulée, avoir généré.' });
    } catch (error) {
        console.error('[Invoices] Cancel error:', error);
        res.status(500).json({ error: 'Erreur lors de l\'annulation de la facture' });
    }
});

// ============ STUDENT STOCK HELPER ============

/**
 * Credits StudentStock.purchasedHours when an ACOMPTE invoice is paid.
 * Finds or creates the StudentStock record for the student-prof pair.
 */
async function creditStudentStock(invoice) {
    try {
        // Find the course to get studentId
        const course = await prisma.course.findUnique({
            where: { id: invoice.courseId },
            select: { studentId: true }
        });
        if (!course?.studentId) return;

        await prisma.studentStock.upsert({
            where: {
                studentId_profId: {
                    studentId: course.studentId,
                    profId: invoice.professorId
                }
            },
            update: {
                purchasedHours: { increment: invoice.hours }
            },
            create: {
                studentId: course.studentId,
                profId: invoice.professorId,
                purchasedHours: invoice.hours,
                consumedHoursThisMonth: 0
            }
        });
        console.log(`[StudentStock] Credited ${invoice.hours}h for student ${course.studentId} with prof ${invoice.professorId}`);
    } catch (err) {
        console.error('[StudentStock] Credit error:', err);
    }
}

// ============ STOCK QUERY ============

// GET /api/invoices/stock — Get hour stock for prof's students (or parent's children)
router.get('/stock', authMiddleware, async (req, res) => {
    try {
        let where = {};
        if (req.user.role === 'PROFESSOR') {
            where = { profId: req.user.id };
        } else if (req.user.role === 'PARENT') {
            // Find all children of this parent
            const children = await prisma.user.findMany({
                where: { parentId: req.user.id },
                select: { id: true }
            });
            where = { studentId: { in: children.map(c => c.id) } };
        } else {
            return res.status(403).json({ error: 'Access denied' });
        }

        const stocks = await prisma.studentStock.findMany({
            where,
            include: {
                student: { select: { name: true, id: true } },
                prof: { select: { name: true, id: true } }
            }
        });

        res.json({ stocks });
    } catch (error) {
        console.error('[Stock] Error:', error);
        res.status(500).json({ error: 'Failed to fetch stock' });
    }
});

// ============ PRORATED REFUND ============

// POST /api/invoices/:id/refund — Professor refunds unconsumed hours
router.post('/:id/refund', authMiddleware, async (req, res) => {
    try {
        const stripe = getStripe();
        if (!stripe) return res.status(400).json({ error: 'Stripe not configured' });

        if (req.user.role !== 'PROFESSOR') {
            return res.status(403).json({ error: 'Only professors can issue refunds' });
        }

        const invoice = await prisma.courseInvoice.findUnique({
            where: { id: req.params.id },
            include: {
                course: { select: { studentId: true } },
                professor: { select: { commissionRate: true } }
            }
        });

        if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
        if (invoice.professorId !== req.user.id) return res.status(403).json({ error: 'Not your invoice' });
        if (invoice.status !== 'PAID') return res.status(400).json({ error: 'Invoice is not paid' });
        if (!invoice.stripePaymentIntentId) return res.status(400).json({ error: 'No Stripe payment to refund' });

        // Calculate max refundable based on unconsumed hours
        const studentId = invoice.course?.studentId;
        if (!studentId) return res.status(400).json({ error: 'No student linked to this course' });

        const stock = await prisma.studentStock.findUnique({
            where: { studentId_profId: { studentId, profId: req.user.id } }
        });

        const unconsumedHours = stock ? stock.purchasedHours : 0;
        const invoiceHours = invoice.hours || 0;
        const refundableHours = Math.min(unconsumedHours, invoiceHours);

        if (refundableHours <= 0) {
            return res.status(400).json({ error: 'Aucune heure non consommée à rembourser' });
        }

        const hourlyRate = invoice.hourlyRate || (invoice.amount / invoiceHours);
        const refundAmount = Math.round(refundableHours * hourlyRate * 100); // cents

        // Refund via Stripe — do NOT refund the application fee (platform keeps its commission)
        const refund = await stripe.refunds.create({
            payment_intent: invoice.stripePaymentIntentId,
            amount: refundAmount,
            refund_application_fee: false,
            reverse_transfer: true
        });

        // Deduct refunded hours from stock
        await prisma.studentStock.update({
            where: { studentId_profId: { studentId, profId: req.user.id } },
            data: { purchasedHours: { decrement: refundableHours } }
        });

        // Create Credit Note for the refund
        const currentCount = await prisma.courseInvoice.count({ where: { professorId: req.user.id } });
        const prefix = req.user.id.substring(0, 6).toUpperCase();
        const creditNoteNumber = `FAC-${prefix}-${String(currentCount + 1).padStart(4, '0')}`;

        const creditNote = await prisma.courseInvoice.create({
            data: {
                invoiceNumber: creditNoteNumber,
                amount: -(refundableHours * hourlyRate),
                hours: -refundableHours,
                hourlyRate: invoice.hourlyRate,
                description: `Remboursement de ${refundableHours}h non consommées (facture ${invoice.invoiceNumber})`,
                courseId: invoice.courseId,
                professorId: invoice.professorId,
                parentId: invoice.parentId,
                type: 'CREDIT_NOTE',
                status: 'PAID'
            },
            include: {
                course: { select: { title: true, code: true } },
                parent: { select: { name: true, email: true, address: true, street: true, zipCode: true, city: true } },
                professor: true,
            },
        });

        // Generate PDF for the Credit Note
        const fileName = `${creditNoteNumber}.pdf`;
        const documentUrl = await generateInvoicePDF(creditNote, fileName, true);
        await prisma.courseInvoice.update({ where: { id: creditNote.id }, data: { documentUrl } });

        console.log(`[Refund] Refunded ${refundableHours}h (${refundAmount/100}€) for invoice ${invoice.invoiceNumber}`);
        res.json({ success: true, refundedHours: refundableHours, refundedAmount: refundAmount / 100, stripeRefundId: refund.id });
    } catch (error) {
        console.error('[Refund] Error:', error);
        res.status(500).json({ error: error.message || 'Failed to process refund' });
    }
});

module.exports = router;
