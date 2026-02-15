const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const { WebhookReceiver } = require('livekit-server-sdk');
const { transcribeAudio, analyzeCourse } = require('../services/openaiService');

const prisma = new PrismaClient();

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

                            // Create auto-generated dated folder
                            const dateStr = new Date().toISOString().split('T')[0];
                            const folderName = `${dateStr} - ${course.title}`;

                            await prisma.folder.create({
                                data: {
                                    name: folderName,
                                    path: `/${course.professorId}/${course.studentId || 'no-student'}/${folderName}`,
                                    isAutoGenerated: true,
                                    ownerId: course.professorId,
                                    sessionId: session.id,
                                },
                            });

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

module.exports = router;
