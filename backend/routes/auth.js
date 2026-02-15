const router = require('express').Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const authMiddleware = require('../middleware/auth');

const prisma = new PrismaClient();

// POST /api/auth/register
router.post('/register', async (req, res) => {
    try {
        const { email, password, name, role, subjects } = req.body;

        if (!email || !password || !name || !role) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        if (!['PROF', 'STUDENT'].includes(role)) {
            return res.status(400).json({ error: 'Role must be PROF or STUDENT' });
        }

        const existing = await prisma.user.findUnique({ where: { email } });
        if (existing) {
            return res.status(409).json({ error: 'Email already registered' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const user = await prisma.user.create({
            data: {
                email,
                password: hashedPassword,
                name,
                role,
                subjects: subjects || [],
                credits: role === 'PROF' ? 5 : 0, // 5 free AI credits for profs
            },
        });

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
        });
    } catch (error) {
        console.error('[Auth] Register error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password required' });
        }

        const user = await prisma.user.findUnique({ where: { email } });
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
                name: user.name,
                role: user.role,
                subjects: user.subjects,
                credits: user.credits,
                subscriptionStatus: user.subscriptionStatus,
            },
            token,
        });
    } catch (error) {
        console.error('[Auth] Login error:', error);
        res.status(500).json({ error: 'Login failed' });
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
                name: true,
                role: true,
                subjects: true,
                credits: true,
                subscriptionStatus: true,
                avatarUrl: true,
                createdAt: true,
            },
        });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({ user });
    } catch (error) {
        console.error('[Auth] Me error:', error);
        res.status(500).json({ error: 'Failed to fetch user' });
    }
});

// PUT /api/auth/profile
router.put('/profile', authMiddleware, async (req, res) => {
    try {
        const { name, subjects, avatarUrl } = req.body;
        const data = {};
        if (name) data.name = name;
        if (subjects) data.subjects = subjects;
        if (avatarUrl) data.avatarUrl = avatarUrl;

        const user = await prisma.user.update({
            where: { id: req.user.id },
            data,
            select: {
                id: true, email: true, name: true, role: true,
                subjects: true, credits: true, avatarUrl: true,
            },
        });

        res.json({ user });
    } catch (error) {
        console.error('[Auth] Profile update error:', error);
        res.status(500).json({ error: 'Failed to update profile' });
    }
});

module.exports = router;
