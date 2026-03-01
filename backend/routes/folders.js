const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const authMiddleware = require('../middleware/auth');

const prisma = new PrismaClient();

// GET /api/folders - List user's folders (Virtual File System)
router.get('/', authMiddleware, async (req, res) => {
    try {
        const { parentId } = req.query;
        const user = req.user;

        // --- TEACHER VIEW ---
        if (user.role === 'PROF') {
            // 1. Root: Show "Private" and "Students"
            if (!parentId) {
                return res.json({
                    folders: [
                        { id: 'private', name: 'Private', isVirtual: true },
                        { id: 'students', name: 'Students', isVirtual: true }
                    ]
                });
            }

            // 2. Private: Show folders owned by Prof (no course set)
            if (parentId === 'private') {
                const folders = await prisma.folder.findMany({
                    where: { ownerId: user.id, parentId: null, courseId: null },
                    include: { _count: { select: { children: true, documents: true } } },
                    orderBy: { name: 'asc' }
                });
                return res.json({ folders });
            }

            // 3. Students: List unique students who have courses with this prof
            if (parentId === 'students') {
                // Fetch all courses to find students
                const courses = await prisma.course.findMany({
                    where: { professorId: user.id, studentId: { not: null } },
                    include: { student: true }
                });

                // Unique students
                const studentsMap = new Map();
                courses.forEach(c => {
                    if (c.student && !studentsMap.has(c.student.id)) {
                        studentsMap.set(c.student.id, c.student);
                    }
                });

                const studentFolders = Array.from(studentsMap.values()).map(s => ({
                    id: `virtual_student_${s.id}`,
                    name: s.name,
                    isVirtual: true,
                    type: 'STUDENT_ROOT',
                    studentId: s.id
                }));

                return res.json({ folders: studentFolders });
            }

            // 4. Inside a "Student" folder: List Shared Folders (linked to Courses)
            if (parentId.startsWith('virtual_student_')) {
                const studentId = parentId.replace('virtual_student_', '');

                // Find courses for this student & prof
                const courses = await prisma.course.findMany({
                    where: { professorId: user.id, studentId },
                });

                // Find or Lazily Create root folder for each course
                const folders = [];
                for (const course of courses) {
                    let folder = await prisma.folder.findFirst({
                        where: { courseId: course.id, parentId: null }
                    });

                    if (!folder) {
                        // Lazy Create
                        folder = await prisma.folder.create({
                            data: {
                                name: course.title, // Initial name, but could be anything
                                path: `/courses/${course.id}`,
                                ownerId: user.id,
                                courseId: course.id
                            }
                        });
                    }
                    // Force display name for clarity if needed, but DB name is fine
                    folders.push(folder);
                }

                return res.json({ folders });
            }
        }

        // --- STUDENT VIEW ---
        if (user.role === 'STUDENT') {
            // 1. Root: List Course Folders (Aliased)
            if (!parentId) {
                // Find courses where user is student
                const courses = await prisma.course.findMany({
                    where: { studentId: user.id },
                    include: { professor: true }
                });

                const folders = [];
                for (const course of courses) {
                    let folder = await prisma.folder.findFirst({
                        where: { courseId: course.id, parentId: null }
                    });
                    // If folder doesn't exist, it means Prof hasn't created it or shared anything yet.
                    // We could show nothing, or show empty placeholder.
                    // The prompt implies strict "Course_Subject_ProfName" view.

                    // Let's create it if missing so Student sees the structure?
                    // Usually Prof initiates, but let's be safe.
                    if (!folder) {
                        folder = await prisma.folder.create({
                            data: {
                                name: course.title,
                                path: `/courses/${course.id}`,
                                ownerId: course.professorId, // Owner is Prof
                                courseId: course.id
                            }
                        });
                    }

                    // ALIASING LOGIC
                    // "Course_{Subject}_{ProfName}"
                    const alias = `Course_${course.subject || 'General'}_${course.professor.name}`;

                    folders.push({
                        ...folder,
                        name: alias // Override name for display
                    });
                }
                return res.json({ folders });
            }
        }

        // --- STANDARD NAVIGATION (Children) ---
        // For Teacher navigating deeper into Private or Shared, OR Student navigating deeper
        // We must verify access.

        let folderQuery = { parentId };

        // If Root fetch but no special logic (shouldn't flow here for root, but just in case)
        if (!parentId) {
            folderQuery = { parentId: null, ownerId: user.id, courseId: null }; // Private root fallback
        }

        const folders = await prisma.folder.findMany({
            where: folderQuery,
            include: { _count: { select: { children: true, documents: true } } },
            orderBy: { createdAt: 'desc' }
        });

        // Access Check filter
        // If user is Owner, OK.
        // If user is Student, check if folder -> course -> studentId == user.id
        // We can't easily join deep in filter, so we filter in JS or rely on courseId check.

        const accessibleFolders = [];
        for (const f of folders) {
            if (f.ownerId === user.id) {
                accessibleFolders.push(f); // Owns it
            } else if (f.courseId) {
                // Check if user is student OR professor of that course
                const course = await prisma.course.findUnique({ where: { id: f.courseId } });
                if (course && (course.studentId === user.id || course.professorId === user.id)) {
                    accessibleFolders.push(f);
                }
            }
        }

        res.json({ folders: accessibleFolders });
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

        // Prevent creating folders in virtual roots directly via API if not careful
        // Front-end should pass actual IDs. 
        // If parentId is "private", treat as null for private root.

        let actualParentId = parentId;
        let courseId = null;
        let ownerId = req.user.id;

        if (parentId === 'private') {
            actualParentId = null;
        } else if (parentId && parentId.startsWith('virtual_')) {
            return res.status(403).json({ error: 'Cannot create folder in virtual root' });
        } else if (parentId) {
            // Fetch parent to inherit courseId
            const parent = await prisma.folder.findUnique({ where: { id: parentId } });
            if (!parent) return res.status(404).json({ error: 'Parent not found' });

            // Check permission
            if (parent.ownerId !== req.user.id) {
                // If not owner, maybe student?
                // Students usually don't create root folders, but subfolders?
                // Let's implement restrictive: Only Owner (Prof) creates folders for now, or Student if allowed.
                // For now, allow if course linked.
                const course = parent.courseId ? await prisma.course.findUnique({ where: { id: parent.courseId } }) : null;
                if (!course || course.studentId !== req.user.id) {
                    return res.status(403).json({ error: 'Access denied' });
                }
            }
            courseId = parent.courseId;
            // If student creates, owner is still Prof? Or Student?
            // Ideally Shared Folders are owned by Prof.
            // But if specific Student creates, maybe owner=Student?
            // Let's keep owner = req.user.id.
            // But access rights determined by courseId.
        }

        const folder = await prisma.folder.create({
            data: {
                name,
                path: name, // Simplified path
                ownerId,
                parentId: actualParentId,
                courseId
            },
        });

        res.status(201).json({ folder });
    } catch (error) {
        console.error('[Folders] Create error:', error);
        res.status(500).json({ error: 'Failed to create folder' });
    }
});

const { deleteFile } = require('../services/storageService');

// ... (existing code)

// DELETE /api/folders/:id
router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        const folderId = req.params.id;

        // 1. Fetch folder with ownership check
        const folder = await prisma.folder.findUnique({
            where: { id: folderId },
            include: { course: true }
        });

        if (!folder) return res.status(404).json({ error: 'Folder not found' });

        // 2. Access Check
        let canDelete = false;
        if (folder.ownerId === req.user.id) canDelete = true;
        // Allow deletion if it's a course folder and user is the student (rare, usually readonly?)
        // Let's stick to Owner only for deletion to be safe, unless explicit logic.
        // Provided code allowed course student to delete? 
        // "if (folder.course && folder.course.studentId === req.user.id) canDelete = true;"
        // We'll keep that.
        else if (folder.course && folder.course.studentId === req.user.id) canDelete = true;

        if (!canDelete) return res.status(403).json({ error: 'Access denied' });

        // 3. Recursive Deletion Strategy
        // We need to delete all documents in this folder AND subfolders physically.

        // Helper to get all descendant folder IDs
        async function getDescendantIds(rootId) {
            const children = await prisma.folder.findMany({ where: { parentId: rootId } });
            let ids = [rootId];
            for (const child of children) {
                const subIds = await getDescendantIds(child.id);
                ids = [...ids, ...subIds];
            }
            return ids;
        }

        const allFolderIds = await getDescendantIds(folderId);

        // 4. Find all documents in these folders
        const docs = await prisma.document.findMany({
            where: { folderId: { in: allFolderIds } }
        });

        // 5. Delete physical files
        for (const doc of docs) {
            try {
                // Determine relative path for storageService
                const relativePath = doc.url.replace('/uploads/', '');
                await deleteFile(relativePath);
            } catch (err) {
                console.error(`Failed to delete physical file for doc ${doc.id}:`, err);
                // Continue deletion of DB records even if file missing
            }
        }

        // 6. Delete Documents in DB
        await prisma.document.deleteMany({
            where: { folderId: { in: allFolderIds } }
        });

        // 7. Delete Folder (Prisma Cascade will handle subfolders)
        await prisma.folder.delete({ where: { id: folderId } });

        res.json({ success: true });
    } catch (error) {
        console.error('[Folders] Delete error:', error);
        res.status(500).json({ error: 'Failed to delete folder' });
    }
});

module.exports = router;
