require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const { AccessToken, RoomServiceClient } = require('livekit-server-sdk');
const db = require('./db');
const authMiddleware = require('./middleware/auth');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend/dist')));

// File upload configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, '../uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueName = `${Date.now()}-${Math.random().toString(36).substring(7)}.webm`;
        cb(null, uniqueName);
    }
});
const upload = multer({ storage });

// Helper function to generate random code
function generateCode(length = 8) {
    return Math.random().toString(36).substring(2, 2 + length).toUpperCase();
}

// Socket.io connection tracking
const professorSockets = new Map(); // prof_id -> socket_id

io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    socket.on('register_professor', (profId) => {
        professorSockets.set(profId, socket.id);
        console.log(`Professor ${profId} registered with socket ${socket.id}`);
    });

    socket.on('disconnect', () => {
        // Remove from professor sockets
        for (const [profId, socketId] of professorSockets.entries()) {
            if (socketId === socket.id) {
                professorSockets.delete(profId);
                break;
            }
        }
        console.log('Client disconnected:', socket.id);
    });
});

// ============ AUTH ROUTES ============

app.post('/api/auth/register', async (req, res) => {
    try {
        const { email, password, role, name } = req.body;

        if (!['PROF', 'STUDENT'].includes(role)) {
            return res.status(400).json({ error: 'Invalid role' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const result = await db.query(
            'INSERT INTO users (email, password_hash, role, name) VALUES ($1, $2, $3, $4) RETURNING id, email, role, name',
            [email, hashedPassword, role, name]
        );

        const user = result.rows[0];
        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({ user, token });
    } catch (error) {
        console.error('Registration error:', error);
        if (error.code === '23505') {
            return res.status(400).json({ error: 'Email already exists' });
        }
        res.status(500).json({ error: 'Registration failed' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        const result = await db.query(
            'SELECT * FROM users WHERE email = $1',
            [email]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const user = result.rows[0];
        const validPassword = await bcrypt.compare(password, user.password_hash);

        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            user: {
                id: user.id,
                email: user.email,
                role: user.role,
                name: user.name
            },
            token
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

// ============ COURSE ROUTES ============

app.post('/api/courses', authMiddleware, async (req, res) => {
    try {
        if (req.user.role !== 'PROF') {
            return res.status(403).json({ error: 'Only professors can create courses' });
        }

        const { student_name, subject, level, schedule_day, schedule_time } = req.body;

        // Generate unique codes
        const joinCode = generateCode(8);
        const livekitRoomName = `room-${generateCode(12)}`;

        // Create course without student (student will join later with code)
        const result = await db.query(
            `INSERT INTO courses (prof_id, student_id, join_code, subject, level, schedule_day, schedule_time, livekit_room_name)
       VALUES ($1, NULL, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [req.user.id, joinCode, subject, level, schedule_day, schedule_time, livekitRoomName]
        );

        res.json({
            course: result.rows[0],
            join_code: joinCode
        });
    } catch (error) {
        console.error('Course creation error:', error);
        res.status(500).json({ error: 'Failed to create course' });
    }
});

app.post('/api/courses/join', authMiddleware, async (req, res) => {
    try {
        if (req.user.role !== 'STUDENT') {
            return res.status(403).json({ error: 'Only students can join courses' });
        }

        const { join_code } = req.body;

        const result = await db.query(
            'UPDATE courses SET student_id = $1 WHERE join_code = $2 AND student_id IS NULL RETURNING *',
            [req.user.id, join_code]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Invalid join code' });
        }

        res.json({ course: result.rows[0] });
    } catch (error) {
        console.error('Join course error:', error);
        res.status(500).json({ error: 'Failed to join course' });
    }
});

app.get('/api/courses', authMiddleware, async (req, res) => {
    try {
        let query;
        let params;

        if (req.user.role === 'PROF') {
            query = `
        SELECT c.*, u.name as student_name, u.email as student_email
        FROM courses c
        LEFT JOIN users u ON c.student_id = u.id
        WHERE c.prof_id = $1
        ORDER BY c.created_at DESC
      `;
            params = [req.user.id];
        } else {
            query = `
        SELECT c.*, u.name as prof_name, u.email as prof_email
        FROM courses c
        LEFT JOIN users u ON c.prof_id = u.id
        WHERE c.student_id = $1
        ORDER BY c.created_at DESC
      `;
            params = [req.user.id];
        }

        const result = await db.query(query, params);
        res.json({ courses: result.rows });
    } catch (error) {
        console.error('Get courses error:', error);
        res.status(500).json({ error: 'Failed to get courses' });
    }
});

app.delete('/api/courses/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;

        // Verify user owns this course (either as prof or student)
        const courseResult = await db.query(
            'SELECT * FROM courses WHERE id = $1 AND (prof_id = $2 OR student_id = $2)',
            [id, req.user.id]
        );

        if (courseResult.rows.length === 0) {
            return res.status(403).json({ error: 'Access denied' });
        }

        // Delete the course (cascades to summaries)
        await db.query('DELETE FROM courses WHERE id = $1', [id]);

        res.json({ success: true });
    } catch (error) {
        console.error('Delete course error:', error);
        res.status(500).json({ error: 'Failed to delete course' });
    }
});

// ============ LIVEKIT ROUTES ============

app.post('/api/livekit-token', authMiddleware, async (req, res) => {
    try {
        const { room_name } = req.body;

        // Verify user has access to this room
        const courseResult = await db.query(
            'SELECT * FROM courses WHERE livekit_room_name = $1 AND (prof_id = $2 OR student_id = $2)',
            [room_name, req.user.id]
        );

        if (courseResult.rows.length === 0) {
            return res.status(403).json({ error: 'Access denied to this room' });
        }

        const at = new AccessToken(
            process.env.LIVEKIT_API_KEY,
            process.env.LIVEKIT_SECRET,
            {
                identity: `${req.user.role}-${req.user.id}`,
                name: req.user.email,
            }
        );

        at.addGrant({
            room: room_name,
            roomJoin: true,
            canPublish: true,
            canSubscribe: true,
        });

        const token = at.toJwt();
        res.json({ token, url: process.env.LIVEKIT_URL });
    } catch (error) {
        console.error('LiveKit token error:', error);
        res.status(500).json({ error: 'Failed to generate token' });
    }
});

// Check room status (who's online)
app.get('/api/rooms/status', authMiddleware, async (req, res) => {
    try {
        if (req.user.role !== 'PROF') {
            return res.status(403).json({ error: 'Only professors can check room status' });
        }

        // Get all professor's courses
        const coursesResult = await db.query(
            'SELECT id, livekit_room_name, student_id FROM courses WHERE prof_id = $1',
            [req.user.id]
        );

        console.log(`Checking ${coursesResult.rows.length} rooms for professor ${req.user.id}`);

        // Initialize LiveKit RoomServiceClient
        const roomService = new RoomServiceClient(
            process.env.LIVEKIT_URL,
            process.env.LIVEKIT_API_KEY,
            process.env.LIVEKIT_SECRET
        );

        const roomStatuses = [];

        for (const course of coursesResult.rows) {
            try {
                console.log(`Checking room: ${course.livekit_room_name}`);

                // List participants in the room using SDK
                const participants = await roomService.listParticipants(course.livekit_room_name);

                console.log(`Found ${participants.length} participants in ${course.livekit_room_name}`);

                // Check if any student is in the room
                const hasStudent = participants.some(p =>
                    p.identity && p.identity.startsWith('STUDENT-')
                );

                console.log(`Has student: ${hasStudent}, Participants:`, participants.map(p => p.identity));

                roomStatuses.push({
                    course_id: course.id,
                    room_name: course.livekit_room_name,
                    student_id: course.student_id,
                    is_online: hasStudent,
                    participant_count: participants.length
                });
            } catch (error) {
                // Room doesn't exist or is empty - this is normal
                console.log(`Room ${course.livekit_room_name} not found or empty:`, error.message);
                roomStatuses.push({
                    course_id: course.id,
                    room_name: course.livekit_room_name,
                    student_id: course.student_id,
                    is_online: false,
                    participant_count: 0
                });
            }
        }

        console.log('Room statuses:', roomStatuses);
        res.json({ rooms: roomStatuses });
    } catch (error) {
        console.error('Room status check error:', error);
        res.status(500).json({ error: 'Failed to check room status' });
    }
});

// Helper function to generate room service token
async function generateRoomServiceToken() {
    const at = new AccessToken(
        process.env.LIVEKIT_API_KEY,
        process.env.LIVEKIT_SECRET,
        { ttl: '10m' }
    );
    at.addGrant({ roomAdmin: true });
    return at.toJwt();
}

// LiveKit webhook handler
app.post('/api/webhook/livekit', async (req, res) => {
    try {
        const event = req.body;
        console.log('LiveKit webhook received:', JSON.stringify(event, null, 2));

        const eventType = event.event;
        const roomName = event.room?.name;
        const participantIdentity = event.participant?.identity;

        console.log(`Event: ${eventType}, Room: ${roomName}, Participant: ${participantIdentity}`);

        if (roomName && participantIdentity) {
            // Find the course and professor
            const courseResult = await db.query(
                'SELECT prof_id, student_id FROM courses WHERE livekit_room_name = $1',
                [roomName]
            );

            if (courseResult.rows.length > 0) {
                const course = courseResult.rows[0];
                console.log(`Course found: prof_id=${course.prof_id}, student_id=${course.student_id}`);

                // Check if this is a student
                if (participantIdentity.startsWith('STUDENT-')) {
                    // Extract student ID from identity (format: STUDENT-5)
                    const studentIdFromIdentity = parseInt(participantIdentity.split('-')[1]);

                    // SECURITY CHECK: Verify this student is assigned to this course
                    if (course.student_id && studentIdFromIdentity === course.student_id) {
                        const profSocketId = professorSockets.get(course.prof_id);
                        console.log(`Professor socket ID: ${profSocketId}`);

                        if (profSocketId) {
                            let status = 'offline';

                            if (eventType === 'participant_joined') {
                                status = 'online';
                            } else if (eventType === 'participant_left') {
                                status = 'offline';
                            }

                            console.log(`Emitting student_online event with status: ${status}`);
                            io.to(profSocketId).emit('student_online', {
                                room_name: roomName,
                                student_id: course.student_id,
                                status: status
                            });
                            console.log(`Notified professor ${course.prof_id} about student ${status}`);
                        } else {
                            console.log(`Professor ${course.prof_id} not connected via socket`);
                        }
                    } else {
                        console.log(`SECURITY: Student ${studentIdFromIdentity} is not assigned to this course (expected: ${course.student_id})`);
                    }
                } else {
                    console.log(`Participant ${participantIdentity} is not a student`);
                }
            } else {
                console.log(`No course found for room ${roomName}`);
            }
        } else {
            console.log('Missing roomName or participantIdentity in webhook');
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).json({ error: 'Webhook processing failed' });
    }
});

// ============ AUDIO UPLOAD ROUTE ============

app.post('/api/upload-audio', authMiddleware, upload.single('audio'), async (req, res) => {
    try {
        if (req.user.role !== 'PROF') {
            return res.status(403).json({ error: 'Only professors can upload audio' });
        }

        const { course_id } = req.body;
        const filePath = req.file.filename;

        // Verify professor owns this course
        const courseResult = await db.query(
            'SELECT * FROM courses WHERE id = $1 AND prof_id = $2',
            [course_id, req.user.id]
        );

        if (courseResult.rows.length === 0) {
            return res.status(403).json({ error: 'Access denied' });
        }

        // Save summary record
        const result = await db.query(
            'INSERT INTO summaries (course_id, file_path) VALUES ($1, $2) RETURNING *',
            [course_id, filePath]
        );

        res.json({ summary: result.rows[0] });
    } catch (error) {
        console.error('Audio upload error:', error);
        res.status(500).json({ error: 'Failed to upload audio' });
    }
});

// ============ SERVE FRONTEND ============

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
