const router = require('express').Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const authMiddleware = require('../middleware/auth');
const { getTrialStatus } = require('../middleware/trialGuard');

const prisma = new PrismaClient();

// Generate a student username: FirstName + 4 random digits
function generateUsername(firstName) {
    const clean = firstName.trim().replace(/\s+/g, '').toLowerCase();
    const digits = Math.floor(1000 + Math.random() * 9000);
    return `${clean}${digits}`;
}

// POST /api/auth/register
// Accepts PROFESSOR and PARENT roles. Students are created by parents.
router.post('/register', async (req, res) => {
    try {
        const { email, password, name, role, subjects, childName, inviteCode } = req.body;

        if (!email || !password || !name || !role) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        if (!['PROFESSOR', 'PARENT'].includes(role)) {
            return res.status(400).json({ error: 'Role must be PROFESSOR or PARENT' });
        }

        const existing = await prisma.user.findUnique({ where: { email } });
        if (existing) {
            return res.status(409).json({ error: 'Email already registered' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        // Create the parent/professor user
        const trialStartDate = role === 'PROFESSOR' ? new Date() : undefined;
        const trialEndDate = role === 'PROFESSOR' ? new Date(Date.now() + 15 * 24 * 60 * 60 * 1000) : undefined;

        const user = await prisma.user.create({
            data: {
                email,
                password: hashedPassword,
                name,
                role,
                subjects: subjects || [],
                credits: role === 'PROFESSOR' ? 5 : 0,
                subscriptionStatus: role === 'PROFESSOR' ? 'TRIAL' : undefined,
                trialStartDate,
                trialEndDate,
            },
        });

        let childUser = null;
        let magicLinkUrl = null;

        // If PARENT, optionally create a child account
        if (role === 'PARENT' && childName) {
            let username;
            let usernameExists = true;
            while (usernameExists) {
                username = generateUsername(childName);
                usernameExists = await prisma.user.findUnique({ where: { username } });
            }

            // Temporary password (will be set by student on first magic-link login)
            const tempPassword = await bcrypt.hash(require('crypto').randomBytes(32).toString('hex'), 10);

            childUser = await prisma.user.create({
                data: {
                    username,
                    password: tempPassword,
                    name: childName,
                    role: 'STUDENT',
                    parentId: user.id,
                    needsPasswordSetup: true,
                },
            });

            // Generate magic link token
            const magicToken = jwt.sign(
                { studentId: childUser.id, purpose: 'magic-login' },
                process.env.JWT_SECRET,
                { expiresIn: '30d' }
            );
            magicLinkUrl = `/magic-login/${magicToken}`;

            // If an invite code was provided, auto-enroll the child
            if (inviteCode) {
                const course = await prisma.course.findUnique({ where: { code: inviteCode } });
                if (course && !course.studentId) {
                    await prisma.course.update({
                        where: { id: course.id },
                        data: { studentId: childUser.id },
                    });
                }
            }
        }

        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role, name: user.name },
            process.env.JWT_SECRET,
            { expiresIn: '30d' }
        );

        res.status(201).json({
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role,
                subjects: user.subjects,
                credits: user.credits,
            },
            token,
            child: childUser ? {
                id: childUser.id,
                name: childUser.name,
                username: childUser.username,
                magicLink: magicLinkUrl,
            } : null,
        });
    } catch (error) {
        console.error('[Auth] Register error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// POST /api/auth/login
// Supports email OR username login
router.post('/login', async (req, res) => {
    try {
        const { email, password, username } = req.body;

        if ((!email && !username) || !password) {
            return res.status(400).json({ error: 'Email/username and password required' });
        }

        let user;
        if (username) {
            user = await prisma.user.findUnique({ where: { username } });
        } else {
            user = await prisma.user.findUnique({ where: { email } });
        }

        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role, name: user.name },
            process.env.JWT_SECRET,
            { expiresIn: '30d' }
        );

        res.json({
            user: {
                id: user.id,
                email: user.email,
                username: user.username,
                name: user.name,
                role: user.role,
                subjects: user.subjects,
                credits: user.credits,
                subscriptionStatus: user.subscriptionStatus,
                needsPasswordSetup: user.needsPasswordSetup,
            },
            token,
        });
    } catch (error) {
        console.error('[Auth] Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

// POST /api/auth/magic-login
// Validates a magic link JWT and returns an auth token
router.post('/magic-login', async (req, res) => {
    try {
        const { token: magicToken } = req.body;
        if (!magicToken) return res.status(400).json({ error: 'Token required' });

        const decoded = jwt.verify(magicToken, process.env.JWT_SECRET);
        if (decoded.purpose !== 'magic-login') {
            return res.status(400).json({ error: 'Invalid token purpose' });
        }

        const user = await prisma.user.findUnique({ where: { id: decoded.studentId } });
        if (!user) return res.status(404).json({ error: 'User not found' });

        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role, name: user.name },
            process.env.JWT_SECRET,
            { expiresIn: '30d' }
        );

        res.json({
            user: {
                id: user.id,
                email: user.email,
                username: user.username,
                name: user.name,
                role: user.role,
                needsPasswordSetup: user.needsPasswordSetup,
            },
            token,
        });
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Magic link expired' });
        }
        console.error('[Auth] Magic login error:', error);
        res.status(500).json({ error: 'Magic login failed' });
    }
});

// POST /api/auth/set-password
// For students on first magic-link login
router.post('/set-password', authMiddleware, async (req, res) => {
    try {
        const { password } = req.body;
        if (!password || password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const user = await prisma.user.update({
            where: { id: req.user.id },
            data: { password: hashedPassword, needsPasswordSetup: false },
            select: { id: true, email: true, username: true, name: true, role: true, needsPasswordSetup: true },
        });

        res.json({ user });
    } catch (error) {
        console.error('[Auth] Set password error:', error);
        res.status(500).json({ error: 'Failed to set password' });
    }
});

// POST /api/auth/add-child
// For existing parents to add another child
router.post('/add-child', authMiddleware, async (req, res) => {
    try {
        if (req.user.role !== 'PARENT') {
            return res.status(403).json({ error: 'Only parents can add children' });
        }

        const { childName } = req.body;
        if (!childName) return res.status(400).json({ error: 'Child name required' });

        let username;
        let usernameExists = true;
        while (usernameExists) {
            username = generateUsername(childName);
            usernameExists = await prisma.user.findUnique({ where: { username } });
        }

        const tempPassword = await bcrypt.hash(require('crypto').randomBytes(32).toString('hex'), 10);

        const child = await prisma.user.create({
            data: {
                username,
                password: tempPassword,
                name: childName,
                role: 'STUDENT',
                parentId: req.user.id,
                needsPasswordSetup: true,
            },
        });

        const magicToken = jwt.sign(
            { studentId: child.id, purpose: 'magic-login' },
            process.env.JWT_SECRET,
            { expiresIn: '30d' }
        );

        res.status(201).json({
            child: {
                id: child.id,
                name: child.name,
                username: child.username,
                magicLink: `/magic-login/${magicToken}`,
            },
        });
    } catch (error) {
        console.error('[Auth] Add child error:', error);
        res.status(500).json({ error: 'Failed to add child' });
    }
});

// POST /api/auth/magic-link/:childId
// Regenerate a magic link for a child (Parent only)
router.post('/magic-link/:childId', authMiddleware, async (req, res) => {
    try {
        if (req.user.role !== 'PARENT') {
            return res.status(403).json({ error: 'Only parents can generate magic links' });
        }

        const child = await prisma.user.findFirst({
            where: { id: req.params.childId, parentId: req.user.id, role: 'STUDENT' },
        });
        if (!child) return res.status(404).json({ error: 'Child not found' });

        // Force password setup on the child so the magic link acts as a reset link
        await prisma.user.update({
            where: { id: child.id },
            data: { needsPasswordSetup: true },
        });

        const magicToken = jwt.sign(
            { studentId: child.id, purpose: 'magic-login' },
            process.env.JWT_SECRET,
            { expiresIn: '30d' }
        );

        res.json({
            magicLink: `/magic-login/${magicToken}`,
            needsPasswordSetup: true,
        });
    } catch (error) {
        console.error('[Auth] Magic link generation error:', error);
        res.status(500).json({ error: 'Failed to generate magic link' });
    }
});

// GET /api/auth/me
router.get('/me', authMiddleware, async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: {
                id: true,
                email: true,
                username: true,
                name: true,
                role: true,
                subjects: true,
                credits: true,
                subscriptionStatus: true,
                avatarUrl: true,
                street: true,
                city: true,
                zipCode: true,
                parentId: true,
                needsPasswordSetup: true,
                trialStartDate: true,
                trialEndDate: true,
                weeklyVideoMinutes: true,
                createdAt: true,
                children: {
                    select: {
                        id: true,
                        name: true,
                        username: true,
                        needsPasswordSetup: true,
                        coursesAsStudent: {
                            select: {
                                id: true,
                                title: true,
                                code: true,
                                subject: true,
                                dayOfWeek: true,
                                startTime: true,
                                recurrence: true,
                                duration: true,
                                professor: { select: { name: true } },
                            },
                        },
                    },
                },
            },
        });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Compute trial status for professors
        let trialInfo = null;
        if (user.role === 'PROFESSOR') {
            trialInfo = await getTrialStatus(user);
        }

        res.json({ user, trial: trialInfo });
    } catch (error) {
        console.error('[Auth] Me error:', error);
        res.status(500).json({ error: 'Failed to fetch user' });
    }
});

// PUT /api/auth/profile
router.put('/profile', authMiddleware, async (req, res) => {
    try {
        const { name, subjects, avatarUrl, street, city, zipCode } = req.body;
        const data = {};
        if (name) data.name = name;
        if (subjects) data.subjects = subjects;
        if (avatarUrl) data.avatarUrl = avatarUrl;
        if (street !== undefined) data.street = street;
        if (city !== undefined) data.city = city;
        if (zipCode !== undefined) data.zipCode = zipCode;

        const user = await prisma.user.update({
            where: { id: req.user.id },
            data,
            select: {
                id: true, email: true, username: true, name: true, role: true,
                subjects: true, credits: true, avatarUrl: true,
                street: true, city: true, zipCode: true,
            },
        });

        res.json({ user });
    } catch (error) {
        console.error('[Auth] Profile update error:', error);
        res.status(500).json({ error: 'Failed to update profile' });
    }
});

module.exports = router;
