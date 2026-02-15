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
    Lock, Unlock, MessageSquare, Send, X, Grid3X3,
    Monitor, MonitorOff, ImagePlus,
} from 'lucide-react';

// ─── Constants ───────────────────────────────────────
const COLORS = ['#000000', '#ef4444', '#22c55e', '#3b82f6', '#f59e0b', '#8b5cf6'];

const BG_STYLES = {
    white: { label: 'Blanc', css: 'white' },
    grid: {
        label: 'Grille',
        css: `
            repeating-linear-gradient(0deg, #ddd, #ddd 0.5px, transparent 0.5px, transparent 25px),
            repeating-linear-gradient(90deg, #ddd, #ddd 0.5px, transparent 0.5px, transparent 25px),
            white
        `,
    },
    seyes: {
        label: 'Seyès',
        css: `
            repeating-linear-gradient(0deg, #c8b8e8 0px, #c8b8e8 0.5px, transparent 0.5px, transparent 8px),
            repeating-linear-gradient(0deg, #9b8ec4 0px, #9b8ec4 1px, transparent 1px, transparent 32px),
            linear-gradient(90deg, transparent 59px, #f0c0c0 59px, #f0c0c0 61px, transparent 61px),
            #f5f0e8
        `,
    },
};

const TOOLS = [
    { id: 'pen', icon: PenTool, label: 'Stylo' },
    { id: 'eraser', icon: Eraser, label: 'Gomme' },
    { id: 'line', icon: Minus, label: 'Ligne' },
    { id: 'rect', icon: Square, label: 'Rectangle' },
    { id: 'circle', icon: Circle, label: 'Cercle' },
    { id: 'text', icon: Type, label: 'Texte' },
    { id: 'image', icon: ImagePlus, label: 'Image' },
];

// ======================================================
// MAIN ROOM COMPONENT
// ======================================================
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

// ======================================================
// ROOM CONTENT  (inside LiveKitRoom context)
// ======================================================
function RoomContent({ courseCode, sessionId, courseId, user, onLeave }) {
    // ── State ────────────────────────────────────────
    const [viewMode, setViewMode] = useState('VIDEO');       // VIDEO | BOARD | SCREEN_SHARE
    const [chatOpen, setChatOpen] = useState(false);
    const [locked, setLocked] = useState(false);
    const isProf = user.role === 'PROF';

    // ── LiveKit hooks ────────────────────────────────
    const remoteParticipants = useRemoteParticipants();
    const { localParticipant } = useLocalParticipant();
    const allCameraTracks = useTracks([Track.Source.Camera], { onlySubscribed: false });
    const screenShareTracks = useTracks([Track.Source.ScreenShare], { onlySubscribed: false });

    // ── Camera / Mic state synced with hardware ──────
    const [videoEnabled, setVideoEnabled] = useState(false);
    const [audioEnabled, setAudioEnabled] = useState(false);

    // Sync button state with actual hardware state on connect
    useEffect(() => {
        if (!localParticipant) return;
        const sync = () => {
            setVideoEnabled(localParticipant.isCameraEnabled);
            setAudioEnabled(localParticipant.isMicrophoneEnabled);
        };
        sync();
        // re-sync when tracks change
        localParticipant.on('trackPublished', sync);
        localParticipant.on('trackUnpublished', sync);
        localParticipant.on('localTrackPublished', sync);
        localParticipant.on('localTrackUnpublished', sync);
        return () => {
            localParticipant.off('trackPublished', sync);
            localParticipant.off('trackUnpublished', sync);
            localParticipant.off('localTrackPublished', sync);
            localParticipant.off('localTrackUnpublished', sync);
        };
    }, [localParticipant]);

    const toggleVideo = async () => {
        await localParticipant?.setCameraEnabled(!videoEnabled);
        setVideoEnabled(!videoEnabled);
    };
    const toggleAudio = async () => {
        await localParticipant?.setMicrophoneEnabled(!audioEnabled);
        setAudioEnabled(!audioEnabled);
    };

    // ── Screen Share (Prof only) ─────────────────────
    const [screenSharing, setScreenSharing] = useState(false);
    const toggleScreenShare = async () => {
        if (!isProf) return;
        const next = !screenSharing;
        await localParticipant?.setScreenShareEnabled(next);
        setScreenSharing(next);
        if (next) {
            broadcastMode('SCREEN_SHARE');
        } else {
            broadcastMode('VIDEO');
        }
    };

    // ── Teacher-led mode broadcast ───────────────────
    const broadcastMode = useCallback((mode) => {
        setViewMode(mode);
        if (!localParticipant?.publishData) return;
        const msg = JSON.stringify({ type: 'mode', mode });
        localParticipant.publishData(new TextEncoder().encode(msg), DataPacket_Kind.RELIABLE);
    }, [localParticipant]);

    const toggleWhiteboard = () => {
        if (!isProf) return;
        const next = viewMode === 'BOARD' ? 'VIDEO' : 'BOARD';
        broadcastMode(next);
    };

    // ── Student listens for mode changes + lock ──────
    useEffect(() => {
        const room = localParticipant?.room;
        if (!room) return;
        const handler = (payload, participant) => {
            if (participant?.identity === localParticipant?.identity) return;
            try {
                const data = JSON.parse(new TextDecoder().decode(payload));
                if (data.type === 'mode') setViewMode(data.mode);
                if (data.type === 'lock') setLocked(data.locked);
            } catch (e) { }
        };
        room.on(RoomEvent.DataReceived, handler);
        return () => room.off(RoomEvent.DataReceived, handler);
    }, [localParticipant]);

    // ── Lock broadcast (Prof) ────────────────────────
    const toggleLock = () => {
        const next = !locked;
        setLocked(next);
        if (localParticipant?.publishData) {
            const msg = JSON.stringify({ type: 'lock', locked: next });
            localParticipant.publishData(new TextEncoder().encode(msg), DataPacket_Kind.RELIABLE);
        }
    };

    // ── Derive video tracks ──────────────────────────
    const remoteVideoTrack = allCameraTracks.find(
        t => t.source === Track.Source.Camera && t.participant?.identity !== localParticipant?.identity
    );
    const localVideoTrack = allCameraTracks.find(
        t => t.source === Track.Source.Camera && t.participant?.identity === localParticipant?.identity
    );
    const remoteScreenTrack = screenShareTracks.find(
        t => t.participant?.identity !== localParticipant?.identity
    );
    const localScreenTrack = screenShareTracks.find(
        t => t.participant?.identity === localParticipant?.identity
    );
    const activeScreenTrack = localScreenTrack || remoteScreenTrack;

    // ── Layout decision ──────────────────────────────
    const showBoard = viewMode === 'BOARD' || viewMode === 'SCREEN_SHARE';

    return (
        <div className="h-screen flex flex-col">
            {/* ── Top Bar ──────────────────────────── */}
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
                    {/* Prof-only controls */}
                    {isProf && (
                        <>
                            <Button
                                variant={locked ? 'destructive' : 'ghost'} size="sm"
                                onClick={toggleLock}
                                title={locked ? 'Déverrouiller' : 'Verrouiller'}
                            >
                                {locked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                            </Button>
                            <Button
                                variant={viewMode === 'BOARD' ? 'default' : 'ghost'} size="sm"
                                onClick={toggleWhiteboard}
                            >
                                <PenTool className="w-4 h-4 mr-1" /> Tableau
                            </Button>
                            <Button
                                variant={screenSharing ? 'default' : 'ghost'} size="sm"
                                onClick={toggleScreenShare}
                            >
                                {screenSharing
                                    ? <><MonitorOff className="w-4 h-4 mr-1" /> Stop Écran</>
                                    : <><Monitor className="w-4 h-4 mr-1" /> Écran</>
                                }
                            </Button>
                        </>
                    )}
                    <Button variant={chatOpen ? 'default' : 'ghost'} size="sm" onClick={() => setChatOpen(!chatOpen)}>
                        <MessageSquare className="w-4 h-4 mr-1" /> Chat
                    </Button>
                    <ScreenshotButton sessionId={sessionId} courseId={courseId} />
                </div>
            </div>

            {/* ── Main Area ────────────────────────── */}
            <div className="flex-1 flex overflow-hidden relative">

                {/* VIDEO-ONLY mode: full screen */}
                {!showBoard && (
                    <div className="flex-1 relative bg-black">
                        {remoteVideoTrack ? (
                            <VideoTrack trackRef={remoteVideoTrack} className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center">
                                <p className="text-muted-foreground">En attente du participant...</p>
                            </div>
                        )}
                        {localVideoTrack && (
                            <div className="absolute bottom-4 right-4 w-48 h-36 rounded-lg overflow-hidden z-10 border-2 border-border shadow-xl">
                                <VideoTrack trackRef={localVideoTrack} className="w-full h-full object-cover mirror" />
                            </div>
                        )}
                    </div>
                )}

                {/* BOARD / SCREEN_SHARE mode: whiteboard center, videos RIGHT */}
                {showBoard && (
                    <>
                        {/* Whiteboard / Screen+Annotation area */}
                        <div className="flex-1 relative">
                            {viewMode === 'SCREEN_SHARE' && activeScreenTrack && (
                                <div className="absolute inset-0 z-0">
                                    <VideoTrack trackRef={activeScreenTrack} className="w-full h-full object-contain bg-black" />
                                </div>
                            )}
                            <div className={`absolute inset-0 ${viewMode === 'SCREEN_SHARE' ? 'z-10' : 'z-0'}`}>
                                <Whiteboard
                                    localParticipant={localParticipant}
                                    locked={locked && !isProf}
                                    transparent={viewMode === 'SCREEN_SHARE'}
                                />
                            </div>
                        </div>

                        {/* Video PiPs — RIGHT column */}
                        <div className="w-56 bg-gray-950 border-l border-border flex flex-col gap-2 p-2 shrink-0">
                            {remoteVideoTrack && (
                                <div className="w-full aspect-video rounded-lg overflow-hidden border border-border">
                                    <VideoTrack trackRef={remoteVideoTrack} className="w-full h-full object-cover" />
                                </div>
                            )}
                            {localVideoTrack && (
                                <div className="w-full aspect-video rounded-lg overflow-hidden border border-border">
                                    <VideoTrack trackRef={localVideoTrack} className="w-full h-full object-cover mirror" />
                                </div>
                            )}
                            {!remoteVideoTrack && !localVideoTrack && (
                                <div className="flex-1 flex items-center justify-center">
                                    <p className="text-xs text-muted-foreground text-center">Caméras désactivées</p>
                                </div>
                            )}
                        </div>
                    </>
                )}

                {/* Chat Panel */}
                {chatOpen && (
                    <ChatPanel
                        localParticipant={localParticipant}
                        user={user}
                        onClose={() => setChatOpen(false)}
                    />
                )}
            </div>

            {/* ── Bottom Controls ──────────────────── */}
            <div className="h-16 glass-strong border-t flex items-center justify-center gap-3 shrink-0">
                <Button
                    variant={videoEnabled ? 'secondary' : 'destructive'}
                    size="icon" className="rounded-full w-12 h-12"
                    onClick={toggleVideo}
                >
                    {videoEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
                </Button>
                <Button
                    variant={audioEnabled ? 'secondary' : 'destructive'}
                    size="icon" className="rounded-full w-12 h-12"
                    onClick={toggleAudio}
                >
                    {audioEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
                </Button>
                <Button
                    variant="destructive" size="icon"
                    className="rounded-full w-12 h-12" onClick={onLeave}
                >
                    <X className="w-5 h-5" />
                </Button>
            </div>
        </div>
    );
}

// ======================================================
// WHITEBOARD  (Two-layer: CSS background + transparent canvas)
// ======================================================
function Whiteboard({ localParticipant, locked, transparent }) {
    const canvasRef = useRef(null);
    const wrapperRef = useRef(null);
    const [tool, setTool] = useState('pen');
    const [color, setColor] = useState(COLORS[3]);
    const [thickness, setThickness] = useState(3);
    const [background, setBackground] = useState('white');
    const [isDrawing, setIsDrawing] = useState(false);
    const lastPoint = useRef(null);
    const shapeStartRef = useRef(null);

    // ── Custom eraser cursor ─────────────────────────
    const eraserRef = useRef(null);
    const [eraserPos, setEraserPos] = useState({ x: -100, y: -100 });
    const eraserSize = thickness * 5;

    // ── Text input state ─────────────────────────────
    const [textInput, setTextInput] = useState(null); // { x, y }
    const textRef = useRef(null);

    // ── Image upload ref ─────────────────────────────
    const imageInputRef = useRef(null);

    // Set up canvas size
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const resize = () => {
            const rect = canvas.parentElement.getBoundingClientRect();
            // Save current drawing
            const tmpCanvas = document.createElement('canvas');
            tmpCanvas.width = canvas.width;
            tmpCanvas.height = canvas.height;
            tmpCanvas.getContext('2d').drawImage(canvas, 0, 0);

            canvas.width = rect.width;
            canvas.height = rect.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(tmpCanvas, 0, 0);
        };
        resize();
        window.addEventListener('resize', resize);
        return () => window.removeEventListener('resize', resize);
    }, []);

    // ── DataChannel listener for remote drawings ─────
    useEffect(() => {
        const room = localParticipant?.room;
        if (!room) return;

        const handler = (payload, participant) => {
            // Skip messages from self
            if (participant?.identity === localParticipant?.identity) return;
            try {
                const data = JSON.parse(new TextDecoder().decode(payload));
                if (data.type === 'draw') applyDrawing(canvasRef.current, data);
                else if (data.type === 'clear') clearCanvas();
                else if (data.type === 'text-live') applyTextLive(data);
                else if (data.type === 'text-commit') applyDrawing(canvasRef.current, data);
                else if (data.type === 'image') applyImage(canvasRef.current, data);
            } catch (e) { }
        };

        room.on(RoomEvent.DataReceived, handler);
        return () => room.off(RoomEvent.DataReceived, handler);
    }, [localParticipant, background]);

    // ── Drawing logic ────────────────────────────────
    const applyDrawing = (canvas, data) => {
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        ctx.save();

        if (data.tool === 'pen') {
            ctx.globalCompositeOperation = 'source-over';
            ctx.beginPath();
            ctx.strokeStyle = data.color;
            ctx.lineWidth = data.thickness;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.moveTo(data.x1, data.y1);
            ctx.lineTo(data.x2, data.y2);
            ctx.stroke();
        } else if (data.tool === 'eraser') {
            ctx.globalCompositeOperation = 'destination-out';
            ctx.beginPath();
            ctx.lineWidth = data.thickness;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.moveTo(data.x1, data.y1);
            ctx.lineTo(data.x2, data.y2);
            ctx.stroke();
        } else if (data.tool === 'line') {
            ctx.globalCompositeOperation = 'source-over';
            ctx.beginPath();
            ctx.strokeStyle = data.color;
            ctx.lineWidth = data.thickness;
            ctx.moveTo(data.x1, data.y1);
            ctx.lineTo(data.x2, data.y2);
            ctx.stroke();
        } else if (data.tool === 'rect') {
            ctx.globalCompositeOperation = 'source-over';
            ctx.strokeStyle = data.color;
            ctx.lineWidth = data.thickness;
            ctx.strokeRect(data.x1, data.y1, data.x2 - data.x1, data.y2 - data.y1);
        } else if (data.tool === 'circle') {
            ctx.globalCompositeOperation = 'source-over';
            const rx = (data.x2 - data.x1) / 2;
            const ry = (data.y2 - data.y1) / 2;
            ctx.beginPath();
            ctx.strokeStyle = data.color;
            ctx.lineWidth = data.thickness;
            ctx.ellipse(data.x1 + rx, data.y1 + ry, Math.abs(rx), Math.abs(ry), 0, 0, Math.PI * 2);
            ctx.stroke();
        } else if (data.tool === 'text' || data.tool === 'text-commit') {
            ctx.globalCompositeOperation = 'source-over';
            ctx.fillStyle = data.color;
            ctx.font = `${data.thickness * 6}px Inter, sans-serif`;
            ctx.fillText(data.text, data.x1, data.y1);
        }

        ctx.restore();
    };

    // ── Remote text overlay (live preview) ───────────
    const [remoteText, setRemoteText] = useState(null);
    const applyTextLive = (data) => {
        setRemoteText({ x: data.x1, y: data.y1, text: data.text, color: data.color, size: data.thickness * 6 });
    };

    // ── Image apply ──────────────────────────────────
    const applyImage = (canvas, data) => {
        if (!canvas) return;
        const img = new Image();
        img.onload = () => {
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, data.x, data.y, data.w, data.h);
        };
        img.src = data.src;
    };

    // ── Broadcast helper ─────────────────────────────
    const sendDraw = (drawData) => {
        if (!localParticipant?.publishData) return;
        const encoded = new TextEncoder().encode(JSON.stringify({ type: 'draw', ...drawData }));
        localParticipant.publishData(encoded, DataPacket_Kind.RELIABLE);
    };

    const sendData = (payload) => {
        if (!localParticipant?.publishData) return;
        const encoded = new TextEncoder().encode(JSON.stringify(payload));
        localParticipant.publishData(encoded, DataPacket_Kind.RELIABLE);
    };

    // ── Get canvas-relative position ─────────────────
    const getPos = (e) => {
        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return { x: clientX - rect.left, y: clientY - rect.top };
    };

    // ── Pointer handlers ─────────────────────────────
    const handlePointerDown = (e) => {
        if (locked) return;
        const pos = getPos(e);

        // Text tool: open inline input
        if (tool === 'text') {
            setTextInput(pos);
            setTimeout(() => textRef.current?.focus(), 50);
            return;
        }

        // Image tool: open file picker
        if (tool === 'image') {
            imageInputRef.current?.click();
            return;
        }

        setIsDrawing(true);
        if (['line', 'rect', 'circle'].includes(tool)) {
            shapeStartRef.current = pos;
        }
        lastPoint.current = pos;
    };

    const handlePointerMove = (e) => {
        // Update eraser cursor position
        if (tool === 'eraser') {
            const pos = getPos(e);
            setEraserPos(pos);
        }

        if (!isDrawing || locked) return;
        const pos = getPos(e);

        if (tool === 'pen' || tool === 'eraser') {
            const drawData = {
                tool, x1: lastPoint.current.x, y1: lastPoint.current.y,
                x2: pos.x, y2: pos.y,
                color, thickness: tool === 'eraser' ? thickness * 5 : thickness,
            };
            applyDrawing(canvasRef.current, drawData);
            sendDraw(drawData);
            lastPoint.current = pos;
        }
    };

    const handlePointerUp = (e) => {
        if (!isDrawing || locked) return;
        setIsDrawing(false);

        if (['line', 'rect', 'circle'].includes(tool) && shapeStartRef.current) {
            const pos = getPos(e.changedTouches ? e.changedTouches[0] : e);
            const drawData = {
                tool, x1: shapeStartRef.current.x, y1: shapeStartRef.current.y,
                x2: pos.x, y2: pos.y, color, thickness,
            };
            applyDrawing(canvasRef.current, drawData);
            sendDraw(drawData);
            shapeStartRef.current = null;
        }
    };

    // ── Text tool: commit on Enter / blur ────────────
    const commitText = (text) => {
        if (!textInput || !text) { setTextInput(null); return; }
        const drawData = { tool: 'text', x1: textInput.x, y1: textInput.y + thickness * 6, color, thickness, text };
        applyDrawing(canvasRef.current, drawData);
        sendData({ type: 'text-commit', ...drawData });
        setTextInput(null);
        setRemoteText(null);
    };

    const handleTextKeyDown = (e) => {
        if (e.key === 'Enter') {
            commitText(e.target.value);
        } else if (e.key === 'Escape') {
            setTextInput(null);
        } else {
            // Broadcast live keystroke
            setTimeout(() => {
                sendData({
                    type: 'text-live',
                    x1: textInput.x, y1: textInput.y,
                    text: e.target.value + (e.key.length === 1 ? e.key : ''),
                    color, thickness,
                });
            }, 0);
        }
    };

    // ── Image import ─────────────────────────────────
    const handleImageUpload = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const img = new Image();
            img.onload = () => {
                const canvas = canvasRef.current;
                if (!canvas) return;
                // Scale to fit max 400px wide
                const maxW = 400;
                const scale = img.width > maxW ? maxW / img.width : 1;
                const w = img.width * scale;
                const h = img.height * scale;
                const x = (canvas.width - w) / 2;
                const y = (canvas.height - h) / 2;

                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, x, y, w, h);

                // Broadcast
                sendData({ type: 'image', src: ev.target.result, x, y, w, h });
            };
            img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
        e.target.value = '';
    };

    // ── Clear ────────────────────────────────────────
    const clearCanvas = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    };

    const handleClear = () => {
        if (!confirm('Tout effacer ?')) return;
        clearCanvas();
        sendData({ type: 'clear' });
    };

    // ── Cursor style ─────────────────────────────────
    const getCursor = () => {
        if (locked) return 'not-allowed';
        if (tool === 'eraser') return 'none';
        if (tool === 'text') return 'text';
        return 'crosshair';
    };

    return (
        <div className="h-full flex">
            {/* ── Toolbar ─────────────────────────── */}
            <div className="w-14 bg-gray-100 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 flex flex-col items-center py-3 gap-1 shrink-0 z-20">
                {TOOLS.map(t => (
                    <button
                        key={t.id}
                        onClick={() => {
                            setTool(t.id);
                            if (t.id === 'image') imageInputRef.current?.click();
                        }}
                        title={t.label}
                        className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${tool === t.id ? 'bg-primary text-white shadow' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800'
                            }`}
                    >
                        <t.icon className="w-5 h-5" />
                    </button>
                ))}

                <div className="w-8 border-t border-gray-300 dark:border-gray-600 my-2" />

                {/* Colors */}
                {COLORS.map(c => (
                    <button
                        key={c}
                        onClick={() => setColor(c)}
                        className={`w-7 h-7 rounded-full border-2 transition-transform ${color === c ? 'border-primary scale-110' : 'border-gray-300 dark:border-gray-600'
                            }`}
                        style={{ backgroundColor: c }}
                    />
                ))}

                <div className="w-8 border-t border-gray-300 dark:border-gray-600 my-2" />

                {/* Thickness */}
                <input
                    type="range" min={1} max={10}
                    value={thickness}
                    onChange={e => setThickness(parseInt(e.target.value))}
                    className="w-10 rotate-[-90deg] mt-4 mb-4"
                />

                <div className="w-8 border-t border-gray-300 dark:border-gray-600 my-2" />

                {/* Background (only in BOARD mode, not SCREEN_SHARE) */}
                {!transparent && Object.entries(BG_STYLES).map(([id, bg]) => (
                    <button
                        key={id}
                        onClick={() => setBackground(id)}
                        title={bg.label}
                        className={`w-8 h-8 rounded border-2 transition-colors ${background === id ? 'border-primary' : 'border-gray-300 dark:border-gray-600'
                            }`}
                        style={{ background: id === 'white' ? '#fff' : id === 'grid' ? '#f0f0f0' : '#f5f0e8' }}
                    >
                        {id === 'grid' && <Grid3X3 className="w-4 h-4 text-gray-400 mx-auto" />}
                    </button>
                ))}

                <div className="mt-auto" />
                <button onClick={handleClear} title="Tout effacer"
                    className="w-10 h-10 rounded-lg text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 flex items-center justify-center">
                    <Trash2 className="w-5 h-5" />
                </button>
            </div>

            {/* ── Canvas area ─────────────────────── */}
            <div
                ref={wrapperRef}
                className="flex-1 relative overflow-hidden"
                style={{
                    background: transparent ? 'transparent' : BG_STYLES[background]?.css || 'white',
                }}
            >
                <canvas
                    ref={canvasRef}
                    className="absolute inset-0 w-full h-full"
                    style={{ cursor: getCursor(), background: 'transparent' }}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerLeave={() => { setIsDrawing(false); setEraserPos({ x: -100, y: -100 }); }}
                    onTouchStart={handlePointerDown}
                    onTouchMove={handlePointerMove}
                    onTouchEnd={handlePointerUp}
                />

                {/* Custom eraser cursor */}
                {tool === 'eraser' && (
                    <div
                        ref={eraserRef}
                        className="pointer-events-none absolute rounded-full border border-black/50 bg-white/80"
                        style={{
                            width: eraserSize, height: eraserSize,
                            left: eraserPos.x - eraserSize / 2,
                            top: eraserPos.y - eraserSize / 2,
                            transition: 'left 0.02s, top 0.02s',
                        }}
                    />
                )}

                {/* Inline text input */}
                {textInput && (
                    <input
                        ref={textRef}
                        type="text"
                        autoFocus
                        className="absolute z-30 bg-transparent border-b-2 border-primary outline-none"
                        style={{
                            left: textInput.x,
                            top: textInput.y,
                            color,
                            fontSize: thickness * 6,
                            fontFamily: 'Inter, sans-serif',
                            minWidth: 60,
                        }}
                        onKeyDown={handleTextKeyDown}
                        onBlur={e => commitText(e.target.value)}
                    />
                )}

                {/* Remote live text preview */}
                {remoteText && (
                    <span
                        className="absolute pointer-events-none opacity-60 z-30"
                        style={{
                            left: remoteText.x,
                            top: remoteText.y,
                            color: remoteText.color,
                            fontSize: remoteText.size,
                            fontFamily: 'Inter, sans-serif',
                        }}
                    >
                        {remoteText.text}
                    </span>
                )}

                {/* Hidden image input */}
                <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
            </div>
        </div>
    );
}

// ======================================================
// CHAT PANEL  (DataChannel-based)
// ======================================================
function ChatPanel({ localParticipant, user, onClose }) {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const messagesEndRef = useRef(null);

    useEffect(() => {
        const room = localParticipant?.room;
        if (!room) return;

        const handler = (payload, participant) => {
            // Skip self-messages (we add them locally on send)
            if (participant?.identity === localParticipant?.identity) return;
            try {
                const data = JSON.parse(new TextDecoder().decode(payload));
                if (data.type === 'chat') {
                    setMessages(prev => [...prev, {
                        sender: data.senderName,
                        text: data.text,
                        time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
                        isMe: false,
                    }]);
                }
            } catch (e) { }
        };

        room.on(RoomEvent.DataReceived, handler);
        return () => room.off(RoomEvent.DataReceived, handler);
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
                    onChange={e => setInput(e.target.value)}
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

// ======================================================
// SCREENSHOT BUTTON  (with naming modal)
// ======================================================
function ScreenshotButton({ sessionId, courseId }) {
    const [saving, setSaving] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [captureName, setCaptureName] = useState('');
    const capturedDataRef = useRef(null);

    const takeScreenshot = () => {
        const canvas = document.querySelector('canvas');
        if (!canvas) return;

        // Capture the canvas data
        capturedDataRef.current = canvas.toDataURL('image/png');
        const now = new Date();
        setCaptureName(`Capture ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`);
        setShowModal(true);
    };

    const confirmSave = async () => {
        if (!capturedDataRef.current) return;
        setSaving(true);
        try {
            await api.post('/room/screenshot', {
                imageData: capturedDataRef.current,
                sessionId,
                courseId,
                name: captureName,
            });
        } catch (err) {
            console.error('Screenshot failed:', err);
        }
        setSaving(false);
        setShowModal(false);
    };

    return (
        <>
            <Button variant="ghost" size="sm" onClick={takeScreenshot} disabled={saving}>
                <Camera className="w-4 h-4 mr-1" /> {saving ? '...' : '📸'}
            </Button>

            {/* Naming modal */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className="bg-background rounded-xl border p-6 w-96 shadow-2xl">
                        <h3 className="text-lg font-semibold mb-4">Nommer la capture</h3>
                        <input
                            value={captureName}
                            onChange={e => setCaptureName(e.target.value)}
                            className="w-full h-10 rounded-lg bg-secondary/50 border border-input px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary mb-4"
                            autoFocus
                            onKeyDown={e => e.key === 'Enter' && confirmSave()}
                        />
                        <div className="flex justify-end gap-2">
                            <Button variant="ghost" onClick={() => setShowModal(false)}>Annuler</Button>
                            <Button onClick={confirmSave} disabled={saving}>
                                {saving ? 'Enregistrement...' : 'Enregistrer'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
