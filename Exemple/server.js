const express = require('express');
const cors = require('cors');
const { AccessToken } = require('livekit-server-sdk');
const { createProxyMiddleware } = require('http-proxy-middleware');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// WebSocket proxy for LiveKit
// This allows HTTPS clients (LocalTunnel) to connect to ws:// LiveKit server
// The proxy translates wss:// requests to ws:// for the LiveKit server
const livekitWsUrl = process.env.LIVEKIT_URL || 'ws://localhost:7880';
const livekitProxy = createProxyMiddleware({
    target: livekitWsUrl.replace('ws://', 'http://').replace('wss://', 'https://'),
    changeOrigin: true,
    ws: true,
    pathRewrite: {
        '^/livekit-ws': ''
    },
    logLevel: 'info',
    onError: (err, req, res) => {
        console.error('Proxy error:', err);
        res.writeHead(500, {
            'Content-Type': 'text/plain'
        });
        res.end('Proxy error: ' + err.message);
    }
});

app.use('/livekit-ws', livekitProxy);

/**
 * GET /get-token
 * Generates a LiveKit JWT token for participants
 * 
 * Query Parameters:
 * - roomName: The room identifier
 * - participantName: Display name for the participant
 * - role: Either 'teacher' or 'student'
 */
app.get('/get-token', async (req, res) => {
    const { roomName, participantName, role } = req.query;

    // Validate required parameters
    if (!roomName || !participantName || !role) {
        return res.status(400).json({
            error: 'Missing required parameters: roomName, participantName, role'
        });
    }

    // Validate role
    if (role !== 'teacher' && role !== 'student') {
        return res.status(400).json({
            error: 'Role must be either "teacher" or "student"'
        });
    }

    // Get LiveKit credentials from environment
    // IMPORTANT: If .env is not configured, hardcode these values for testing:
    // const apiKey = 'your_api_key_here';
    // const apiSecret = 'your_api_secret_here';
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;

    if (!apiKey || !apiSecret) {
        return res.status(500).json({
            error: 'Server configuration error: LIVEKIT_API_KEY and LIVEKIT_API_SECRET must be set in .env file'
        });
    }

    try {
        // Create access token
        const at = new AccessToken(apiKey, apiSecret, {
            identity: participantName,
            name: participantName,
        });

        // Set token to expire in 24 hours
        at.ttl = '24h';

        // Grant permissions based on role
        const grant = {
            room: roomName,
            roomJoin: true,
            canPublish: true,
            canSubscribe: true,
            canPublishData: true,
        };

        // Note: canPublishSources removed - causes TypeError in livekit-server-sdk v2.0
        // All participants can publish by default with canPublish: true

        at.addGrant(grant);

        // Generate the JWT token (await in case it returns a Promise)
        const token = await at.toJwt();

        res.json({
            token,
            url: process.env.LIVEKIT_URL,
            roomName,
            participantName,
            role
        });

    } catch (error) {
        console.error('Error generating token:', error);
        res.status(500).json({
            error: 'Failed to generate token',
            details: error.message
        });
    }
});

/**
 * GET /api/rooms?roomIds=room1,room2,room3
 * Returns status of specific LiveKit rooms (only the ones requested)
 * Query param: roomIds - comma-separated list of room IDs to check
 */
app.get('/api/rooms', async (req, res) => {
    try {
        const apiKey = process.env.LIVEKIT_API_KEY;
        const apiSecret = process.env.LIVEKIT_API_SECRET;
        const livekitUrl = process.env.LIVEKIT_URL;

        if (!apiKey || !apiSecret || !livekitUrl) {
            return res.status(500).json({
                error: 'Server configuration error: LiveKit credentials not configured'
            });
        }

        // Get requested room IDs from query parameter
        const requestedRoomIds = req.query.roomIds ? req.query.roomIds.split(',') : [];

        if (requestedRoomIds.length === 0) {
            return res.json({ rooms: [] });
        }

        console.log('🔍 Checking status for rooms:', requestedRoomIds);

        // Import RoomServiceClient
        const { RoomServiceClient } = require('livekit-server-sdk');

        // Create client
        const roomService = new RoomServiceClient(livekitUrl, apiKey, apiSecret);

        // List all rooms
        const allRooms = await roomService.listRooms();

        // Filter to only include requested rooms
        const filteredRooms = allRooms.filter(room => requestedRoomIds.includes(room.name));

        // Format response - convert BigInt to string to avoid JSON serialization error
        const roomsData = filteredRooms.map(room => ({
            name: room.name,
            numParticipants: room.numParticipants,
            creationTime: room.creationTime ? room.creationTime.toString() : null,
            emptyTimeout: room.emptyTimeout ? room.emptyTimeout.toString() : null
        }));

        console.log(`✅ Found ${roomsData.length} active rooms out of ${requestedRoomIds.length} requested`);

        res.json({ rooms: roomsData });
    } catch (error) {
        console.error('❌ Error fetching rooms:', error);
        // Return empty rooms list instead of error to allow graceful degradation
        res.json({ rooms: [] });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});


// Start server with WebSocket support
const http = require('http');
const server = http.createServer(app);

// Attach WebSocket upgrade handler for the proxy
server.on('upgrade', livekitProxy.upgrade);

server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Mathbox Proto server running on port ${PORT}`);
    console.log(`📍 Login page: http://localhost:${PORT}`);
    console.log(`👨‍🎓 Student dashboard: http://localhost:${PORT}/student-dashboard.html`);
    console.log(`👨‍🏫 Teacher dashboard: http://localhost:${PORT}/teacher-dashboard.html`);
    console.log(`🔌 WebSocket proxy: /livekit-ws -> ${process.env.LIVEKIT_URL || 'NOT CONFIGURED'}`);
    console.log(`\n⚙️  LiveKit URL: ${process.env.LIVEKIT_URL || 'NOT CONFIGURED'}`);

    if (!process.env.LIVEKIT_API_KEY || !process.env.LIVEKIT_API_SECRET) {
        console.warn('\n⚠️  WARNING: LiveKit credentials not configured!');
        console.warn('   Please copy .env.example to .env and add your credentials.');
    }
});
