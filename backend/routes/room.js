const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const { AccessToken, RoomServiceClient } = require('livekit-server-sdk');
const authMiddleware = require('../middleware/auth');
const { uploadFile } = require('../services/storageService');

const prisma = new PrismaClient();

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
        });

        if (!course) {
            return res.status(403).json({ error: 'Access denied to this room' });
        }

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
        });
    } catch (error) {
        console.error('[Room] Token error:', error);
        res.status(500).json({ error: 'Failed to generate token' });
    }
});

// GET /api/room/status - Check room statuses (Prof)
router.get('/status', authMiddleware, async (req, res) => {
    try {
        if (req.user.role !== 'PROF') {
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

// POST /api/room/screenshot - Save a whiteboard screenshot
router.post('/screenshot', authMiddleware, async (req, res) => {
    try {
        const { imageData, sessionId, courseId } = req.body;

        if (!imageData || !sessionId) {
            return res.status(400).json({ error: 'Image data and session ID required' });
        }

        // Convert base64 to buffer
        const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `screenshot_${timestamp}.png`;
        const targetPath = `${req.user.id}/${courseId || 'general'}/${filename}`;

        const result = await uploadFile(buffer, targetPath, 'image/png');

        // Save document reference
        const doc = await prisma.document.create({
            data: {
                title: `Screenshot ${timestamp}`,
                type: 'SCREENSHOT',
                url: result.url,
                size: buffer.length,
                mimeType: 'image/png',
                ownerId: req.user.id,
                sessionId,
                courseId,
            },
        });

        res.json({ document: doc, url: result.url });
    } catch (error) {
        console.error('[Room] Screenshot error:', error);
        res.status(500).json({ error: 'Failed to save screenshot' });
    }
});

module.exports = router;
