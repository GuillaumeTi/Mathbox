const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const authMiddleware = require('../middleware/auth');

const prisma = new PrismaClient();

// POST /api/homework - Create homework (Prof only)
router.post('/', authMiddleware, async (req, res) => {
    try {
        if (req.user.role !== 'PROF') {
            return res.status(403).json({ error: 'Only professors can assign homework' });
        }

        const { title, description, dueDate, courseId, studentId } = req.body;

        if (!title || !courseId || !studentId) {
            return res.status(400).json({ error: 'Title, courseId, and studentId are required' });
        }

        const homework = await prisma.homework.create({
            data: {
                title,
                description,
                dueDate: dueDate ? new Date(dueDate) : null,
                courseId,
                studentId,
            },
        });

        // Notify student
        const io = req.app.get('io');
        io.to(`user:${studentId}`).emit('homework:new', {
            homework,
            professorName: req.user.name,
        });

        res.status(201).json({ homework });
    } catch (error) {
        console.error('[Homework] Create error:', error);
        res.status(500).json({ error: 'Failed to create homework' });
    }
});

// GET /api/homework - List homework
router.get('/', authMiddleware, async (req, res) => {
    try {
        const { courseId } = req.query;
        const where = {};

        if (req.user.role === 'STUDENT') {
            where.studentId = req.user.id;
        } else {
            where.course = { professorId: req.user.id };
        }

        if (courseId) where.courseId = courseId;

        const homeworks = await prisma.homework.findMany({
            where,
            include: {
                course: { select: { title: true, subject: true, code: true } },
                student: { select: { name: true, email: true } },
            },
            orderBy: { createdAt: 'desc' },
        });

        res.json({ homeworks });
    } catch (error) {
        console.error('[Homework] List error:', error);
        res.status(500).json({ error: 'Failed to list homework' });
    }
});

// PUT /api/homework/:id/complete - Student marks homework as done
router.put('/:id/complete', authMiddleware, async (req, res) => {
    try {
        const homework = await prisma.homework.findFirst({
            where: { id: req.params.id, studentId: req.user.id },
        });

        if (!homework) {
            return res.status(404).json({ error: 'Homework not found' });
        }

        const updated = await prisma.homework.update({
            where: { id: req.params.id },
            data: { completed: true },
        });

        res.json({ homework: updated });
    } catch (error) {
        console.error('[Homework] Complete error:', error);
        res.status(500).json({ error: 'Failed to update homework' });
    }
});

// DELETE /api/homework/:id
router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        if (req.user.role !== 'PROF') {
            return res.status(403).json({ error: 'Only professors can delete homework' });
        }

        await prisma.homework.delete({ where: { id: req.params.id } });
        res.json({ success: true });
    } catch (error) {
        console.error('[Homework] Delete error:', error);
        res.status(500).json({ error: 'Failed to delete homework' });
    }
});

module.exports = router;
