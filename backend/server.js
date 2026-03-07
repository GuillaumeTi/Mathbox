require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Socket.io
const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] }
});

// Make io accessible to routes
app.set('io', io);

// Middleware
app.use(cors());

// Stripe webhook needs raw body BEFORE express.json() parses it
const express_module = require('express');
app.use('/api/webhooks/stripe', express_module.raw({ type: 'application/json' }));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static files: uploads
// Static files: uploads
const uploadPath = process.env.UPLOAD_DIR || 'uploads';
const absoluteUploadPath = path.isAbsolute(uploadPath)
    ? uploadPath
    : path.join(__dirname, uploadPath);

console.log(`[Server] Serving uploads from: ${absoluteUploadPath}`);
app.use('/uploads', express.static(absoluteUploadPath));

// ============ ROUTES ============
app.use('/api/auth', require('./routes/auth'));
app.use('/api/courses', require('./routes/courses'));
app.use('/api/room', require('./routes/room'));
app.use('/api/documents', require('./routes/documents'));
app.use('/api/folders', require('./routes/folders'));
app.use('/api/homeworks', require('./routes/homeworks'));
app.use('/api/webhooks', require('./routes/webhooks'));
app.use('/api/shop', require('./routes/shop'));
app.use('/api/storage', require('./routes/storage'));
app.use('/api/invite', require('./routes/invite'));
app.use('/api/invoices', require('./routes/invoices'));
app.use('/api/users', require('./routes/users'));
app.use('/api/stripe', require('./routes/stripe'));

// ============ SOCKET.IO ============
io.on('connection', (socket) => {
    console.log(`[Socket.io] Client connected: ${socket.id}`);

    // Join room for real-time course status updates
    socket.on('subscribe:courses', (userId) => {
        socket.join(`user:${userId}`);
        console.log(`[Socket.io] User ${userId} subscribed to updates`);
    });

    // Join specific course room
    socket.on('join:course', (courseId) => {
        socket.join(`course:${courseId}`);
    });

    socket.on('disconnect', () => {
        console.log(`[Socket.io] Client disconnected: ${socket.id}`);
    });
});

// ============ SERVE FRONTEND ============
const frontendDist = path.join(__dirname, '../frontend/dist');
app.use(express.static(frontendDist));
app.get('*', (req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
});

// ============ START ============
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`[MathBox] Server running on port ${PORT}`);
    console.log(`[MathBox] LiveKit URL: ${process.env.LIVEKIT_URL}`);
});
