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
            select: {
                id: true,
                code: true,
                professorId: true,
                studentId: true,
                whiteboardState: true,
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

module.exports = router;
