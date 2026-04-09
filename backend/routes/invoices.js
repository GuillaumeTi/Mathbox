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

        const { courseId, hours, hourlyRate, discount, description, type } = req.body;
        if (!courseId || !hours || !hourlyRate || !type) {
            return res.status(400).json({ error: 'courseId, hours, hourlyRate, and type are required' });
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
        
        let amount = 0;
        let finalDescription = description || `Cours de ${course.subject || course.title} pour ${course.student.name || 'élève'}`;
        let invoiceStatus = 'PENDING';

        let acompteRow = null; // will be passed to PDF for the deduction line

        if (type === 'SOLDE') {
            const stock = await prisma.studentStock.findUnique({
                where: { studentId_profId: { studentId: course.studentId, profId: req.user.id } }
            });
            const availableStock = stock ? stock.purchasedHours : 0;
            const invoicedHours = parsedHours;

            // Fetch the paid ACOMPTE invoice for reference in the PDF
            const acompteInvoice = await prisma.courseInvoice.findFirst({
                where: {
                    professorId: req.user.id,
                    parentId: course.student.parentId,
                    type: 'ACOMPTE',
                    status: 'PAID',
                },
                orderBy: { createdAt: 'desc' },
                select: { invoiceNumber: true, hours: true, amount: true, hourlyRate: true }
            });

            if (availableStock >= invoicedHours) {
                // Fully covered by acompte
                amount = 0;
                const usedHours = invoicedHours;
                const usedAmount = usedHours * parsedRate;
                if (acompteInvoice) {
                    acompteRow = {
                        label: `Facture d'acompte ${acompteInvoice.invoiceNumber} : -${usedHours}h`,
                        hours: usedHours,
                        unitPrice: -parsedRate,
                        total: -usedAmount,
                    };
                }
                if (stock) {
                    await prisma.studentStock.update({
                        where: { id: stock.id },
                        data: { purchasedHours: { decrement: invoicedHours } }
                    });
                }
                invoiceStatus = 'PAID';
            } else {
                // Partially covered
                const remainder = invoicedHours - availableStock;
                amount = Math.max(0, (remainder * parsedRate) - parsedDiscount);
                if (availableStock > 0) {
                    const usedAmount = availableStock * parsedRate;
                    if (acompteInvoice) {
                        acompteRow = {
                            label: `Facture d'acompte ${acompteInvoice.invoiceNumber} : -${availableStock}h`,
                            hours: availableStock,
                            unitPrice: -parsedRate,
                            total: -usedAmount,
                        };
                    }
                    await prisma.studentStock.update({
                        where: { id: stock.id },
                        data: { purchasedHours: 0 }
                    });
                } else {
                    amount = Math.max(0, (parsedHours * parsedRate) - parsedDiscount);
                }
            }
        } else {
            // ACOMPTE
            amount = Math.max(0, (parsedHours * parsedRate) - parsedDiscount);
        }

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
                description: finalDescription,
                courseId,
                professorId: req.user.id,
                parentId: course.student.parentId,
                type: type, // ACOMPTE or SOLDE
                status: invoiceStatus
            },
            include: {
                course: { select: { title: true, code: true } },
                parent: { select: { name: true, email: true, address: true, street: true, zipCode: true, city: true } },
                professor: true,
            },
        });

        // Immediately generate the PDF (unpaid for PENDING, paid for auto-paid SOLDE)
        const fileName = `${invoiceNumber}.pdf`;
        const documentUrl = await generateInvoicePDF(invoice, fileName, invoiceStatus === 'PAID', acompteRow);

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

// GET /api/invoices/platform — Platform (B2B) invoices for logged-in professor
router.get('/platform', authMiddleware, async (req, res) => {
    try {
        if (req.user.role !== 'PROFESSOR') {
            return res.status(403).json({ error: 'Only professors can access platform invoices' });
        }
        const invoices = await prisma.courseInvoice.findMany({
            where: { professorId: req.user.id, type: 'PLATFORM_INVOICE' },
            orderBy: { createdAt: 'desc' },
        });
        res.json({ invoices });
    } catch (error) {
        console.error('[Invoices] Platform list error:', error);
        res.status(500).json({ error: 'Failed to fetch platform invoices' });
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

            // Atomic guard: only update if still PENDING — prevents double-credit on double-poll
            // NOTE: we do NOT overwrite `type` here — business type (ACOMPTE/SOLDE) must be preserved
            const updateResult = await prisma.courseInvoice.updateMany({
                where: { id: invoice.id, status: 'PENDING' },
                data: {
                    status: 'PAID',
                    paidAt: paidAtTime,
                },
            });

            // Only credit stock if WE just made the transition (count === 1 means we updated it)
            if (updateResult.count > 0 && invoice.type === 'ACOMPTE' && invoice.hours && invoice.hours > 0) {
                await creditStudentStock(invoice);
            }

            // Re-fetch to ensure the PDF generator has the fresh paidAt attribute
            const updatedInvoice = await prisma.courseInvoice.findUnique({
                where: { id: invoice.id },
                include: { professor: true, parent: true }
            });

            let documentUrl = null;
            try {
                if (updatedInvoice.type === 'SOLDE') {
                    // Distinguish MONTHLY vs PER_CLASS by looking up the student's billing preference.
                    // Both invoice types have linked ClassSessions, so session count alone is not reliable.
                    const linkedSessions = await prisma.classSession.findMany({
                        where: { courseInvoiceId: updatedInvoice.id },
                        include: { student: { select: { id: true, name: true } } },
                        orderBy: { date: 'asc' },
                    });

                    // Determine billing mode from StudentStock (source of truth)
                    let billingMode = 'PER_CLASS';
                    if (linkedSessions.length > 0) {
                        const stock = await prisma.studentStock.findUnique({
                            where: {
                                studentId_profId: {
                                    studentId: linkedSessions[0].studentId,
                                    profId: updatedInvoice.professorId,
                                }
                            },
                            select: { billingPreference: true }
                        });
                        billingMode = stock?.billingPreference || 'PER_CLASS';
                    }

                    if (billingMode === 'MONTHLY' && linkedSessions.length > 0) {
                        // ── MONTHLY SOLDE → generateMonthlyPDF ────────────────────────────
                        const professor = updatedInvoice.professor;
                        const parent = updatedInvoice.parent;

                        const acompteInvoices = await prisma.courseInvoice.findMany({
                            where: {
                                parentId: updatedInvoice.parentId,
                                professorId: updatedInvoice.professorId,
                                status: 'PAID',
                                type: 'ACOMPTE',
                            },
                            select: { id: true, invoiceNumber: true, amount: true, hours: true, createdAt: true }
                        });

                        documentUrl = await generateMonthlyPDF(
                            updatedInvoice, professor, parent,
                            linkedSessions, acompteInvoices, fileName
                        );
                    } else {
                        // ── PER_CLASS SOLDE → generateInvoicePDF with reconstructed acompteRow ─
                        const hourlyRate = updatedInvoice.hourlyRate || 0;
                        const totalHours = updatedInvoice.hours || 0;
                        const billedHours = hourlyRate > 0 ? updatedInvoice.amount / hourlyRate : 0;
                        const coveredHours = totalHours - billedHours;

                        let acompteRow = null;
                        if (coveredHours > 0.001) {
                            const lastAcompte = await prisma.courseInvoice.findFirst({
                                where: {
                                    parentId: updatedInvoice.parentId,
                                    professorId: updatedInvoice.professorId,
                                    type: 'ACOMPTE',
                                    status: 'PAID',
                                },
                                orderBy: { createdAt: 'desc' },
                                select: { invoiceNumber: true }
                            });
                            acompteRow = {
                                label: `Facture d'acompte ${lastAcompte?.invoiceNumber || '—'} : -${coveredHours.toFixed(2)}h`,
                                hours: coveredHours,
                                unitPrice: -hourlyRate,
                                total: -(coveredHours * hourlyRate),
                            };
                        }
                        documentUrl = await generateInvoicePDF(updatedInvoice, fileName, true, acompteRow);
                    }
                } else {
                    // ── ACOMPTE or other: no deduction row ──────────────────────────────
                    documentUrl = await generateInvoicePDF(updatedInvoice, fileName, true, null);
                }
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

        // If this was a paid ACOMPTE, deduct the remaining (unconsumed) hours from stock
        if (invoice.type === 'ACOMPTE' && invoice.status === 'PAID' && invoice.hours && invoice.hours > 0) {
            const course = await prisma.course.findUnique({
                where: { id: invoice.courseId },
                select: { studentId: true }
            });
            if (course?.studentId) {
                const stock = await prisma.studentStock.findUnique({
                    where: { studentId_profId: { studentId: course.studentId, profId: req.user.id } }
                });
                // Only remove what's still available (can't go below 0)
                const hoursToRemove = stock ? Math.min(stock.purchasedHours, invoice.hours) : 0;
                if (hoursToRemove > 0) {
                    await prisma.studentStock.update({
                        where: { studentId_profId: { studentId: course.studentId, profId: req.user.id } },
                        data: { purchasedHours: { decrement: hoursToRemove } }
                    });
                }
            }
        }

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

// ============ BILLING PREFERENCE ============

// PATCH /api/invoices/billing-preference — Professor updates billing frequency for a student
router.patch('/billing-preference', authMiddleware, async (req, res) => {
    try {
        if (req.user.role !== 'PROFESSOR') {
            return res.status(403).json({ error: 'Only professors can update billing preference' });
        }

        const { studentId, preference } = req.body;
        if (!studentId || !['PER_CLASS', 'MONTHLY'].includes(preference)) {
            return res.status(400).json({ error: 'studentId and valid preference (PER_CLASS | MONTHLY) required' });
        }

        // Update/create the StudentStock record with the new preference
        const stock = await prisma.studentStock.upsert({
            where: { studentId_profId: { studentId, profId: req.user.id } },
            update: { billingPreference: preference },
            create: {
                studentId,
                profId: req.user.id,
                purchasedHours: 0,
                consumedHoursThisMonth: 0,
                billingPreference: preference,
            },
        });

        console.log(`[BillingPref] Updated preference for student ${studentId} to ${preference}`);
        res.json({ success: true, stock });
    } catch (error) {
        console.error('[BillingPref] Error:', error);
        res.status(500).json({ error: 'Failed to update billing preference' });
    }
});

// ============ CLASS SESSIONS ============

// GET /api/invoices/class-sessions — Get uninvoiced class sessions for a student (for MONTHLY billing)
router.get('/class-sessions', authMiddleware, async (req, res) => {
    try {
        if (req.user.role !== 'PROFESSOR') {
            return res.status(403).json({ error: 'Only professors can view class sessions' });
        }

        const { studentId } = req.query;
        const where = { profId: req.user.id, isInvoiced: false };
        if (studentId) where.studentId = studentId;

        const sessions = await prisma.classSession.findMany({
            where,
            include: { student: { select: { id: true, name: true } } },
            orderBy: { date: 'desc' },
        });

        res.json({ sessions });
    } catch (error) {
        console.error('[ClassSessions] Error:', error);
        res.status(500).json({ error: 'Failed to fetch class sessions' });
    }
});

// ============ MONTHLY INVOICE GENERATION ============

// POST /api/invoices/generate-monthly — Generate itemized Facture de Solde for all uninvoiced sessions of a parent
router.post('/generate-monthly', authMiddleware, requireActiveTrial, async (req, res) => {
    try {
        if (req.user.role !== 'PROFESSOR') {
            return res.status(403).json({ error: 'Only professors can generate invoices' });
        }

        const { parentId, courseId } = req.body;
        if (!parentId) return res.status(400).json({ error: 'parentId required' });

        // Find all children of this parent
        const parent = await prisma.user.findUnique({
            where: { id: parentId },
            include: {
                children: { select: { id: true, name: true } },
            },
        });
        if (!parent) return res.status(404).json({ error: 'Parent not found' });

        const childIds = parent.children.map(c => c.id);
        if (childIds.length === 0) return res.status(400).json({ error: 'Parent has no children' });

        // Fetch all uninvoiced sessions for this prof's students
        const sessions = await prisma.classSession.findMany({
            where: {
                profId: req.user.id,
                studentId: { in: childIds },
                isInvoiced: false,
                ...(courseId ? { courseId } : {}),
            },
            include: { student: { select: { id: true, name: true } } },
            orderBy: { date: 'asc' },
        });

        if (sessions.length === 0) {
            return res.status(400).json({ error: 'Aucune séance non facturée trouvée pour ce parent.' });
        }

        const totalCost = sessions.reduce((sum, s) => sum + s.cost, 0);

        // Get stock for acompte deduction info
        const stockDedacted = {};
        for (const s of sessions) {
            const key = s.studentId;
            if (!stockDedacted[key]) {
                const stock = await prisma.studentStock.findUnique({
                    where: { studentId_profId: { studentId: s.studentId, profId: req.user.id } },
                });
                stockDedacted[key] = stock ? stock.purchasedHours : 0;
            }
        }

        // Fetch paid ACOMPTE invoices for this parent to show as deductions.
        // Strictly type: 'ACOMPTE' — the type is preserved on payment since the recent fix.
        const acompteInvoices = await prisma.courseInvoice.findMany({
            where: {
                parentId,
                professorId: req.user.id,
                status: 'PAID',
                type: 'ACOMPTE',
            },
            select: { id: true, invoiceNumber: true, amount: true, hours: true, createdAt: true }
        });

        const acompteTotal = acompteInvoices.reduce((sum, a) => sum + a.amount, 0);
        const finalAmount = Math.max(0, totalCost - acompteTotal);

        // Invoice number
        const currentCount = await prisma.courseInvoice.count({ where: { professorId: req.user.id } });
        const prefix = req.user.id.substring(0, 6).toUpperCase();
        const invoiceNumber = `FAC-${prefix}-${String(currentCount + 1).padStart(4, '0')}`;

        // Build description from sessions
        const monthLabel = new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
        const description = `Facture de Solde - ${monthLabel} - ${sessions.length} séance(s)`;

        // Create the invoice
        const professor = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: { id: true, name: true, email: true, legalStatus: true, tvaStatus: true, address: true, phone: true, siret: true, companyName: true, commissionRate: true }
        });

        let invoice = await prisma.courseInvoice.create({
            data: {
                invoiceNumber,
                amount: finalAmount,
                description,
                professorId: req.user.id,
                parentId,
                courseId: courseId || null,
                type: 'SOLDE',
                status: finalAmount <= 0 ? 'PAID' : 'PENDING',
                paidAt: finalAmount <= 0 ? new Date() : null,
            },
            include: {
                course: { select: { title: true, code: true } },
                parent: { select: { name: true, email: true, address: true, street: true, zipCode: true, city: true } },
                professor: true,
            },
        });

        // Mark all sessions as invoiced and link to this invoice
        await prisma.classSession.updateMany({
            where: { id: { in: sessions.map(s => s.id) } },
            data: { isInvoiced: true, courseInvoiceId: invoice.id },
        });

        // Generate itemized PDF (now includes acompte deduction lines)
        const fileName = `${invoiceNumber}.pdf`;
        const documentUrl = await generateMonthlyPDF(invoice, professor, parent, sessions, acompteInvoices, fileName);

        invoice = await prisma.courseInvoice.update({
            where: { id: invoice.id },
            data: { documentUrl },
            include: {
                course: { select: { title: true, code: true } },
                parent: { select: { name: true, email: true } },
            },
        });

        console.log(`[Monthly] Generated invoice ${invoiceNumber} for parent ${parentId} — ${finalAmount.toFixed(2)}€ (sessions: ${totalCost.toFixed(2)}€, acompte: -${acompteTotal.toFixed(2)}€)`);
        res.json({ invoice });
    } catch (error) {
        console.error('[Monthly] Error:', error);
        res.status(500).json({ error: error.message || 'Failed to generate monthly invoice' });
    }
});

// ============ MONTHLY PDF GENERATOR ============

const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

async function generateMonthlyPDF(invoice, professor, parent, sessions, acompteInvoices, fileName) {
    return new Promise((resolve, reject) => {
        try {
            const uploadDir = process.env.UPLOAD_DIR || 'uploads';
            const absoluteDir = path.isAbsolute(uploadDir) ? uploadDir : path.join(process.cwd(), uploadDir);
            ensureDir(absoluteDir);

            const filePath = path.join(absoluteDir, fileName);
            const relativeUrl = `/uploads/${fileName}`;

            const doc = new PDFDocument({ margin: 50 });
            const stream = fs.createWriteStream(filePath);
            doc.pipe(stream);

            const isPro = professor.legalStatus === 'PRO';

            // ── HEADER ─────────────────────────────────────────────────────────
            doc.fontSize(20).font('Helvetica-Bold').fillColor('black').text('MathBox', { align: 'right' });
            doc.moveDown(0.5);
            doc.fontSize(22).text('FACTURE DE SOLDE', { align: 'left' });
            doc.fontSize(10).font('Helvetica');
            doc.text(`N° : ${invoice.invoiceNumber}`, { align: 'left' });
            doc.text(`Date : ${new Date(invoice.createdAt).toLocaleDateString('fr-FR')}`, { align: 'left' });
            doc.moveDown(1.5);

            // ── PARTIES ────────────────────────────────────────────────────────
            const partyY = doc.y;
            // Professor (left)
            doc.fontSize(9).font('Helvetica-Bold').fillColor('#6B7280').text(isPro ? 'PRESTATAIRE' : 'PROFESSEUR', 50, partyY);
            doc.font('Helvetica').fontSize(10).fillColor('black');
            doc.text(professor.name, 50, partyY + 14);
            if (isPro && professor.companyName) doc.text(professor.companyName, 50);
            if (professor.address) doc.text(professor.address, 50);
            if (professor.siret) doc.text(`SIRET : ${professor.siret}`, 50);

            // Parent (right)
            doc.fontSize(9).font('Helvetica-Bold').fillColor('#6B7280').text('CLIENT', 320, partyY);
            doc.font('Helvetica').fontSize(10).fillColor('black');
            doc.text(parent.name, 320, partyY + 14);
            doc.text(parent.email || '', 320);
            if (parent.address) doc.text(parent.address, 320);
            else if (parent.street) doc.text(`${parent.street}, ${parent.zipCode || ''} ${parent.city || ''}`, 320);

            doc.moveDown(3);

            // ── TABLE HEADER ───────────────────────────────────────────────────
            // Columns: Date(50,80) | Description(135,165) | Qté(305,70) | Prix unit.(380,70) | Total(455,90)
            const COL = { date: 50, desc: 135, qty: 305, unit: 380, total: 455 };
            const tableTop = doc.y;

            // Header background
            doc.rect(50, tableTop, 500, 16).fill('#F3F4F6');
            doc.font('Helvetica-Bold').fontSize(8).fillColor('#374151');
            doc.text('DATE',        COL.date,  tableTop + 4, { width: 80 });
            doc.text('DESCRIPTION', COL.desc,  tableTop + 4, { width: 165 });
            doc.text('QTÉ',         COL.qty,   tableTop + 4, { width: 70,  align: 'right' });
            doc.text('PRIX UNIT.',  COL.unit,  tableTop + 4, { width: 70,  align: 'right' });
            doc.text('TOTAL',       COL.total, tableTop + 4, { width: 90,  align: 'right' });

            let currentY = tableTop + 20;
            doc.fillColor('black');

            // ── SESSION ROWS ───────────────────────────────────────────────────
            let subtotal = 0;
            let rowShade = false;

            for (const s of sessions) {
                const durationH = s.duration / 60;                        // hours (float)
                const unitPrice  = durationH > 0 ? s.cost / durationH : 0; // €/h
                const rowH = 16;

                if (rowShade) doc.rect(50, currentY, 500, rowH).fill('#FAFAFA').stroke('#F3F4F6');
                rowShade = !rowShade;

                doc.font('Helvetica').fontSize(8).fillColor('#111827');
                doc.text(new Date(s.date).toLocaleDateString('fr-FR'),
                    COL.date,  currentY + 4, { width: 80 });
                doc.text(s.student?.name || '—',
                    COL.desc,  currentY + 4, { width: 165 });
                doc.text(`${durationH.toFixed(2)} h`,
                    COL.qty,   currentY + 4, { width: 70,  align: 'right' });
                doc.text(`${unitPrice.toFixed(2)} €/h`,
                    COL.unit,  currentY + 4, { width: 70,  align: 'right' });
                doc.text(`${s.cost.toFixed(2)} €`,
                    COL.total, currentY + 4, { width: 90,  align: 'right' });

                subtotal  += s.cost;
                currentY  += rowH;

                if (currentY > 700) { doc.addPage(); currentY = 50; rowShade = false; }
            }

            // ── ACOMPTE DEDUCTION ROW (single consolidated line) ───────────────
            const acomptes = Array.isArray(acompteInvoices) ? acompteInvoices : [];
            let acompteTotal = 0;
            let acompteHours = 0;

            for (const a of acomptes) {
                acompteTotal += a.amount;
                acompteHours += (a.hours || 0);
            }

            if (acomptes.length > 0 && acompteTotal > 0) {
                const unitPrice = acompteHours > 0 ? acompteTotal / acompteHours : 0;

                // Light red background for deduction row
                doc.rect(50, currentY, 500, 18).fill('#FEF2F2').stroke('#FECACA');
                doc.font('Helvetica-Bold').fontSize(8).fillColor('#DC2626');
                doc.text('—',
                    COL.date,  currentY + 5, { width: 80 });
                doc.text('Déduction acompte(s) réglé(s)',
                    COL.desc,  currentY + 5, { width: 165 });
                doc.text(`-${acompteHours.toFixed(2)} h`,
                    COL.qty,   currentY + 5, { width: 70,  align: 'right' });
                doc.text(`${unitPrice.toFixed(2)} €/h`,
                    COL.unit,  currentY + 5, { width: 70,  align: 'right' });
                doc.text(`-${acompteTotal.toFixed(2)} €`,
                    COL.total, currentY + 5, { width: 90,  align: 'right' });

                currentY += 22;
            }

            // ── TOTALS ─────────────────────────────────────────────────────────
            doc.moveTo(50, currentY).lineTo(550, currentY).lineWidth(0.5).stroke('#D1D5DB');
            currentY += 10;
            doc.fillColor('black');

            // Sub-total des séances
            doc.font('Helvetica').fontSize(9).fillColor('#6B7280');
            doc.text('Sous-total des séances :',  320, currentY, { width: 130, align: 'right' });
            doc.fillColor('#111827');
            doc.text(`${subtotal.toFixed(2)} €`,  COL.total, currentY, { width: 90, align: 'right' });
            currentY += 14;

            // Acomptes déduits (summary)
            if (acompteTotal > 0) {
                doc.font('Helvetica').fontSize(9).fillColor('#6B7280');
                doc.text('Total acomptes déduits :',   320, currentY, { width: 130, align: 'right' });
                doc.font('Helvetica-Bold').fillColor('#DC2626');
                doc.text(`-${acompteTotal.toFixed(2)} €`, COL.total, currentY, { width: 90, align: 'right' });
                currentY += 14;
            }

            // Separator + Grand total
            doc.moveTo(320, currentY).lineTo(550, currentY).lineWidth(1).stroke('#374151');
            currentY += 8;

            const totalLabel = invoice.status === 'PAID' ? 'Total TTC (Payé) :' : 'Total TTC :';
            doc.font('Helvetica-Bold').fontSize(11).fillColor('#111827');
            doc.text(totalLabel,                   320, currentY, { width: 130, align: 'right' });
            doc.text(`${invoice.amount.toFixed(2)} €`, COL.total, currentY, { width: 90,  align: 'right' });

            // ── PAYÉ STAMP ─────────────────────────────────────────────────────
            if (invoice.status === 'PAID') {
                doc.save();
                doc.translate(doc.page.width / 2, doc.page.height / 2);
                doc.rotate(-25);
                doc.font('Helvetica-Bold').fontSize(60);
                doc.fillOpacity(0.15).fillColor('#22C55E');
                doc.text('PAYÉ', -doc.widthOfString('PAYÉ') / 2, -40);
                doc.restore();
                doc.fillOpacity(1).fillColor('black');
            }

            // ── LEGAL ──────────────────────────────────────────────────────────
            const legalY = currentY + 70;
            doc.fontSize(7).font('Helvetica-Oblique').fillColor('#9CA3AF');
            if (isPro) {
                doc.text('TVA non applicable, article 293 B du CGI. Paiements sécurisés par Stripe via MathBox.', 50, legalY, { align: 'center', width: 500 });
            } else {
                doc.text('Reçu confirmant les prestations effectuées. Paiements sécurisés par Stripe via MathBox.', 50, legalY, { align: 'center', width: 500 });
            }

            doc.end();
            stream.on('finish', () => resolve(relativeUrl));
            stream.on('error', reject);
        } catch (err) {
            reject(err);
        }
    });
}

module.exports = router;
