const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const authMiddleware = require('../middleware/auth');
const archiver = require('archiver');
const path = require('path');
const fs = require('fs');
const { requireActiveTrial } = require('../middleware/trialGuard');

const prisma = new PrismaClient();
const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';

// PUT /api/storage/rename
router.put('/rename', authMiddleware, requireActiveTrial, async (req, res) => {
    try {
        const { id, type, newName } = req.body; // type: 'FILE' | 'FOLDER'

        if (!id || !newName) return res.status(400).json({ error: 'Missing parameters' });

        if (type === 'FOLDER') {
            const folder = await prisma.folder.findUnique({ where: { id } });
            if (!folder) return res.status(404).json({ error: 'Folder not found' });

            // Access check: Owner or Course Student?
            // Renaming usually for Owner (Prof) only?
            // Let's restrict to Owner for now to be safe.
            if (folder.ownerId !== req.user.id) return res.status(403).json({ error: 'Access denied' });

            await prisma.folder.update({
                where: { id },
                data: { name: newName }
            });
        } else if (type === 'FILE') {
            const doc = await prisma.document.findUnique({ where: { id } });
            if (!doc) return res.status(404).json({ error: 'Document not found' });

            if (doc.ownerId !== req.user.id) return res.status(403).json({ error: 'Access denied' });

            await prisma.document.update({
                where: { id },
                data: { title: newName }
            });
        } else {
            return res.status(400).json({ error: 'Invalid type' });
        }

        res.json({ success: true });
    } catch (error) {
        console.error('[Storage] Rename error:', error);
        res.status(500).json({ error: 'Failed to rename item' });
    }
});

// GET /api/storage/folder/:folderId/download
router.get('/folder/:folderId/download', authMiddleware, requireActiveTrial, async (req, res) => {
    try {
        const { folderId } = req.params;
        const folder = await prisma.folder.findUnique({ where: { id: folderId } });

        if (!folder) return res.status(404).json({ error: 'Folder not found' });

        // Access check
        if (folder.ownerId !== req.user.id) {
            // Check if student in course
            if (folder.courseId) {
                const course = await prisma.course.findUnique({ where: { id: folder.courseId } });
                if (!course || course.studentId !== req.user.id) {
                    return res.status(403).json({ error: 'Access denied' });
                }
            } else {
                return res.status(403).json({ error: 'Access denied' });
            }
        }

        // Fetch all documents recursively
        // For MVP, sticking to 1 level depth or flattened? 
        // Prompt says "recursively fetch all files".
        // Helper to collect files
        const filesToZip = [];

        async function collectFiles(currentFolderId, currentPathInZip) {
            // 1. Get Docs in this folder
            const docs = await prisma.document.findMany({ where: { folderId: currentFolderId } });
            for (const doc of docs) {
                // Resolve local path
                // Url is like /uploads/path/to/file
                const relativePath = doc.url.replace('/uploads/', '');
                const fullPath = path.join(UPLOAD_DIR, relativePath);

                if (fs.existsSync(fullPath)) {
                    filesToZip.push({
                        path: fullPath,
                        name: path.join(currentPathInZip, doc.title)
                    });
                }
            }

            // 2. Get Subfolders
            const subfolders = await prisma.folder.findMany({ where: { parentId: currentFolderId } });
            for (const sub of subfolders) {
                await collectFiles(sub.id, path.join(currentPathInZip, sub.name));
            }
        }

        await collectFiles(folderId, '');

        if (filesToZip.length === 0) {
            return res.status(400).json({ error: 'Folder is empty' });
        }

        // Stream Zip
        const archive = archiver('zip', {
            zlib: { level: 9 }
        });

        res.attachment(`${folder.name}_${new Date().toISOString().split('T')[0]}.zip`);

        archive.on('error', (err) => {
            console.error('[Storage] Zip error:', err);
            res.status(500).end();
        });

        archive.pipe(res);

        for (const file of filesToZip) {
            archive.file(file.path, { name: file.name });
        }

        await archive.finalize();

    } catch (error) {
        console.error('[Storage] Download Folder error:', error);
        if (!res.headersSent) res.status(500).json({ error: 'Failed to download folder' });
    }
});

// POST /api/storage/sync - Clean up DB records for missing files
router.post('/sync', authMiddleware, async (req, res) => {
    try {
        if (req.user.role !== 'PROFESSOR') {
            return res.status(403).json({ error: 'Access denied' });
        }

        const allDocs = await prisma.document.findMany();
        let removedCount = 0;

        for (const doc of allDocs) {
            // Check if file exists
            // url: /uploads/path/to/file
            const relativePath = doc.url.replace('/uploads/', '');
            const fullPath = path.join(UPLOAD_DIR, relativePath);

            if (!fs.existsSync(fullPath)) {
                console.log(`[Storage Sync] Removing orphan record: ${doc.title} (${doc.id})`);
                await prisma.document.delete({ where: { id: doc.id } });
                removedCount++;
            }
        }

        res.json({ success: true, removed: removedCount, total: allDocs.length });
    } catch (error) {
        console.error('[Storage] Sync error:', error);
        res.status(500).json({ error: 'Failed to synchronize storage' });
    }
});

module.exports = router;
