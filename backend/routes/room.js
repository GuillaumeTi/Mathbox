const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const { AccessToken, RoomServiceClient } = require('livekit-server-sdk');
const authMiddleware = require('../middleware/auth');
const { uploadFile } = require('../services/storageService');
const { getTrialStatus } = require('../middleware/trialGuard');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

const WEEKLY_VIDEO_LIMIT_MINUTES = 120; // 2 hours per week

// Helper: get last Monday at 00:00
function getLastMonday() {
    const now = new Date();
    const day = now.getDay(); // 0=Sun, 1=Mon, ...
    const diff = day === 0 ? 6 : day - 1; // days since last Monday
    const monday = new Date(now);
    monday.setDate(now.getDate() - diff);
    monday.setHours(0, 0, 0, 0);
    return monday;
}

// POST /api/room/token - Generate LiveKit token
router.post('/token', authMiddleware, async (req, res) => {
    try {
        const { courseCode } = req.body;

        if (!courseCode) {
            return res.status(400).json({ error: 'Course code is required' });
        }

        // Verify user has access to this course
        const course = await prisma.course.findFirst({
            where: {
                code: courseCode,
                OR: [
                    { professorId: req.user.id },
                    { studentId: req.user.id },
                ],
            },
            select: {
                id: true,
                code: true,
                professorId: true,
                studentId: true,
                duration: true,
                whiteboardState: true,
            },
        });

        if (!course) {
            return res.status(403).json({ error: 'Access denied to this room' });
        }

        // ===== VIDEO TIME LIMITER (Professors only) =====
        if (req.user.role === 'PROFESSOR') {
            const profUser = await prisma.user.findUnique({
                where: { id: req.user.id },
                select: {
                    id: true, email: true, role: true,
                    subscriptionStatus: true, trialEndDate: true,
                    weeklyVideoMinutes: true, weeklyVideoResetAt: true,
                },
            });

            const trialStatus = await getTrialStatus(profUser);

            if (trialStatus.trialExpired) {
                // Reset weekly counter if needed
                const lastMonday = getLastMonday();
                let currentMinutes = profUser.weeklyVideoMinutes || 0;

                if (!profUser.weeklyVideoResetAt || new Date(profUser.weeklyVideoResetAt) < lastMonday) {
                    // Reset counter
                    currentMinutes = 0;
                    await prisma.user.update({
                        where: { id: req.user.id },
                        data: { weeklyVideoMinutes: 0, weeklyVideoResetAt: lastMonday },
                    });
                }

                // Check if limit exceeded
                if (currentMinutes >= WEEKLY_VIDEO_LIMIT_MINUTES) {
                    return res.status(403).json({
                        error: `Limite hebdomadaire de ${WEEKLY_VIDEO_LIMIT_MINUTES} minutes atteinte. Abonnez-vous pour un accès illimité.`,
                        videoLimitReached: true,
                        currentMinutes,
                        limitMinutes: WEEKLY_VIDEO_LIMIT_MINUTES,
                    });
                }

                // Accumulate course duration
                await prisma.user.update({
                    where: { id: req.user.id },
                    data: { weeklyVideoMinutes: { increment: course.duration || 60 } },
                });
            }
        }
        // ===== END VIDEO LIMITER =====

        // Room name = course code for consistency
        const roomName = courseCode;

        const at = new AccessToken(
            process.env.LIVEKIT_API_KEY,
            process.env.LIVEKIT_API_SECRET,
            {
                identity: `${req.user.role}-${req.user.id}`,
                name: req.user.name,
                metadata: JSON.stringify({
                    role: req.user.role,
                    userId: req.user.id,
                    courseId: course.id,
                }),
            }
        );

        at.addGrant({
            room: roomName,
            roomJoin: true,
            canPublish: true,
            canSubscribe: true,
            canPublishData: true, // For whiteboard DataChannel
        });

        const token = at.toJwt();

        // Create or find active session for this course
        let session = await prisma.session.findFirst({
            where: {
                courseId: course.id,
                status: { in: ['SCHEDULED', 'LIVE'] },
            },
        });

        if (!session) {
            session = await prisma.session.create({
                data: {
                    courseId: course.id,
                    status: 'LIVE',
                    startedAt: new Date(),
                },
            });
        }

        res.json({
            token,
            url: process.env.LIVEKIT_URL,
            roomName,
            sessionId: session.id,
            courseId: course.id,
            whiteboardState: course.whiteboardState || null,
        });
    } catch (error) {
        console.error('[Room] Token error:', error);
        res.status(500).json({ error: 'Failed to generate token' });
    }
});

// GET /api/room/status - Check room statuses (Prof)
router.get('/status', authMiddleware, async (req, res) => {
    try {
        if (req.user.role !== 'PROFESSOR') {
            return res.status(403).json({ error: 'Professors only' });
        }

        const courses = await prisma.course.findMany({
            where: { professorId: req.user.id },
            select: { id: true, code: true, studentId: true, startTime: true },
        });

        const livekitUrl = process.env.LIVEKIT_URL;
        const roomService = new RoomServiceClient(
            livekitUrl,
            process.env.LIVEKIT_API_KEY,
            process.env.LIVEKIT_API_SECRET
        );

        const roomStatuses = [];
        for (const course of courses) {
            try {
                const participants = await roomService.listParticipants(course.code);
                const hasStudent = participants.some(p => p.identity?.startsWith('STUDENT-'));

                let status = 'OFFLINE';
                if (hasStudent) {
                    status = 'ONLINE';
                } else if (course.startTime) {
                    // Check if course should have started > 5min ago
                    const now = new Date();
                    const courseHour = parseInt(course.startTime.split(':')[0]);
                    const courseMin = parseInt(course.startTime.split(':')[1]);
                    const todayStart = new Date();
                    todayStart.setHours(courseHour, courseMin, 0, 0);
                    const diff = (now - todayStart) / 60000;
                    if (diff > 5 && diff < 120) {
                        status = 'LATE';
                    }
                }

                roomStatuses.push({
                    courseId: course.id,
                    roomName: course.code,
                    status,
                    participantCount: participants.length,
                });
            } catch (e) {
                roomStatuses.push({
                    courseId: course.id,
                    roomName: course.code,
                    status: 'OFFLINE',
                    participantCount: 0,
                });
            }
        }

        res.json({ rooms: roomStatuses });
    } catch (error) {
        console.error('[Room] Status error:', error);
        res.status(500).json({ error: 'Failed to check room status' });
    }
});

// Helper to ensure a folder exists
async function ensureFolder(name, parentId, courseId, ownerId) {
    // For root course folders (parentId is null), look up strictly by courseId
    const query = (parentId === null && courseId)
        ? { parentId: null, courseId }
        : { name, parentId, courseId };

    let folder = await prisma.folder.findFirst({
        where: query
    });

    if (!folder) {
        // Get parent path
        let parentPath = '';
        if (parentId) {
            const parent = await prisma.folder.findUnique({ where: { id: parentId } });
            if (parent) parentPath = parent.path;
        }

        folder = await prisma.folder.create({
            data: {
                name,
                path: parentPath ? `${parentPath}/${name}` : (courseId ? `/courses/${courseId}/${name}` : name),
                ownerId,
                parentId,
                courseId,
                isAutoGenerated: true
            }
        });
    }
    return folder;
}

// POST /api/room/screenshot - Save a whiteboard screenshot
router.post('/screenshot', authMiddleware, async (req, res) => {
    try {
        const { imageData, sessionId, courseId, name } = req.body;

        if (!imageData || !sessionId || !courseId) {
            return res.status(400).json({ error: 'Image data, session ID and course ID required' });
        }

        // Fetch course details for folder structure
        const course = await prisma.course.findUnique({
            where: { id: courseId },
            include: { student: true }
        });

        if (!course) {
            return res.status(404).json({ error: 'Course not found' });
        }

        // Convert base64 to buffer
        const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');

        // Auto-Archiving Logic
        const structOwnerId = course.professorId;

        // 1. Ensure Root Course Folder
        const rootFolder = await ensureFolder(course.title, null, courseId, structOwnerId);

        // 2. Ensure 'Archives'
        const archivesFolder = await ensureFolder('Archives', rootFolder.id, courseId, structOwnerId);

        // 3. Ensure Date Folder
        const dateStr = new Date().toISOString().split('T')[0];
        const dateFolder = await ensureFolder(dateStr, archivesFolder.id, courseId, structOwnerId);

        // Sanitize helper (identical to documents.js)
        const sanitize = (str, isCourseName = false) => {
            let s = str || '';
            if (isCourseName) {
                // Strip " - Modified" (case-insensitive) before sanitizing
                s = s.replace(/\s*-\s*Modified\s*/gi, '');
            }
            return s.replace(/[^a-zA-Z0-9._-]/g, '_');
        };

        const profId = course.professorId;
        const studentId = course.studentId || 'Unknown';
        const courseName = sanitize(course.title, true);

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const safeName = (name || `Screenshot ${timestamp}`).replace(/[^a-zA-Z0-9À-ÿ _-]/g, '').trim();
        const filename = `${safeName}.png`;

        // Physical Path Strategy: Teacher_{ID}/Student/Student_{ID}/{CourseName}/Archives/{Date}/{filename}
        const targetPath = `Teacher_${profId}/Student/Student_${studentId}/${courseName}/Archives/${dateStr}/${filename}`;

        const result = await uploadFile(buffer, targetPath, 'image/png');

        // Save document reference
        const doc = await prisma.document.create({
            data: {
                title: safeName,
                type: 'SCREENSHOT',
                url: result.url,
                size: buffer.length,
                mimeType: 'image/png',
                ownerId: req.user.id,
                sessionId,
                courseId,
                folderId: dateFolder.id // Link to VFS
            },
        });

        res.json({ document: doc, url: result.url });
    } catch (error) {
        console.error('[Room] Screenshot error:', error);
        res.status(500).json({ error: 'Failed to save screenshot' });
    }
});

// GET /api/room/whiteboard/:courseId - Restore whiteboard state
router.get('/whiteboard/:courseId', authMiddleware, async (req, res) => {
    try {
        const course = await prisma.course.findFirst({
            where: {
                id: req.params.courseId,
                OR: [
                    { professorId: req.user.id },
                    { studentId: req.user.id },
                ],
            },
            select: { whiteboardState: true },
        });

        if (!course) {
            return res.status(404).json({ error: 'Course not found or access denied' });
        }

        res.json({ whiteboardState: course.whiteboardState || null });
    } catch (error) {
        console.error('[Room] Whiteboard restore error:', error);
        res.status(500).json({ error: 'Failed to restore whiteboard state' });
    }
});

// POST /api/room/whiteboard/:courseId - Save whiteboard state (Prof only)
router.post('/whiteboard/:courseId', authMiddleware, async (req, res) => {
    try {
        if (req.user.role !== 'PROFESSOR') {
            return res.status(403).json({ error: 'Only professors can save whiteboard state' });
        }

        const { tabs } = req.body;
        if (!tabs || !Array.isArray(tabs)) {
            return res.status(400).json({ error: 'Invalid whiteboard data: tabs must be an array' });
        }

        const course = await prisma.course.findFirst({
            where: {
                id: req.params.courseId,
                professorId: req.user.id,
            },
        });

        if (!course) {
            return res.status(404).json({ error: 'Course not found or access denied' });
        }

        await prisma.course.update({
            where: { id: req.params.courseId },
            data: { whiteboardState: tabs },
        });

        res.json({ success: true });
    } catch (error) {
        console.error('[Room] Whiteboard save error:', error);
        res.status(500).json({ error: 'Failed to save whiteboard state' });
    }
});

// POST /api/room/validate-session - Professor validates session & deducts hours
router.post('/validate-session', authMiddleware, async (req, res) => {
    try {
        if (req.user.role !== 'PROFESSOR') {
            return res.status(403).json({ error: 'Only professors can validate sessions' });
        }

        const { courseId, sessionId, durationMinutes, hoursConsumed, hasAudioRecording, generateAIReport, hourlyRate } = req.body;

        if (!courseId) return res.status(400).json({ error: 'courseId required' });

        const course = await prisma.course.findFirst({
            where: { id: courseId, professorId: req.user.id },
            select: { id: true, studentId: true, title: true, subject: true }
        });
        if (!course) return res.status(404).json({ error: 'Course not found' });

        const durationMins = parseFloat(durationMinutes) || 0;
        const durationHours = durationMins / 60;
        const ratePerHour = parseFloat(hourlyRate) || 0;
        const sessionCost = durationHours * ratePerHour;

        let invoiceGenerated = null;
        let billingMode = 'NONE';

        if (course.studentId && durationMins > 0) {
            // Fetch the student's stock and billing preference
            const stock = await prisma.studentStock.findUnique({
                where: { studentId_profId: { studentId: course.studentId, profId: req.user.id } }
            });

            billingMode = stock?.billingPreference || 'PER_CLASS';
            const purchasedHours = stock?.purchasedHours || 0;

            // Get parent for invoice generation
            const student = await prisma.user.findUnique({
                where: { id: course.studentId },
                select: { id: true, name: true, parentId: true }
            });

            // Save the ClassSession record
            const classSession = await prisma.classSession.create({
                data: {
                    date: new Date(),
                    duration: durationMins,
                    cost: sessionCost,
                    studentId: course.studentId,
                    profId: req.user.id,
                    courseId: course.id,
                    isInvoiced: billingMode === 'MONTHLY' ? false : true, // MONTHLY: uninvoiced yet
                }
            });

            if (billingMode === 'PER_CLASS' && student?.parentId && ratePerHour > 0) {
                // ============ PER_CLASS logic ============
                const { generateInvoicePDF } = require('../services/pdfGenerator');

                // Case A: Stock covers full session
                // Case B: Stock partially covers or doesn't cover at all
                const coveredHours = Math.min(purchasedHours, durationHours);
                const uncoveredHours = Math.max(0, durationHours - purchasedHours);
                const invoiceAmount = uncoveredHours * ratePerHour;

                // Deduct covered hours from stock
                if (coveredHours > 0 && stock) {
                    await prisma.studentStock.update({
                        where: { id: stock.id },
                        data: { purchasedHours: { decrement: coveredHours } }
                    });
                }

                // Find the last ACOMPTE invoice for reference
                const lastAcompte = await prisma.courseInvoice.findFirst({
                    where: { courseId: course.id, type: 'ACOMPTE', status: 'PAID' },
                    orderBy: { createdAt: 'desc' }
                });

                // Build invoice number
                const currentCount = await prisma.courseInvoice.count({ where: { professorId: req.user.id } });
                const prefix = req.user.id.substring(0, 6).toUpperCase();
                const invoiceNumber = `FAC-${prefix}-${String(currentCount + 1).padStart(4, '0')}`;

                // Build description (clean — acompte deduction is shown as a separate PDF row)
                let description = `Cours du ${new Date().toLocaleDateString('fr-FR')} — ${durationMins} min`;
                if (uncoveredHours <= 0) {
                    description += '\n(Prestation en ligne)';
                }

                // Fetch professor info for PDF
                const professor = await prisma.user.findUnique({
                    where: { id: req.user.id },
                    select: { id: true, name: true, email: true, legalStatus: true, tvaStatus: true, address: true, phone: true, siret: true, companyName: true, commissionRate: true }
                });
                const parentUser = await prisma.user.findUnique({
                    where: { id: student.parentId },
                    select: { id: true, name: true, email: true, address: true, street: true, zipCode: true, city: true }
                });

                const invoiceStatus = invoiceAmount <= 0 ? 'PAID' : 'PENDING';

                let invoice = await prisma.courseInvoice.create({
                    data: {
                        invoiceNumber,
                        amount: Math.max(0, invoiceAmount),
                        hours: durationHours,
                        hourlyRate: ratePerHour,
                        description,
                        courseId: course.id,
                        professorId: req.user.id,
                        parentId: student.parentId,
                        type: 'SOLDE',
                        status: invoiceStatus,
                        paidAt: invoiceStatus === 'PAID' ? new Date() : null,
                    },
                    include: {
                        course: { select: { title: true, code: true } },
                        parent: { select: { name: true, email: true, address: true, street: true, zipCode: true, city: true } },
                        professor: true,
                    }
                });

                // Link classSession to this invoice
                await prisma.classSession.update({
                    where: { id: classSession.id },
                    data: { courseInvoiceId: invoice.id }
                });

                // Build acompteRow for the PDF deduction line
                let acompteRow = null;
                if (coveredHours > 0 && lastAcompte) {
                    acompteRow = {
                        label: `Facture d'acompte ${lastAcompte.invoiceNumber || lastAcompte.id.substring(0, 8)} : -${coveredHours.toFixed(2)}h`,
                        hours: coveredHours,
                        unitPrice: -ratePerHour,
                        total: -(coveredHours * ratePerHour),
                    };
                }

                // Generate PDF
                try {
                    const fileName = `${invoiceNumber}.pdf`;
                    const documentUrl = await generateInvoicePDF(invoice, fileName, invoiceStatus === 'PAID', acompteRow);
                    invoice = await prisma.courseInvoice.update({
                        where: { id: invoice.id },
                        data: { documentUrl }
                    });
                } catch (pdfErr) {
                    console.error('[Room] PDF generation error:', pdfErr);
                }

                invoiceGenerated = {
                    invoiceNumber,
                    amount: invoiceAmount,
                    status: invoiceStatus,
                    coveredHours,
                    uncoveredHours,
                };

                console.log(`[Room] PER_CLASS invoice generated: ${invoiceNumber} — ${invoiceAmount.toFixed(2)}€ (${invoiceStatus})`);

            } else if (billingMode === 'MONTHLY') {
                // ============ MONTHLY: just save the session, no invoice ============
                // Still deduct consumed hours from stock if stock exists
                if (stock && purchasedHours > 0) {
                    const deductHours = Math.min(purchasedHours, durationHours);
                    await prisma.studentStock.update({
                        where: { id: stock.id },
                        data: { purchasedHours: { decrement: deductHours } }
                    });
                }
                console.log(`[Room] MONTHLY mode: ClassSession saved, no invoice generated yet.`);
            }
        }

        // Legacy stock deduction (hoursConsumed field, for backwards compat without hourlyRate)
        const consumed = parseFloat(hoursConsumed) || 0;
        if (consumed > 0 && course.studentId && ratePerHour === 0) {
            try {
                const stock = await prisma.studentStock.findUnique({
                    where: { studentId_profId: { studentId: course.studentId, profId: req.user.id } }
                });
                if (stock) {
                    await prisma.studentStock.update({
                        where: { studentId_profId: { studentId: course.studentId, profId: req.user.id } },
                        data: { consumedHoursThisMonth: { increment: consumed } }
                    });
                }
            } catch (stockErr) {
                console.error('[Room] Stock deduction error:', stockErr);
            }
        }

        // AI Report generation
        const { generateAIReport: genAI } = req.body;
        let aiSynthesisUrl = null;
        if (genAI || generateAIReport) {
            const doc = new PDFDocument();
            const fileName = `Synthesis_${(course.title || course.subject || 'Session').replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.pdf`;
            const archivesDir = path.join(__dirname, '../../Archives');
            if (!fs.existsSync(archivesDir)) fs.mkdirSync(archivesDir, { recursive: true });
            const filePath = path.join(archivesDir, fileName);
            const stream = fs.createWriteStream(filePath);
            doc.pipe(stream);
            doc.fontSize(24).text('Rapport IA de Session (BETA)', { align: 'center' });
            doc.moveDown();
            doc.fontSize(16).text(`Matière : ${course.subject || 'N/A'}`);
            doc.text(`Titre : ${course.title || 'N/A'}`);
            doc.text(`Durée : ${durationMinutes} minutes`);
            doc.moveDown();
            doc.fontSize(14).text('Synthèse générée :', { underline: true });
            doc.moveDown();
            doc.fontSize(12).text(`Ceci est un rapport généré automatiquement à partir de la session audio et du tableau blanc. (Données factices pour la V2). L'élève a montré une bonne compréhension des concepts abordés. À revoir: Les fractions.`);
            doc.end();
            await new Promise((resolve) => stream.on('finish', resolve));
            aiSynthesisUrl = `/Archives/${fileName}`;
            console.log('[Room] AI Report generated at:', filePath);
        }

        res.json({
            success: true,
            billingMode,
            invoiceGenerated,
            synthesis: {
                sessionId,
                courseTitle: course.title || course.subject || 'Session',
                durationMinutes: durationMins,
                aiSynthesisUrl,
                status: 'VALIDATED'
            }
        });
    } catch (error) {
        console.error('[Room] Session validation error:', error);
        res.status(500).json({ error: 'Failed to validate session' });
    }
});

module.exports = router;
