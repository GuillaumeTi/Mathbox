const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const authMiddleware = require('../middleware/auth');

const prisma = new PrismaClient();

// GET /api/invite/:code - Get course info for invite page
router.get('/:code', async (req, res) => {
    try {
        const course = await prisma.course.findUnique({
            where: { code: req.params.code },
            select: {
                id: true,
                code: true,
                title: true,
                subject: true,
                level: true,
                professor: { select: { name: true } },
            },
        });

        if (!course) {
            return res.status(404).json({ error: 'Course not found' });
        }

        res.json({ course });
    } catch (error) {
        console.error('[Invite] Fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch course info' });
    }
});

// POST /api/invite/:code/enroll - Enroll a child in the course
router.post('/:code/enroll', authMiddleware, async (req, res) => {
    try {
        if (req.user.role !== 'PARENT') {
            return res.status(403).json({ error: 'Only parents can enroll children' });
        }

        const { childId } = req.body;
        if (!childId) return res.status(400).json({ error: 'Child ID required' });

        // Verify the child belongs to this parent
        const child = await prisma.user.findFirst({
            where: { id: childId, parentId: req.user.id, role: 'STUDENT' },
        });
        if (!child) {
            return res.status(403).json({ error: 'Child not found or not yours' });
        }

        const course = await prisma.course.findUnique({ where: { code: req.params.code } });
        if (!course) return res.status(404).json({ error: 'Course not found' });

        if (course.studentId) {
            return res.status(409).json({ error: 'Course already has a student enrolled' });
        }

        const updated = await prisma.course.update({
            where: { id: course.id },
            data: { studentId: child.id },
            include: { professor: { select: { name: true } } },
        });

        res.json({ course: updated });
    } catch (error) {
        console.error('[Invite] Enroll error:', error);
        res.status(500).json({ error: 'Failed to enroll' });
    }
});

module.exports = router;
