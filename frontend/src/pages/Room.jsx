import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    LiveKitRoom, VideoTrack, useRemoteParticipants,
    useLocalParticipant, useTracks, RoomAudioRenderer,
} from '@livekit/components-react';
import { Track, DataPacket_Kind, RoomEvent } from 'livekit-client';
import {
    ArrowLeft, Video, VideoOff, Mic, MicOff, PenTool,
    Eraser, Type, Square, Circle, Minus, Camera, Trash2,
    Lock, Unlock, MessageSquare, Send, Upload, X, Grid3X3,
    Palette, ChevronDown
} from 'lucide-react';

const COLORS = ['#000000', '#ef4444', '#22c55e', '#3b82f6'];
const BACKGROUNDS = [
    { id: 'white', label: 'Blanc', color: '#ffffff' },
    { id: 'grid', label: 'Quadrillage', color: '#f0f0f0' },
    { id: 'seyes', label: 'Seyès', color: '#f5f0e8' },
];
const TOOLS = [
    { id: 'pen', icon: PenTool, label: 'Stylo' },
    { id: 'eraser', icon: Eraser, label: 'Gomme' },
    { id: 'line', icon: Minus, label: 'Ligne' },
    { id: 'rect', icon: Square, label: 'Rectangle' },
    { id: 'circle', icon: Circle, label: 'Cercle' },
    { id: 'text', icon: Type, label: 'Texte' },
];

// ========================================================
// MAIN ROOM COMPONENT
// ========================================================
export default function Room() {
    const { courseCode } = useParams();
    const { user } = useAuthStore();
    const navigate = useNavigate();
    const [connectionInfo, setConnectionInfo] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        async function fetchToken() {
            try {
                const data = await api.post('/room/token', { courseCode });
                setConnectionInfo(data);
            } catch (err) {
                setError(err.message);
            }
            setLoading(false);
        }
        fetchToken();
    }, [courseCode]);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center">
                    <div className="w-12 h-12 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-muted-foreground">Connexion à la salle...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center">
                    <p className="text-red-400 mb-4">{error}</p>
                    <Button onClick={() => navigate(-1)}>Retour</Button>
                </div>
            </div>
        );
    }

    return (
        <LiveKitRoom
            serverUrl={connectionInfo.url}
            token={connectionInfo.token}
            connect={true}
            className="min-h-screen bg-background"
            data-lk-theme="default"
        >
            <RoomAudioRenderer />
            <RoomContent
                courseCode={courseCode}
                sessionId={connectionInfo.sessionId}
                courseId={connectionInfo.courseId}
                user={user}
                onLeave={() => navigate(user.role === 'PROF' ? '/dashboard' : '/student')}
            />
        </LiveKitRoom>
    );
}

// ========================================================
// ROOM CONTENT (inside LiveKitRoom context)
// ========================================================
function RoomContent({ courseCode, sessionId, courseId, user, onLeave }) {
    const [whiteboardOpen, setWhiteboardOpen] = useState(false);
    const [chatOpen, setChatOpen] = useState(false);
    const [locked, setLocked] = useState(false);
    const remoteParticipants = useRemoteParticipants();
    const { localParticipant } = useLocalParticipant();
    const remoteTracks = useTracks([Track.Source.Camera], { onlySubscribed: true });
    const localTracks = useTracks([Track.Source.Camera], { participant: localParticipant });

    const [videoEnabled, setVideoEnabled] = useState(true);
    const [audioEnabled, setAudioEnabled] = useState(true);

    const toggleVideo = () => {
        localParticipant?.setCameraEnabled(!videoEnabled);
        setVideoEnabled(!videoEnabled);
    };
    const toggleAudio = () => {
        localParticipant?.setMicrophoneEnabled(!audioEnabled);
        setAudioEnabled(!audioEnabled);
    };

    const remoteVideoTrack = remoteTracks.find(t => t.source === Track.Source.Camera && t.participant !== localParticipant);
    const localVideoTrack = localTracks.find(t => t.source === Track.Source.Camera);

    return (
        <div className="h-screen flex flex-col">
            {/* Top Bar */}
            <div className="h-12 glass-strong border-b flex items-center justify-between px-4 shrink-0">
                <div className="flex items-center gap-3">
                    <Button variant="ghost" size="sm" onClick={onLeave}>
                        <ArrowLeft className="w-4 h-4 mr-1" /> Quitter
                    </Button>
                    <Badge variant="success" className="text-xs">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 mr-1.5 animate-pulse" />
                        En direct — {courseCode}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                        {remoteParticipants.length + 1} participant{remoteParticipants.length > 0 ? 's' : ''}
                    </span>
                </div>

                <div className="flex items-center gap-2">
                    {user.role === 'PROF' && (
                        <Button
                            variant={locked ? 'destructive' : 'ghost'}
                            size="sm"
                            onClick={() => setLocked(!locked)}
                            title={locked ? 'Déverrouiller l\'élève' : 'Verrouiller l\'élève'}
                        >
                            {locked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                        </Button>
                    )}
                    <Button variant={whiteboardOpen ? 'default' : 'ghost'} size="sm" onClick={() => setWhiteboardOpen(!whiteboardOpen)}>
                        <PenTool className="w-4 h-4 mr-1" /> Tableau
                    </Button>
                    <Button variant={chatOpen ? 'default' : 'ghost'} size="sm" onClick={() => setChatOpen(!chatOpen)}>
                        <MessageSquare className="w-4 h-4 mr-1" /> Chat
                    </Button>
                    <ScreenshotButton sessionId={sessionId} courseId={courseId} />
                </div>
            </div>

            {/* Main Area */}
            <div className="flex-1 flex overflow-hidden relative">
                {/* Video Area */}
                <div className={`flex-1 relative bg-black ${whiteboardOpen ? 'hidden md:block md:w-1/4' : 'w-full'}`}>
                    {/* Remote video (full size or PiP) */}
                    {remoteVideoTrack ? (
                        <div className={whiteboardOpen ? 'absolute top-2 right-2 w-48 h-36 rounded-lg overflow-hidden z-10 border-2 border-border shadow-xl' : 'w-full h-full'}>
                            <VideoTrack trackRef={remoteVideoTrack} className="w-full h-full object-cover" />
                        </div>
                    ) : (
                        <div className="w-full h-full flex items-center justify-center">
                            <p className="text-muted-foreground">En attente du participant...</p>
                        </div>
                    )}

                    {/* Local video (PiP) */}
                    {localVideoTrack && (
                        <div className={`absolute ${whiteboardOpen ? 'bottom-2 right-2 w-32 h-24' : 'bottom-4 right-4 w-48 h-36'} rounded-lg overflow-hidden z-10 border-2 border-border shadow-xl`}>
                            <VideoTrack trackRef={localVideoTrack} className="w-full h-full object-cover mirror" />
                        </div>
                    )}
                </div>

                {/* Whiteboard */}
                {whiteboardOpen && (
                    <div className="flex-1 relative bg-white">
                        <Whiteboard
                            localParticipant={localParticipant}
                            locked={locked && user.role === 'STUDENT'}
                        />
                    </div>
                )}

                {/* Chat Panel */}
                {chatOpen && (
                    <ChatPanel
                        localParticipant={localParticipant}
                        courseCode={courseCode}
                        user={user}
                        onClose={() => setChatOpen(false)}
                    />
                )}
            </div>

            {/* Bottom Controls */}
            <div className="h-16 glass-strong border-t flex items-center justify-center gap-3 shrink-0">
                <Button
                    variant={videoEnabled ? 'secondary' : 'destructive'}
                    size="icon"
                    className="rounded-full w-12 h-12"
                    onClick={toggleVideo}
                >
                    {videoEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
                </Button>
                <Button
                    variant={audioEnabled ? 'secondary' : 'destructive'}
                    size="icon"
                    className="rounded-full w-12 h-12"
                    onClick={toggleAudio}
                >
                    {audioEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
                </Button>
                <Button
                    variant="destructive"
                    size="icon"
                    className="rounded-full w-12 h-12"
                    onClick={onLeave}
                >
                    <X className="w-5 h-5" />
                </Button>
            </div>
        </div>
    );
}

// ========================================================
// WHITEBOARD (Canvas + DataChannel)
// ========================================================
function Whiteboard({ localParticipant, locked }) {
    const canvasRef = useRef(null);
    const [tool, setTool] = useState('pen');
    const [color, setColor] = useState(COLORS[3]);
    const [thickness, setThickness] = useState(3);
    const [background, setBackground] = useState('white');
    const [isDrawing, setIsDrawing] = useState(false);
    const lastPoint = useRef(null);
    const drawingsRef = useRef([]);
    const shapeStartRef = useRef(null);

    // Set up canvas and DataChannel listener
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;
        drawBackground(canvas, background);

        // Listen for incoming drawing data
        const handleData = (payload, participant) => {
            if (participant === localParticipant) return;
            try {
                const data = JSON.parse(new TextDecoder().decode(payload));
                if (data.type === 'draw') {
                    applyDrawing(canvas, data);
                } else if (data.type === 'clear') {
                    clearCanvas(canvas);
                }
            } catch (e) { }
        };

        const room = localParticipant?.room;
        if (room) {
            room.on(RoomEvent.DataReceived, handleData);
            return () => room.off(RoomEvent.DataReceived, handleData);
        }
    }, [localParticipant, background]);

    // Handle resize
    useEffect(() => {
        const handleResize = () => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            // Save image data
            const ctx = canvas.getContext('2d');
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            canvas.width = canvas.offsetWidth;
            canvas.height = canvas.offsetHeight;
            drawBackground(canvas, background);
            ctx.putImageData(imageData, 0, 0);
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [background]);

    const drawBackground = (canvas, bg) => {
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = BACKGROUNDS.find(b => b.id === bg)?.color || '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        if (bg === 'grid') {
            ctx.strokeStyle = '#ddd';
            ctx.lineWidth = 0.5;
            for (let x = 0; x < canvas.width; x += 25) {
                ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
            }
            for (let y = 0; y < canvas.height; y += 25) {
                ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
            }
        } else if (bg === 'seyes') {
            // Seyès (grands carreaux)
            ctx.strokeStyle = '#c8b8e8';
            ctx.lineWidth = 0.5;
            for (let y = 0; y < canvas.height; y += 8) {
                ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
            }
            ctx.strokeStyle = '#9b8ec4';
            ctx.lineWidth = 1;
            for (let y = 0; y < canvas.height; y += 32) {
                ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
            }
            ctx.strokeStyle = '#f0c0c0';
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(60, 0); ctx.lineTo(60, canvas.height); ctx.stroke();
        }
    };

    const applyDrawing = (canvas, data) => {
        const ctx = canvas.getContext('2d');
        if (data.tool === 'pen' || data.tool === 'eraser') {
            ctx.beginPath();
            ctx.strokeStyle = data.tool === 'eraser' ? (BACKGROUNDS.find(b => b.id === background)?.color || '#fff') : data.color;
            ctx.lineWidth = data.thickness;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.moveTo(data.x1, data.y1);
            ctx.lineTo(data.x2, data.y2);
            ctx.stroke();
        } else if (data.tool === 'line') {
            ctx.beginPath();
            ctx.strokeStyle = data.color;
            ctx.lineWidth = data.thickness;
            ctx.moveTo(data.x1, data.y1);
            ctx.lineTo(data.x2, data.y2);
            ctx.stroke();
        } else if (data.tool === 'rect') {
            ctx.strokeStyle = data.color;
            ctx.lineWidth = data.thickness;
            ctx.strokeRect(data.x1, data.y1, data.x2 - data.x1, data.y2 - data.y1);
        } else if (data.tool === 'circle') {
            const rx = (data.x2 - data.x1) / 2;
            const ry = (data.y2 - data.y1) / 2;
            const cx = data.x1 + rx;
            const cy = data.y1 + ry;
            ctx.beginPath();
            ctx.strokeStyle = data.color;
            ctx.lineWidth = data.thickness;
            ctx.ellipse(cx, cy, Math.abs(rx), Math.abs(ry), 0, 0, Math.PI * 2);
            ctx.stroke();
        } else if (data.tool === 'text') {
            ctx.fillStyle = data.color;
            ctx.font = `${data.thickness * 6}px Inter, sans-serif`;
            ctx.fillText(data.text, data.x1, data.y1);
        }
    };

    const sendDrawing = (drawData) => {
        if (!localParticipant?.room) return;
        const encoded = new TextEncoder().encode(JSON.stringify({ type: 'draw', ...drawData }));
        localParticipant.publishData(encoded, DataPacket_Kind.RELIABLE);
    };

    const getPos = (e) => {
        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return { x: clientX - rect.left, y: clientY - rect.top };
    };

    const handlePointerDown = (e) => {
        if (locked) return;
        const pos = getPos(e);
        setIsDrawing(true);

        if (tool === 'text') {
            const text = prompt('Entrez le texte :');
            if (text) {
                const drawData = { tool: 'text', x1: pos.x, y1: pos.y, color, thickness, text };
                applyDrawing(canvasRef.current, drawData);
                sendDrawing(drawData);
            }
            setIsDrawing(false);
            return;
        }

        if (['line', 'rect', 'circle'].includes(tool)) {
            shapeStartRef.current = pos;
        }

        lastPoint.current = pos;
    };

    const handlePointerMove = (e) => {
        if (!isDrawing || locked) return;
        const pos = getPos(e);

        if (tool === 'pen' || tool === 'eraser') {
            const drawData = {
                tool,
                x1: lastPoint.current.x, y1: lastPoint.current.y,
                x2: pos.x, y2: pos.y,
                color, thickness: tool === 'eraser' ? thickness * 5 : thickness,
            };
            applyDrawing(canvasRef.current, drawData);
            sendDrawing(drawData);
            lastPoint.current = pos;
        }
    };

    const handlePointerUp = (e) => {
        if (!isDrawing || locked) return;
        setIsDrawing(false);

        if (['line', 'rect', 'circle'].includes(tool) && shapeStartRef.current) {
            const pos = getPos(e.changedTouches ? e.changedTouches[0] : e);
            const drawData = {
                tool,
                x1: shapeStartRef.current.x, y1: shapeStartRef.current.y,
                x2: pos.x, y2: pos.y,
                color, thickness,
            };
            applyDrawing(canvasRef.current, drawData);
            sendDrawing(drawData);
            shapeStartRef.current = null;
        }
    };

    const clearCanvas = (canvas) => {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawBackground(canvas, background);
    };

    const handleClear = () => {
        if (!confirm('Tout effacer ?')) return;
        clearCanvas(canvasRef.current);
        if (localParticipant?.room) {
            const encoded = new TextEncoder().encode(JSON.stringify({ type: 'clear' }));
            localParticipant.publishData(encoded, DataPacket_Kind.RELIABLE);
        }
    };

    return (
        <div className="h-full flex">
            {/* Toolbar */}
            <div className="w-14 bg-gray-100 border-r border-gray-200 flex flex-col items-center py-3 gap-1 shrink-0">
                {TOOLS.map(t => (
                    <button
                        key={t.id}
                        onClick={() => setTool(t.id)}
                        title={t.label}
                        className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${tool === t.id ? 'bg-primary text-white shadow' : 'text-gray-600 hover:bg-gray-200'
                            }`}
                    >
                        <t.icon className="w-5 h-5" />
                    </button>
                ))}

                <div className="w-8 border-t border-gray-300 my-2" />

                {/* Colors */}
                {COLORS.map(c => (
                    <button
                        key={c}
                        onClick={() => setColor(c)}
                        className={`w-7 h-7 rounded-full border-2 transition-transform ${color === c ? 'border-primary scale-110' : 'border-gray-300'
                            }`}
                        style={{ backgroundColor: c }}
                    />
                ))}

                <div className="w-8 border-t border-gray-300 my-2" />

                {/* Thickness */}
                <input
                    type="range"
                    min={1} max={10}
                    value={thickness}
                    onChange={(e) => setThickness(parseInt(e.target.value))}
                    className="w-10 rotate-[-90deg] mt-4 mb-4"
                />

                <div className="w-8 border-t border-gray-300 my-2" />

                {/* Background */}
                {BACKGROUNDS.map(bg => (
                    <button
                        key={bg.id}
                        onClick={() => { setBackground(bg.id); drawBackground(canvasRef.current, bg.id); }}
                        title={bg.label}
                        className={`w-8 h-8 rounded border-2 transition-colors ${background === bg.id ? 'border-primary' : 'border-gray-300'
                            }`}
                        style={{ backgroundColor: bg.color }}
                    >
                        {bg.id === 'grid' && <Grid3X3 className="w-4 h-4 text-gray-400 mx-auto" />}
                    </button>
                ))}

                <div className="mt-auto" />
                <button onClick={handleClear} title="Tout effacer" className="w-10 h-10 rounded-lg text-red-500 hover:bg-red-100 flex items-center justify-center">
                    <Trash2 className="w-5 h-5" />
                </button>
            </div>

            {/* Canvas */}
            <canvas
                ref={canvasRef}
                className="flex-1 whiteboard-canvas"
                style={{ cursor: locked ? 'not-allowed' : (tool === 'eraser' ? 'cell' : 'crosshair') }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={() => setIsDrawing(false)}
                onTouchStart={handlePointerDown}
                onTouchMove={handlePointerMove}
                onTouchEnd={handlePointerUp}
            />
        </div>
    );
}

// ========================================================
// CHAT PANEL
// ========================================================
function ChatPanel({ localParticipant, courseCode, user, onClose }) {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const messagesEndRef = useRef(null);

    useEffect(() => {
        const room = localParticipant?.room;
        if (!room) return;

        const handleData = (payload, participant) => {
            try {
                const data = JSON.parse(new TextDecoder().decode(payload));
                if (data.type === 'chat') {
                    setMessages(prev => [...prev, {
                        sender: data.senderName,
                        text: data.text,
                        time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
                        isMe: participant === localParticipant,
                    }]);
                }
            } catch (e) { }
        };

        room.on(RoomEvent.DataReceived, handleData);
        return () => room.off(RoomEvent.DataReceived, handleData);
    }, [localParticipant]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const sendMessage = (e) => {
        e.preventDefault();
        if (!input.trim()) return;

        const msg = { type: 'chat', text: input, senderName: user.name };
        const encoded = new TextEncoder().encode(JSON.stringify(msg));
        localParticipant?.publishData(encoded, DataPacket_Kind.RELIABLE);

        setMessages(prev => [...prev, {
            sender: user.name,
            text: input,
            time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
            isMe: true,
        }]);

        setInput('');
    };

    return (
        <div className="w-80 border-l border-border flex flex-col bg-background shrink-0">
            <div className="h-10 px-4 flex items-center justify-between border-b">
                <span className="text-sm font-medium">Chat</span>
                <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
                    <X className="w-4 h-4" />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.map((msg, i) => (
                    <div key={i} className={`flex flex-col ${msg.isMe ? 'items-end' : 'items-start'}`}>
                        <span className="text-[10px] text-muted-foreground mb-0.5">{msg.sender} • {msg.time}</span>
                        <div className={`px-3 py-2 rounded-lg text-sm max-w-[85%] ${msg.isMe ? 'bg-primary text-white' : 'bg-secondary'
                            }`}>
                            {msg.text}
                        </div>
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </div>

            <form onSubmit={sendMessage} className="p-3 border-t flex gap-2">
                <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Message..."
                    className="flex-1 h-9 rounded-lg bg-secondary/50 border border-input px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <Button type="submit" size="icon" className="h-9 w-9 shrink-0">
                    <Send className="w-4 h-4" />
                </Button>
            </form>
        </div>
    );
}

// ========================================================
// SCREENSHOT BUTTON
// ========================================================
function ScreenshotButton({ sessionId, courseId }) {
    const [saving, setSaving] = useState(false);

    const takeScreenshot = async () => {
        const canvas = document.querySelector('.whiteboard-canvas');
        if (!canvas) return;

        setSaving(true);
        try {
            const imageData = canvas.toDataURL('image/png');
            await api.post('/room/screenshot', { imageData, sessionId, courseId });
        } catch (err) {
            console.error('Screenshot failed:', err);
        }
        setSaving(false);
    };

    return (
        <Button variant="ghost" size="sm" onClick={takeScreenshot} disabled={saving}>
            <Camera className="w-4 h-4 mr-1" />
            {saving ? '...' : '📸'}
        </Button>
    );
}
