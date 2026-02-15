import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    LiveKitRoom, VideoTrack, useRemoteParticipants,
    useLocalParticipant, useTracks, RoomAudioRenderer,
    useRoomContext,
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
    // ── Context ──────────────────────────────────────
    const room = useRoomContext();
    const { localParticipant } = useLocalParticipant();
    const remoteParticipants = useRemoteParticipants();

    // ── State ────────────────────────────────────────
    const [viewMode, setViewMode] = useState('VIDEO');
    const [chatOpen, setChatOpen] = useState(false);
    const [locked, setLocked] = useState(false);
    const [screenSharing, setScreenSharing] = useState(false);
    const isProf = user.role === 'PROF';

    // ── Tracks ───────────────────────────────────────
    const allCameraTracks = useTracks([Track.Source.Camera], { onlySubscribed: false });
    const screenShareTracks = useTracks([Track.Source.ScreenShare], { onlySubscribed: false });

    // ── Camera / Mic sync ────────────────────────────
    const [videoEnabled, setVideoEnabled] = useState(false);
    const [audioEnabled, setAudioEnabled] = useState(false);

    useEffect(() => {
        if (!localParticipant) return;
        const sync = () => {
            setVideoEnabled(localParticipant.isCameraEnabled);
            setAudioEnabled(localParticipant.isMicrophoneEnabled);
            setScreenSharing(localParticipant.isScreenShareEnabled);
        };
        sync();
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

    // ── Mode Broadcasting (Prof) ─────────────────────
    const broadcastMode = useCallback(async (mode) => {
        setViewMode(mode); // Set local
        if (!room || !localParticipant) return;

        try {
            const msg = JSON.stringify({ type: 'mode', mode });
            const payload = new TextEncoder().encode(msg);
            await localParticipant.publishData(payload, DataPacket_Kind.RELIABLE);
            console.log('[Room] Broadcasted mode:', mode);
        } catch (err) {
            console.error('[Room] Failed to broadcast mode:', err);
        }
    }, [room, localParticipant]);

    const toggleScreenShare = async () => {
        if (!isProf) return;
        const next = !screenSharing;
        await localParticipant?.setScreenShareEnabled(next);
        setScreenSharing(next);
        broadcastMode(next ? 'SCREEN_SHARE' : 'VIDEO');
    };

    const toggleWhiteboard = () => {
        if (!isProf) return;
        (viewMode === 'BOARD') ? broadcastMode('VIDEO') : broadcastMode('BOARD');
    };

    const toggleLock = async () => {
        const next = !locked;
        setLocked(next);
        if (localParticipant) {
            try {
                const msg = JSON.stringify({ type: 'lock', locked: next });
                await localParticipant.publishData(new TextEncoder().encode(msg), DataPacket_Kind.RELIABLE);
            } catch (e) {
                console.error('[Room] Failed to sync lock:', e);
            }
        }
    };

    // ── Mode Listener (Student) & Global Events ──────
    useEffect(() => {
        if (!room) return;

        const handleData = (payload, participant, kind) => {
            // Ignore echoes from self
            if (participant?.identity === localParticipant?.identity) return;

            try {
                const str = new TextDecoder().decode(payload);
                const data = JSON.parse(str);

                // console.log('[Room] Data received:', data.type, 'from', participant?.identity);

                if (data.type === 'mode') {
                    setViewMode(data.mode);
                    console.log('[Room] View mode updated to:', data.mode);
                }
                else if (data.type === 'lock') {
                    setLocked(data.locked);
                }
            } catch (err) {
                console.error('[Room] Error decoding message:', err);
            }
        };

        room.on(RoomEvent.DataReceived, handleData);
        return () => room.off(RoomEvent.DataReceived, handleData);
    }, [room, localParticipant]);

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
    const showBoard = viewMode === 'BOARD' || viewMode === 'SCREEN_SHARE';

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
                </div>

                <div className="flex items-center gap-2">
                    {isProf && (
                        <>
                            <Button variant={locked ? 'destructive' : 'ghost'} size="sm" onClick={toggleLock}>
                                {locked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                            </Button>
                            <Button variant={viewMode === 'BOARD' ? 'default' : 'ghost'} size="sm" onClick={toggleWhiteboard}>
                                <PenTool className="w-4 h-4 mr-1" /> Tableau
                            </Button>
                            <Button variant={screenSharing ? 'default' : 'ghost'} size="sm" onClick={toggleScreenShare}>
                                {screenSharing ? <><MonitorOff className="w-4 h-4 mr-1" /> Stop</> : <><Monitor className="w-4 h-4 mr-1" /> Écran</>}
                            </Button>
                        </>
                    )}
                    <Button variant={chatOpen ? 'default' : 'ghost'} size="sm" onClick={() => setChatOpen(!chatOpen)}>
                        <MessageSquare className="w-4 h-4 mr-1" /> Chat
                    </Button>
                    <ScreenshotButton sessionId={sessionId} courseId={courseId} />
                </div>
            </div>

            {/* Main Area */}
            <div className="flex-1 flex overflow-hidden relative">
                {/* VIDEO-ONLY Mode */}
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

                {/* BOARD / SCREEN_SHARE Mode */}
                {showBoard && (
                    <>
                        <div className="flex-1 relative">
                            {viewMode === 'SCREEN_SHARE' && activeScreenTrack && (
                                <div className="absolute inset-0 z-0">
                                    <VideoTrack trackRef={activeScreenTrack} className="w-full h-full object-contain bg-black" />
                                </div>
                            )}
                            <div className={`absolute inset-0 ${viewMode === 'SCREEN_SHARE' ? 'z-10' : 'z-0'}`}>
                                <Whiteboard localParticipant={localParticipant} locked={locked && !isProf} transparent={viewMode === 'SCREEN_SHARE'} />
                            </div>
                        </div>

                        {/* Side Video Column */}
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
                        </div>
                    </>
                )}

                {chatOpen && <ChatPanel localParticipant={localParticipant} user={user} onClose={() => setChatOpen(false)} />}
            </div>

            {/* Bottom Controls */}
            <div className="h-16 glass-strong border-t flex items-center justify-center gap-3 shrink-0">
                <Button variant={videoEnabled ? 'secondary' : 'destructive'} size="icon" className="rounded-full w-12 h-12" onClick={toggleVideo}>
                    {videoEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
                </Button>
                <Button variant={audioEnabled ? 'secondary' : 'destructive'} size="icon" className="rounded-full w-12 h-12" onClick={toggleAudio}>
                    {audioEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
                </Button>
                <Button variant="destructive" size="icon" className="rounded-full w-12 h-12" onClick={onLeave}>
                    <X className="w-5 h-5" />
                </Button>
            </div>
        </div>
    );
}

// ======================================================
// WHITEBOARD
// ======================================================
function Whiteboard({ localParticipant, locked, transparent }) {
    const room = useRoomContext();
    const canvasRef = useRef(null);
    const wrapperRef = useRef(null);
    const [tool, setTool] = useState('pen');
    const [color, setColor] = useState(COLORS[3]);
    const [thickness, setThickness] = useState(3);
    const [background, setBackground] = useState('white');
    const [isDrawing, setIsDrawing] = useState(false);
    const lastPoint = useRef(null);
    const shapeStartRef = useRef(null);
    const [remoteText, setRemoteText] = useState(null);
    const [textInput, setTextInput] = useState(null);
    const textRef = useRef(null);
    const imageInputRef = useRef(null);

    // Initial resize
    useEffect(() => {
        const handleResize = () => {
            const canvas = canvasRef.current;
            if (!canvas || !wrapperRef.current) return;
            const rect = wrapperRef.current.getBoundingClientRect();

            // Save current content
            const tmpCanvas = document.createElement('canvas');
            tmpCanvas.width = canvas.width;
            tmpCanvas.height = canvas.height;
            tmpCanvas.getContext('2d').drawImage(canvas, 0, 0);

            canvas.width = rect.width;
            canvas.height = rect.height;

            // Restore content
            canvas.getContext('2d').drawImage(tmpCanvas, 0, 0);
        };
        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Helper: Send Data
    const sendData = async (payload) => {
        if (!room || !localParticipant) return;
        try {
            const encoded = new TextEncoder().encode(JSON.stringify(payload));
            await localParticipant.publishData(encoded, DataPacket_Kind.RELIABLE);
        } catch (e) {
            console.error('[Whiteboard] Send failed:', e);
        }
    };

    // Helper: Apply Drawing
    const applyDrawing = (data) => {
        const canvas = canvasRef.current;
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
        } else if (data.tool === 'text') {
            ctx.globalCompositeOperation = 'source-over';
            ctx.fillStyle = data.color;
            ctx.font = `${data.thickness * 6}px Inter, sans-serif`;
            ctx.fillText(data.text, data.x1, data.y1);
        }
        ctx.restore();
    };

    const applyImage = (data) => {
        const canvas = canvasRef.current;
        const img = new Image();
        img.onload = () => {
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, data.x, data.y, data.w, data.h);
        };
        img.src = data.src;
    };

    const clearCanvas = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    };

    // Listen
    useEffect(() => {
        if (!room) return;
        const handler = (payload, participant) => {
            if (participant?.identity === localParticipant?.identity) return;
            try {
                const data = JSON.parse(new TextDecoder().decode(payload));
                if (data.type === 'draw') applyDrawing(data);
                else if (data.type === 'clear') clearCanvas();
                else if (data.type === 'text-live') setRemoteText({ x: data.x1, y: data.y1, text: data.text, color: data.color, size: data.thickness * 6 });
                else if (data.type === 'text-commit') { applyDrawing(data); setRemoteText(null); }
                else if (data.type === 'image') applyImage(data);
            } catch (e) { }
        };
        room.on(RoomEvent.DataReceived, handler);
        return () => room.off(RoomEvent.DataReceived, handler);
    }, [room, localParticipant]);

    // Pointer Handlers
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

        if (tool === 'text') {
            setTextInput(pos);
            setTimeout(() => textRef.current?.focus(), 50);
            return;
        }
        if (tool === 'image') {
            imageInputRef.current?.click();
            return;
        }

        setIsDrawing(true);
        lastPoint.current = pos;
        if (['line', 'rect', 'circle'].includes(tool)) shapeStartRef.current = pos;
    };

    const handlePointerMove = (e) => {
        if (!isDrawing || locked) return;
        const pos = getPos(e);

        if (tool === 'pen' || tool === 'eraser') {
            const drawData = {
                type: 'draw',
                tool, x1: lastPoint.current.x, y1: lastPoint.current.y,
                x2: pos.x, y2: pos.y, color,
                thickness: tool === 'eraser' ? thickness * 5 : thickness,
            };
            applyDrawing(drawData);
            sendData(drawData);
            lastPoint.current = pos;
        }
    };

    const handlePointerUp = (e) => {
        if (!isDrawing || locked) return;
        setIsDrawing(false);
        const pos = getPos(e.changedTouches ? e.changedTouches[0] : e);

        if (['line', 'rect', 'circle'].includes(tool) && shapeStartRef.current) {
            const drawData = {
                type: 'draw', tool,
                x1: shapeStartRef.current.x, y1: shapeStartRef.current.y,
                x2: pos.x, y2: pos.y, color, thickness
            };
            applyDrawing(drawData);
            sendData(drawData);
            shapeStartRef.current = null;
        }
    };

    return (
        <div className="h-full flex">
            {/* Toolbar */}
            <div className="w-14 bg-gray-100 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 flex flex-col items-center py-3 gap-1 shrink-0 z-20">
                {TOOLS.map(t => (
                    <button
                        key={t.id}
                        onClick={() => { setTool(t.id); if (t.id === 'image') imageInputRef.current?.click(); }}
                        className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${tool === t.id ? 'bg-primary text-white shadow' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800'}`}
                    >
                        <t.icon className="w-5 h-5" />
                    </button>
                ))}

                <div className="w-8 border-t border-gray-300 dark:border-gray-600 my-2" />

                {COLORS.map(c => (
                    <button
                        key={c} onClick={() => setColor(c)}
                        className={`w-7 h-7 rounded-full border-2 transition-transform ${color === c ? 'border-primary scale-110' : 'border-gray-300 dark:border-gray-600'}`}
                        style={{ backgroundColor: c }}
                    />
                ))}

                <div className="w-8 border-t border-gray-300 dark:border-gray-600 my-2" />

                <input type="range" min={1} max={10} value={thickness} onChange={e => setThickness(parseInt(e.target.value))} className="w-10 rotate-[-90deg] mt-4 mb-4" />

                <div className="w-8 border-t border-gray-300 dark:border-gray-600 my-2" />

                {!transparent && Object.entries(BG_STYLES).map(([id, bg]) => (
                    <button
                        key={id} onClick={() => setBackground(id)}
                        className={`w-8 h-8 rounded border-2 transition-colors ${background === id ? 'border-primary' : 'border-gray-300 dark:border-gray-600'}`}
                        style={{ background: id === 'white' ? '#fff' : id === 'grid' ? '#f0f0f0' : '#f5f0e8' }}
                    >
                        {id === 'grid' && <Grid3X3 className="w-4 h-4 text-gray-400 mx-auto" />}
                    </button>
                ))}

                <div className="mt-auto" />
                <button onClick={() => { if (confirm('Tout effacer ?')) { clearCanvas(); sendData({ type: 'clear' }); } }} className="w-10 h-10 rounded-lg text-red-500 hover:bg-red-100 flex items-center justify-center">
                    <Trash2 className="w-5 h-5" />
                </button>
            </div>

            {/* Canvas */}
            <div ref={wrapperRef} className="flex-1 relative overflow-hidden"
                style={{ background: transparent ? 'transparent' : BG_STYLES[background]?.css || 'white' }}>
                <canvas
                    ref={canvasRef}
                    className="absolute inset-0 w-full h-full"
                    style={{ cursor: locked ? 'not-allowed' : tool === 'eraser' ? 'cell' : 'crosshair' }}
                    onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerLeave={() => setIsDrawing(false)}
                    onTouchStart={handlePointerDown} onTouchMove={handlePointerMove} onTouchEnd={handlePointerUp}
                />

                {textInput && (
                    <input
                        ref={textRef}
                        type="text"
                        autoFocus
                        className="absolute z-30 bg-transparent border-b-2 border-primary outline-none"
                        style={{ left: textInput.x, top: textInput.y, color, fontSize: thickness * 6, fontFamily: 'Inter, sans-serif', minWidth: 60 }}
                        onKeyDown={e => {
                            if (e.key === 'Enter') {
                                const drawData = { type: 'text-commit', tool: 'text', x1: textInput.x, y1: textInput.y + thickness * 6, color, thickness, text: e.target.value };
                                applyDrawing(drawData); sendData(drawData); setTextInput(null);
                            } else if (e.key === 'Escape') setTextInput(null);
                            else setTimeout(() => sendData({ type: 'text-live', x1: textInput.x, y1: textInput.y, text: e.target.value + e.key, color, thickness }), 0);
                        }}
                        onBlur={e => {
                            if (e.target.value) {
                                const drawData = { type: 'text-commit', tool: 'text', x1: textInput.x, y1: textInput.y + thickness * 6, color, thickness, text: e.target.value };
                                applyDrawing(drawData); sendData(drawData);
                            }
                            setTextInput(null);
                        }}
                    />
                )}

                {remoteText && (
                    <span className="absolute pointer-events-none opacity-60 z-30" style={{ left: remoteText.x, top: remoteText.y, color: remoteText.color, fontSize: remoteText.size, fontFamily: 'Inter, sans-serif' }}>
                        {remoteText.text}
                    </span>
                )}
                <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                        const img = new Image();
                        img.onload = () => {
                            const w = Math.min(img.width, 400); const h = img.height * (w / img.width);
                            const x = (canvasRef.current.width - w) / 2; const y = (canvasRef.current.height - h) / 2;
                            canvasRef.current.getContext('2d').drawImage(img, x, y, w, h);
                            sendData({ type: 'image', src: ev.target.result, x, y, w, h });
                        };
                        img.src = ev.target.result;
                    };
                    reader.readAsDataURL(file);
                    e.target.value = '';
                }} />
            </div>
        </div>
    );
}

// ======================================================
// CHAT PANEL
// ======================================================
function ChatPanel({ localParticipant, user, onClose }) {
    const room = useRoomContext();
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const messagesEndRef = useRef(null);

    useEffect(() => {
        if (!room) return;
        const handler = (payload, participant) => {
            if (participant?.identity === localParticipant?.identity) return;
            try {
                const data = JSON.parse(new TextDecoder().decode(payload));
                if (data.type === 'chat') {
                    setMessages(prev => [...prev, { sender: data.senderName, text: data.text, time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }), isMe: false }]);
                }
            } catch (e) { }
        };
        room.on(RoomEvent.DataReceived, handler);
        return () => room.off(RoomEvent.DataReceived, handler);
    }, [room, localParticipant]);

    useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

    const sendMessage = async (e) => {
        e.preventDefault();
        if (!input.trim() || !room) return;
        const msg = { type: 'chat', text: input, senderName: user.name };
        try {
            await localParticipant.publishData(new TextEncoder().encode(JSON.stringify(msg)), DataPacket_Kind.RELIABLE);
            setMessages(prev => [...prev, { sender: user.name, text: input, time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }), isMe: true }]);
            setInput('');
        } catch (e) { console.error('Chat failed:', e); }
    };

    return (
        <div className="w-80 border-l border-border flex flex-col bg-background shrink-0">
            <div className="h-10 px-4 flex items-center justify-between border-b">
                <span className="text-sm font-medium">Chat</span>
                <button onClick={onClose}><X className="w-4 h-4" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.map((msg, i) => (
                    <div key={i} className={`flex flex-col ${msg.isMe ? 'items-end' : 'items-start'}`}>
                        <span className="text-[10px] text-muted-foreground mb-0.5">{msg.sender} • {msg.time}</span>
                        <div className={`px-3 py-2 rounded-lg text-sm max-w-[85%] ${msg.isMe ? 'bg-primary text-white' : 'bg-secondary'}`}>{msg.text}</div>
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </div>
            <form onSubmit={sendMessage} className="p-3 border-t flex gap-2">
                <input value={input} onChange={e => setInput(e.target.value)} placeholder="Message..." className="flex-1 h-9 rounded-lg bg-secondary/50 border border-input px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
                <Button type="submit" size="icon" className="h-9 w-9 shrink-0"><Send className="w-4 h-4" /></Button>
            </form>
        </div>
    );
}

// ======================================================
// SCREENSHOT BUTTON
// ======================================================
function ScreenshotButton({ sessionId, courseId }) {
    const [saving, setSaving] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [captureName, setCaptureName] = useState('');
    const capturedDataRef = useRef(null);

    const takeScreenshot = () => {
        const canvas = document.querySelector('canvas');
        if (!canvas) return;
        capturedDataRef.current = canvas.toDataURL('image/png');
        const now = new Date();
        setCaptureName(`Capture ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`);
        setShowModal(true);
    };

    const confirmSave = async () => {
        if (!capturedDataRef.current) return;
        setSaving(true);
        try {
            await api.post('/room/screenshot', { imageData: capturedDataRef.current, sessionId, courseId, name: captureName });
        } catch (err) { console.error('Screenshot failed:', err); }
        setSaving(false);
        setShowModal(false);
    };

    return (
        <>
            <Button variant="ghost" size="sm" onClick={takeScreenshot} disabled={saving}><Camera className="w-4 h-4 mr-1" /> {saving ? '...' : '📸'}</Button>
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className="bg-background rounded-xl border p-6 w-96 shadow-2xl">
                        <h3 className="text-lg font-semibold mb-4">Nommer la capture</h3>
                        <input value={captureName} onChange={e => setCaptureName(e.target.value)} className="w-full h-10 rounded-lg bg-secondary/50 border border-input px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary mb-4" autoFocus onKeyDown={e => e.key === 'Enter' && confirmSave()} />
                        <div className="flex justify-end gap-2">
                            <Button variant="ghost" onClick={() => setShowModal(false)}>Annuler</Button>
                            <Button onClick={confirmSave} disabled={saving}>{saving ? 'Enregistrement...' : 'Enregistrer'}</Button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
