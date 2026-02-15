const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const authMiddleware = require('../middleware/auth');

const prisma = new PrismaClient();

// Generate unique course code like "MAT-4821"
function generateCourseCode(subject) {
    const prefix = (subject || 'GEN').substring(0, 3).toUpperCase();
    const num = Math.floor(1000 + Math.random() * 9000);
    return `${prefix}-${num}`;
}

// POST /api/courses - Create a new course (Prof only)
router.post('/', authMiddleware, async (req, res) => {
    try {
        if (req.user.role !== 'PROF') {
            return res.status(403).json({ error: 'Only professors can create courses' });
        }

        const { title, subject, level, description, recurrence, dayOfWeek, startTime, startDate, duration } = req.body;

        if (!title) {
            return res.status(400).json({ error: 'Title is required' });
        }

        // Generate unique code
        let code;
        let exists = true;
        while (exists) {
            code = generateCourseCode(subject);
            exists = await prisma.course.findUnique({ where: { code } });
        }

        const course = await prisma.course.create({
            data: {
                code,
                title,
                subject,
                level,
                description,
                recurrence: recurrence || 'ONCE',
                dayOfWeek: dayOfWeek != null ? parseInt(dayOfWeek) : null,
                startTime,
                startDate: startDate ? new Date(startDate) : null,
                duration: parseInt(duration) || 60,
                professorId: req.user.id,
            },
            include: {
                student: { select: { name: true, email: true } },
            },
        });

        res.status(201).json({ course, code });
    } catch (error) {
        console.error('[Courses] Create error:', error);
        res.status(500).json({ error: 'Failed to create course' });
    }
});

// POST /api/courses/join - Student joins with code
router.post('/join', authMiddleware, async (req, res) => {
    try {
        if (req.user.role !== 'STUDENT') {
            return res.status(403).json({ error: 'Only students can join courses' });
        }

        const { code } = req.body;
        if (!code) {
            return res.status(400).json({ error: 'Course code is required' });
        }

        const course = await prisma.course.findUnique({
            where: { code: code.toUpperCase().trim() },
        });

        if (!course) {
            return res.status(404).json({ error: 'Invalid course code' });
        }

        if (course.studentId) {
            if (course.studentId === req.user.id) {
                return res.status(400).json({ error: 'You are already enrolled in this course' });
            }
            return res.status(400).json({ error: 'This course already has a student' });
        }

        const updatedCourse = await prisma.course.update({
            where: { id: course.id },
            data: { studentId: req.user.id },
            include: {
                professor: { select: { name: true, email: true } },
            },
        });

        // Notify professor via Socket.io
        const io = req.app.get('io');
        io.to(`user:${course.professorId}`).emit('course:student_joined', {
            courseId: course.id,
            studentName: req.user.name,
        });

        res.json({ course: updatedCourse });
    } catch (error) {
        console.error('[Courses] Join error:', error);
        res.status(500).json({ error: 'Failed to join course' });
    }
});

// GET /api/courses - List user's courses
router.get('/', authMiddleware, async (req, res) => {
    try {
        let courses;
        if (req.user.role === 'PROF') {
            courses = await prisma.course.findMany({
                where: { professorId: req.user.id },
                include: {
                    student: { select: { id: true, name: true, email: true } },
                    _count: { select: { sessions: true, documents: true } },
                },
                orderBy: { createdAt: 'desc' },
            });
        } else {
            courses = await prisma.course.findMany({
                where: { studentId: req.user.id },
                include: {
                    professor: { select: { id: true, name: true, email: true } },
                    _count: { select: { sessions: true, documents: true } },
                },
                orderBy: { createdAt: 'desc' },
            });
        }

        res.json({ courses });
    } catch (error) {
        console.error('[Courses] List error:', error);
        res.status(500).json({ error: 'Failed to get courses' });
    }
});

// GET /api/courses/:id - Get single course
router.get('/:id', authMiddleware, async (req, res) => {
    try {
        const course = await prisma.course.findFirst({
            where: {
                id: req.params.id,
                OR: [
                    { professorId: req.user.id },
                    { studentId: req.user.id },
                ],
            },
            include: {
                professor: { select: { id: true, name: true, email: true } },
                student: { select: { id: true, name: true, email: true } },
                sessions: { orderBy: { date: 'desc' }, take: 10 },
                homeworks: { orderBy: { createdAt: 'desc' }, take: 10 },
            },
        });

        if (!course) {
            return res.status(404).json({ error: 'Course not found' });
        }

        res.json({ course });
    } catch (error) {
        console.error('[Courses] Get error:', error);
        res.status(500).json({ error: 'Failed to get course' });
    }
});

// PUT /api/courses/:id - Update course
router.put('/:id', authMiddleware, async (req, res) => {
    try {
        const course = await prisma.course.findFirst({
            where: { id: req.params.id, professorId: req.user.id },
        });

        if (!course) {
            return res.status(404).json({ error: 'Course not found or access denied' });
        }

        const { title, subject, level, description, status, recurrence, dayOfWeek, startTime, duration } = req.body;
        const data = {};
        if (title) data.title = title;
        if (subject) data.subject = subject;
        if (level) data.level = level;
        if (description !== undefined) data.description = description;
        if (status) data.status = status;
        if (recurrence) data.recurrence = recurrence;
        if (dayOfWeek != null) data.dayOfWeek = parseInt(dayOfWeek);
        if (startTime) data.startTime = startTime;
        if (duration) data.duration = parseInt(duration);

        const updated = await prisma.course.update({
            where: { id: req.params.id },
            data,
            include: { student: { select: { name: true, email: true } } },
        });

        res.json({ course: updated });
    } catch (error) {
        console.error('[Courses] Update error:', error);
        res.status(500).json({ error: 'Failed to update course' });
    }
});

// DELETE /api/courses/:id
router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        const course = await prisma.course.findFirst({
            where: { id: req.params.id, professorId: req.user.id },
        });

        if (!course) {
            return res.status(404).json({ error: 'Course not found or access denied' });
        }

        await prisma.course.delete({ where: { id: req.params.id } });
        res.json({ success: true });
    } catch (error) {
        console.error('[Courses] Delete error:', error);
        res.status(500).json({ error: 'Failed to delete course' });
    }
});

module.exports = router;
