const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const { WebhookReceiver } = require('livekit-server-sdk');
const { transcribeAudio, analyzeCourse } = require('../services/openaiService');
const { getTrialStatus } = require('../middleware/trialGuard');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();
const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';

// LiveKit Webhook receiver
const webhookReceiver = new WebhookReceiver(
    process.env.LIVEKIT_API_KEY,
    process.env.LIVEKIT_API_SECRET
);

// POST /api/webhooks/livekit
router.post('/livekit', express_raw(), async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        const body = req.body.toString();

        let event;
        try {
            event = webhookReceiver.receive(body, authHeader);
        } catch (err) {
            console.error('[Webhook] Verification failed:', err.message);
            // In dev mode, try parsing raw body
            try {
                event = JSON.parse(body);
            } catch (e) {
                return res.status(401).json({ error: 'Invalid webhook' });
            }
        }

        console.log(`[Webhook] Event: ${event.event}`, event.room?.name);

        const io = req.app.get('io');

        switch (event.event) {
            case 'participant_joined': {
                const roomName = event.room?.name;
                const identity = event.participant?.identity || '';
                const isStudent = identity.startsWith('STUDENT-');

                if (roomName && isStudent) {
                    // Find course by code (room name = course code)
                    const course = await prisma.course.findUnique({
                        where: { code: roomName },
                    });

                    if (course) {
                        // Update course status
                        await prisma.course.update({
                            where: { id: course.id },
                            data: { status: 'LIVE' },
                        });

                        // Notify professor via Socket.io
                        io.to(`user:${course.professorId}`).emit('room:status_change', {
                            courseId: course.id,
                            roomName,
                            status: 'ONLINE',
                            participantIdentity: identity,
                        });

                        console.log(`[Webhook] Student joined room: ${roomName}`);
                    }
                }
                break;
            }

            case 'participant_left': {
                const roomName = event.room?.name;
                const identity = event.participant?.identity || '';
                const isStudent = identity.startsWith('STUDENT-');

                if (roomName && isStudent) {
                    const course = await prisma.course.findUnique({
                        where: { code: roomName },
                    });

                    if (course) {
                        io.to(`user:${course.professorId}`).emit('room:status_change', {
                            courseId: course.id,
                            roomName,
                            status: 'OFFLINE',
                        });
                    }
                }
                break;
            }

            case 'room_finished': {
                const roomName = event.room?.name;
                console.log(`[Webhook] Room finished: ${roomName}`);

                if (roomName) {
                    const course = await prisma.course.findUnique({
                        where: { code: roomName },
                    });

                    if (course) {
                        // Update course status
                        await prisma.course.update({
                            where: { id: course.id },
                            data: { status: 'SCHEDULED' },
                        });

                        // Find active session
                        const session = await prisma.session.findFirst({
                            where: { courseId: course.id, status: 'LIVE' },
                        });

                        if (session) {
                            // Complete the session
                            await prisma.session.update({
                                where: { id: session.id },
                                data: {
                                    status: 'COMPLETED',
                                    completedAt: new Date(),
                                },
                            });

                            // Create auto-generated dated folder on filesystem
                            const dateStr = new Date().toISOString().split('T')[0];
                            const subject = course.subject || 'Général';
                            const folderName = `${dateStr} - ${subject}`;

                            // Create physical directories for both prof and student
                            const profPath = path.join(UPLOAD_DIR, course.professorId, folderName);
                            const studentId = course.studentId || 'no-student';
                            const studentPath = path.join(UPLOAD_DIR, studentId, folderName);

                            fs.mkdirSync(profPath, { recursive: true });
                            fs.mkdirSync(studentPath, { recursive: true });
                            console.log(`[Webhook] Created folders: ${profPath}, ${studentPath}`);

                            // Create Prisma Folder record for professor
                            await prisma.folder.create({
                                data: {
                                    name: folderName,
                                    path: `/${course.professorId}/${folderName}`,
                                    isAutoGenerated: true,
                                    ownerId: course.professorId,
                                    sessionId: session.id,
                                },
                            });

                            // Create Prisma Folder record for student (if exists)
                            if (course.studentId) {
                                await prisma.folder.create({
                                    data: {
                                        name: folderName,
                                        path: `/${course.studentId}/${folderName}`,
                                        isAutoGenerated: true,
                                        ownerId: course.studentId,
                                    },
                                });
                            }
                            // Check if Professor is eligible for AI features
                            const profUser = await prisma.user.findUnique({
                                where: { id: course.professorId },
                                select: { role: true, trialEndDate: true, subscriptionStatus: true }
                            });

                            const trialStatus = await getTrialStatus(profUser);

                            if (!trialStatus.trialExpired) {
                                // Trigger mocked AI pipeline
                                console.log(`[Webhook] Triggering AI pipeline for session: ${session.id}`);
                                try {
                                    const transcript = await transcribeAudio(Buffer.from('mock-audio'));
                                    const analysis = await analyzeCourse(transcript.text, course.subject);

                                    await prisma.session.update({
                                        where: { id: session.id },
                                        data: {
                                            aiReportUrl: `/reports/${session.id}_report.json`,
                                            notes: JSON.stringify(analysis.analysis),
                                        },
                                    });

                                    console.log(`[Webhook] AI pipeline completed for session: ${session.id}`);
                                } catch (aiErr) {
                                    console.error('[Webhook] AI pipeline error:', aiErr);
                                }
                            } else {
                                console.log(`[Webhook] Skipping AI pipeline: Trial expired for prof ${course.professorId}`);
                            }
                        }

                        // Notify professor
                        io.to(`user:${course.professorId}`).emit('room:finished', {
                            courseId: course.id,
                            roomName,
                        });
                    }
                }
                break;
            }
        }

        res.json({ received: true });
    } catch (error) {
        console.error('[Webhook] Error:', error);
        res.status(500).json({ error: 'Webhook processing failed' });
    }
});

// Middleware for raw body (needed for webhook signature verification)
function express_raw() {
    return (req, res, next) => {
        if (req.headers['content-type'] === 'application/webhook+json' ||
            req.headers['content-type'] === 'application/json') {
            // Body already parsed by express.json(), convert back for verification
            if (typeof req.body === 'object') {
                req.body = Buffer.from(JSON.stringify(req.body));
            }
        }
        next();
    };
}

// ============ STRIPE WEBHOOK ============
const { getStripe } = require('../services/stripe');

router.post('/stripe', async (req, res) => {
    const stripe = getStripe();
    if (!stripe) return res.status(400).json({ error: 'Stripe not configured' });

    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;
    try {
        if (webhookSecret) {
            event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
        } else {
            // Dev mode — no signature check
            event = JSON.parse(req.body.toString());
            console.warn('[Stripe Webhook] No STRIPE_WEBHOOK_SECRET set — skipping signature verification');
        }
    } catch (err) {
        console.error('[Stripe Webhook] Signature verification failed:', err.message);
        return res.status(400).json({ error: 'Webhook signature verification failed' });
    }

    console.log(`[Stripe Webhook] Event: ${event.type}`);

    try {
        switch (event.type) {
            // === Subscription lifecycle ===
            case 'customer.subscription.updated': {
                const subscription = event.data.object;
                const customerId = subscription.customer;
                const user = await prisma.user.findFirst({ where: { stripeCustomerId: customerId } });
                if (user) {
                    const status = subscription.status === 'active' ? 'ACTIVE' :
                        subscription.status === 'trialing' ? 'TRIAL' : 'EXPIRED';
                    await prisma.user.update({
                        where: { id: user.id },
                        data: {
                            subscriptionStatus: status,
                            stripeSubscriptionId: subscription.id,
                        },
                    });
                    console.log(`[Stripe Webhook] Subscription ${status} for user ${user.id}`);
                }
                break;
            }

            case 'customer.subscription.deleted': {
                const subscription = event.data.object;
                const customerId = subscription.customer;
                const user = await prisma.user.findFirst({ where: { stripeCustomerId: customerId } });
                if (user) {
                    await prisma.user.update({
                        where: { id: user.id },
                        data: {
                            subscriptionStatus: 'EXPIRED',
                            stripeSubscriptionId: null,
                        },
                    });
                    console.log(`[Stripe Webhook] Subscription deleted for user ${user.id}`);
                }
                break;
            }

            // === One-off payments (credits, course invoices) ===
            case 'payment_intent.succeeded': {
                const paymentIntent = event.data.object;
                const metadata = paymentIntent.metadata || {};

                // AI Credit purchase
                if (metadata.type === 'credits' && metadata.userId && metadata.credits) {
                    const creditAmount = parseInt(metadata.credits);
                    await prisma.user.update({
                        where: { id: metadata.userId },
                        data: { credits: { increment: creditAmount } },
                    });
                    await prisma.aICredit.create({
                        data: {
                            amount: creditAmount,
                            type: 'PURCHASE',
                            description: `Achat de ${creditAmount} crédits IA`,
                            userId: metadata.userId,
                        },
                    });
                    console.log(`[Stripe Webhook] ${creditAmount} credits added for user ${metadata.userId}`);
                }

                // Course invoice payment (marketplace)
                if (metadata.type === 'course_invoice' && metadata.courseInvoiceId) {
                    const invoice = await prisma.courseInvoice.findUnique({
                        where: { id: metadata.courseInvoiceId },
                        include: { professor: true, parent: true }
                    });

                    if (invoice && invoice.status !== 'PAID') {
                        const isPro = invoice.professor.legalStatus === 'PRO';
                        const docType = isPro ? 'INVOICE' : 'RECEIPT';
                        const fileName = `${invoice.invoiceNumber || invoice.id.split('-')[0]}.pdf`;

                        const paidAtTime = new Date();

                        // Update DB First so PDF generator has access to paidAt in the object
                        await prisma.courseInvoice.update({
                            where: { id: invoice.id },
                            data: {
                                status: 'PAID',
                                stripePaymentIntentId: paymentIntent.id,
                                paidAt: paidAtTime,
                                type: docType
                            },
                        });

                        // Credit StudentStock if this was an ACOMPTE with hours
                        if (invoice.type === 'ACOMPTE' && invoice.hours && invoice.hours > 0) {
                            try {
                                const course = await prisma.course.findUnique({
                                    where: { id: invoice.courseId },
                                    select: { studentId: true }
                                });
                                if (course?.studentId) {
                                    await prisma.studentStock.upsert({
                                        where: {
                                            studentId_profId: {
                                                studentId: course.studentId,
                                                profId: invoice.professorId
                                            }
                                        },
                                        update: { purchasedHours: { increment: invoice.hours } },
                                        create: {
                                            studentId: course.studentId,
                                            profId: invoice.professorId,
                                            purchasedHours: invoice.hours,
                                            consumedHoursThisMonth: 0
                                        }
                                    });
                                    console.log(`[Stripe Webhook] Credited ${invoice.hours}h to StudentStock`);
                                }
                            } catch (stockErr) {
                                console.error('[Stripe Webhook] StudentStock credit error:', stockErr);
                            }
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
                            console.error('[Stripe Webhook] PDF Generation failed', pdfErr);
                        }

                        // Save final doc URL
                        if (documentUrl) {
                            await prisma.courseInvoice.update({
                                where: { id: invoice.id },
                                data: { documentUrl },
                            });
                        }
                    }

                    const io = req.app.get('io');
                    if (io && metadata.professorId && metadata.parentId) {
                        io.to(`user:${metadata.professorId}`).emit('invoice:paid', { invoiceId: metadata.courseInvoiceId });
                        io.to(`user:${metadata.parentId}`).emit('invoice:paid', { invoiceId: metadata.courseInvoiceId });
                    }

                    console.log(`[Stripe Webhook] CourseInvoice ${metadata.courseInvoiceId} paid`);
                }
                break;
            }

            default:
                console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
        }

        res.json({ received: true });
    } catch (error) {
        console.error('[Stripe Webhook] Processing error:', error);
        res.status(500).json({ error: 'Webhook processing failed' });
    }
});

module.exports = router;
