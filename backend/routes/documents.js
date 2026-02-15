const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const multer = require('multer');
const path = require('path');
const authMiddleware = require('../middleware/auth');
const { uploadFile, getSignedUrl, deleteFile } = require('../services/storageService');

const prisma = new PrismaClient();

// Multer config (memory storage for processing before local save)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
    fileFilter: (req, file, cb) => {
        const allowed = ['.pdf', '.jpg', '.jpeg', '.png', '.gif', '.doc', '.docx', '.txt', '.webm', '.mp4'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowed.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error('File type not allowed'));
        }
    },
});

// POST /api/documents/upload
router.post('/upload', authMiddleware, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const { courseId, sessionId, folderId, type } = req.body;
        const timestamp = Date.now();
        const ext = path.extname(req.file.originalname);
        const safeName = `${timestamp}_${req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const targetPath = `${req.user.id}/${courseId || 'general'}/${safeName}`;

        const result = await uploadFile(req.file.buffer, targetPath, req.file.mimetype);

        const doc = await prisma.document.create({
            data: {
                title: req.file.originalname,
                type: type || 'OTHER',
                url: result.url,
                size: req.file.size,
                mimeType: req.file.mimetype,
                ownerId: req.user.id,
                courseId: courseId || null,
                sessionId: sessionId || null,
                folderId: folderId || null,
            },
        });

        res.status(201).json({ document: doc });
    } catch (error) {
        console.error('[Documents] Upload error:', error);
        res.status(500).json({ error: 'Failed to upload document' });
    }
});

// GET /api/documents - List documents
router.get('/', authMiddleware, async (req, res) => {
    try {
        const { courseId, sessionId, folderId, type } = req.query;
        const where = { ownerId: req.user.id };

        if (courseId) where.courseId = courseId;
        if (sessionId) where.sessionId = sessionId;
        if (folderId) where.folderId = folderId;
        if (type) where.type = type;

        // Also include documents in courses the user is part of
        const documents = await prisma.document.findMany({
            where: {
                OR: [
                    where,
                    {
                        course: {
                            OR: [
                                { professorId: req.user.id },
                                { studentId: req.user.id },
                            ],
                        },
                        ...(courseId && { courseId }),
                        ...(sessionId && { sessionId }),
                        ...(type && { type }),
                    },
                ],
            },
            orderBy: { createdAt: 'desc' },
            include: {
                owner: { select: { name: true, role: true } },
            },
        });

        res.json({ documents });
    } catch (error) {
        console.error('[Documents] List error:', error);
        res.status(500).json({ error: 'Failed to list documents' });
    }
});

// GET /api/documents/:id/download
router.get('/:id/download', authMiddleware, async (req, res) => {
    try {
        const doc = await prisma.document.findUnique({
            where: { id: req.params.id },
            include: { course: true },
        });

        if (!doc) {
            return res.status(404).json({ error: 'Document not found' });
        }

        // Check access
        const hasAccess =
            doc.ownerId === req.user.id ||
            doc.course?.professorId === req.user.id ||
            doc.course?.studentId === req.user.id;

        if (!hasAccess) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const urlResult = await getSignedUrl(doc.url.replace('/uploads/', ''));
        res.json({ url: urlResult.url });
    } catch (error) {
        console.error('[Documents] Download error:', error);
        res.status(500).json({ error: 'Failed to get download URL' });
    }
});

// DELETE /api/documents/:id
router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        const doc = await prisma.document.findFirst({
            where: { id: req.params.id, ownerId: req.user.id },
        });

        if (!doc) {
            return res.status(404).json({ error: 'Document not found or access denied' });
        }

        await deleteFile(doc.url.replace('/uploads/', ''));
        await prisma.document.delete({ where: { id: req.params.id } });

        res.json({ success: true });
    } catch (error) {
        console.error('[Documents] Delete error:', error);
        res.status(500).json({ error: 'Failed to delete document' });
    }
});

module.exports = router;
