const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const authMiddleware = require('../middleware/auth');

const prisma = new PrismaClient();

// POST /api/homeworks - Create a homework assignment
router.post('/', authMiddleware, async (req, res) => {
    try {
        const { courseId, title, description, dueDate } = req.body;

        if (!courseId || !title) {
            return res.status(400).json({ error: 'Course ID and Title are required' });
        }

        // Verify Prof owns the course
        const course = await prisma.course.findUnique({
            where: { id: courseId },
            include: { student: true }
        });

        if (!course) {
            return res.status(404).json({ error: 'Course not found' });
        }

        if (req.user.role === 'PROFESSOR' && course.professorId !== req.user.id) {
            return res.status(403).json({ error: 'Access denied' });
        }

        // If user is STUDENT, they typically don't assign homework. 
        // But maybe self-assigned? For now, restrict to PROF.
        if (req.user.role !== 'PROFESSOR') {
            return res.status(403).json({ error: 'Only professors can assign homework' });
        }

        if (!course.studentId) {
            return res.status(400).json({ error: 'Course has no student assigned yet' });
        }

        const homework = await prisma.homework.create({
            data: {
                title,
                description,
                dueDate: dueDate ? new Date(dueDate) : null,
                courseId,
                studentId: course.studentId,
                completed: false
            }
        });

        // Notify student if Socket.io is available
        const io = req.app.get('io');
        if (io) {
            io.to(`user:${course.studentId}`).emit('homework:new', {
                homework,
                professorName: req.user.name,
                courseName: course.title
            });
        }

        res.status(201).json({ homework });
    } catch (error) {
        console.error('[Homework] Create error:', error);
        res.status(500).json({ error: 'Failed to create homework' });
    }
});

// GET /api/homeworks - List homeworks
router.get('/', authMiddleware, async (req, res) => {
    try {
        const { courseId } = req.query;
        const where = {};

        if (req.user.role === 'STUDENT') {
            where.studentId = req.user.id;
        } else if (req.user.role === 'PROFESSOR') {
            // Prof sees homeworks for their courses
            where.course = { professorId: req.user.id };
        } else if (req.user.role === 'PARENT') {
            // Parent sees homeworks for all their children
            const children = await prisma.user.findMany({
                where: { parentId: req.user.id, role: 'STUDENT' },
                select: { id: true },
            });
            const childIds = children.map(c => c.id);
            if (childIds.length === 0) return res.json({ homeworks: [] });
            where.studentId = { in: childIds };
        } else {
            return res.json({ homeworks: [] });
        }

        if (courseId) {
            where.courseId = courseId;
        }

        const homeworks = await prisma.homework.findMany({
            where,
            include: {
                course: { select: { title: true, code: true } },
                student: { select: { name: true } }
            },
            orderBy: { createdAt: 'desc' }
        });

        res.json({ homeworks });
    } catch (error) {
        console.error('[Homework] List error:', error);
        res.status(500).json({ error: 'Failed to list homeworks' });
    }
});

// PATCH /api/homeworks/:id - Update status (Student) or Details (Prof)
router.patch('/:id', authMiddleware, async (req, res) => {
    try {
        const { completed, title, description, dueDate } = req.body;

        const homework = await prisma.homework.findUnique({
            where: { id: req.params.id },
            include: { course: true }
        });

        if (!homework) return res.status(404).json({ error: 'Homework not found' });

        // Access check
        const isStudent = req.user.id === homework.studentId;
        const isProf = req.user.id === homework.course.professorId;

        if (!isStudent && !isProf) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const data = {};

        // Student can only toggle completion
        if (isStudent) {
            if (completed !== undefined) data.completed = completed;
        }

        // Prof can edit details
        if (isProf) {
            if (title !== undefined) data.title = title;
            if (description !== undefined) data.description = description;
            if (dueDate !== undefined) data.dueDate = dueDate ? new Date(dueDate) : null;
            if (completed !== undefined) data.completed = completed; // Prof can also mark/unmark
        }

        const updated = await prisma.homework.update({
            where: { id: req.params.id },
            data
        });

        res.json({ homework: updated });
    } catch (error) {
        console.error('[Homework] Update error:', error);
        res.status(500).json({ error: 'Failed to update homework' });
    }
});

// DELETE /api/homeworks/:id - Delete (Prof only)
router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        const homework = await prisma.homework.findUnique({
            where: { id: req.params.id },
            include: { course: true }
        });

        if (!homework) return res.status(404).json({ error: 'Homework not found' });

        if (req.user.id !== homework.course.professorId) {
            return res.status(403).json({ error: 'Access denied' });
        }

        await prisma.homework.delete({ where: { id: req.params.id } });
        res.json({ success: true });
    } catch (error) {
        console.error('[Homework] Delete error:', error);
        res.status(500).json({ error: 'Failed to delete homework' });
    }
});

module.exports = router;
