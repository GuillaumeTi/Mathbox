const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const authMiddleware = require('../middleware/auth');

const prisma = new PrismaClient();

// GET /api/folders - List user's folders
router.get('/', authMiddleware, async (req, res) => {
    try {
        const { parentId } = req.query;

        const folders = await prisma.folder.findMany({
            where: {
                ownerId: req.user.id,
                parentId: parentId || null,
            },
            include: {
                _count: { select: { children: true, documents: true } },
            },
            orderBy: { createdAt: 'desc' },
        });

        res.json({ folders });
    } catch (error) {
        console.error('[Folders] List error:', error);
        res.status(500).json({ error: 'Failed to list folders' });
    }
});

// POST /api/folders - Create a folder
router.post('/', authMiddleware, async (req, res) => {
    try {
        const { name, parentId } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Folder name required' });
        }

        let parentPath = '';
        if (parentId) {
            const parent = await prisma.folder.findUnique({ where: { id: parentId } });
            if (!parent || parent.ownerId !== req.user.id) {
                return res.status(404).json({ error: 'Parent folder not found' });
            }
            parentPath = parent.path;
        }

        const folder = await prisma.folder.create({
            data: {
                name,
                path: `${parentPath}/${name}`,
                ownerId: req.user.id,
                parentId: parentId || null,
            },
        });

        res.status(201).json({ folder });
    } catch (error) {
        console.error('[Folders] Create error:', error);
        res.status(500).json({ error: 'Failed to create folder' });
    }
});

// DELETE /api/folders/:id
router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        const folder = await prisma.folder.findFirst({
            where: { id: req.params.id, ownerId: req.user.id },
        });

        if (!folder) {
            return res.status(404).json({ error: 'Folder not found' });
        }

        await prisma.folder.delete({ where: { id: req.params.id } });
        res.json({ success: true });
    } catch (error) {
        console.error('[Folders] Delete error:', error);
        res.status(500).json({ error: 'Failed to delete folder' });
    }
});

module.exports = router;
