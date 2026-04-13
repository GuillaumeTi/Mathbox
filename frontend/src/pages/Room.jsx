import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/lib/api';
import HomeworkModal from '../components/HomeworkModal';
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
    Eraser, Type, Square, Circle, Minus, Triangle, Camera, Trash2,
    Lock, Unlock, MessageSquare, Send, X, Grid3X3,
    Monitor, MonitorOff, ImagePlus, Cloud, Folder, ChevronRight, File, Paperclip, Download, BookOpen,
    Plus, Edit3, AlertTriangle, ZoomIn, ZoomOut, FileDown, FileUp, CheckSquare, Hand, MousePointer2,
    LayoutTemplate, Loader2
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import katex from 'katex';
import 'katex/dist/katex.min.css';

const genId = () => Math.random().toString(36).substring(2, 10);
const makeTab = (n, id = null) => ({ id: id || genId(), title: `Board ${n}`, canvasData: null, background: 'white', images: [], mathObjects: [] });

const COLORS = ['#000000', '#ef4444', '#22c55e', '#3b82f6', '#f59e0b', '#8b5cf6'];

const BG_STYLES = {
    white: { label: 'Blanc', style: { backgroundColor: 'white' } },
    grid: {
        label: 'Grille',
        style: {
            backgroundColor: 'white',
            backgroundImage: 'linear-gradient(#e5e7eb 1px, transparent 1px), linear-gradient(90deg, #e5e7eb 1px, transparent 1px)',
            backgroundSize: '25px 25px',
            backgroundPosition: '0 0'
        }
    },
    seyes: {
        label: 'Seyès',
        style: {
            backgroundColor: '#f5f0e8',
            backgroundImage: `linear-gradient(90deg, #f0c0c0 1px, transparent 1px), linear-gradient(#9b8ec4 1px, transparent 1px), linear-gradient(#c8b8e8 0.5px, transparent 0.5px)`,
            backgroundSize: '100% 100%, 100% 32px, 100% 8px',
            backgroundPosition: '0 0, 0 0, 0 0'
        }
    },
};

const TOOLS = [
    { id: 'move', icon: Hand, label: 'Déplacer' },
    { id: 'pen', icon: PenTool, label: 'Stylo' },
    { id: 'eraser', icon: Eraser, label: 'Gomme' },
    { id: 'line', icon: Minus, label: 'Ligne' },
    { id: 'rect', icon: Square, label: 'Rectangle' },
    { id: 'circle', icon: Circle, label: 'Cercle' },
    { id: 'triangle', icon: Triangle, label: 'Triangle' },
    { id: 'text', icon: Type, label: 'Texte', hasSubMenu: true },
    { id: 'imgselect', icon: MousePointer2, label: 'Sél. image' },
    { id: 'image', icon: ImagePlus, label: 'Image' },
];

// Render KaTeX string for live preview (safe)
function renderKatexPreview(latex) {
    try {
        return katex.renderToString(latex, { throwOnError: false, displayMode: true, output: 'html' });
    } catch {
        return '<span style="color:red;">Erreur de syntaxe</span>';
    }
}

// Virtual canvas dimensions — large fixed size for infinite-feeling board
const CANVAS_W = 4000;
const CANVAS_H = 3000;

class ErrorBoundary extends React.Component {
    constructor(props) { super(props); this.state = { hasError: false, error: null }; }
    static getDerivedStateFromError(error) { return { hasError: true, error }; }
    componentDidCatch(error, errorInfo) { console.error("RoomContent Error:", error, errorInfo); }
    render() {
        if (this.state.hasError) {
            return <div className="p-4 text-red-500 bg-red-100 rounded m-4"><h2>Something went wrong in RoomContent.</h2><pre>{this.state.error?.toString()}</pre></div>;
        }
        return this.props.children;
    }
}

// ===== PREP BOARD (Solo mode without students) =====
export function PrepBoard() {
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
            } catch (err) { setError(err.message); }
            setLoading(false);
        }
        fetchToken();
    }, [courseCode]);

    if (loading) return <div className="min-h-screen flex items-center justify-center">Chargement...</div>;
    if (error) return (
        <div className="min-h-screen flex items-center justify-center p-4">
            <div className="bg-card rounded-xl border border-red-500/20 p-8 text-center space-y-4">
                <AlertTriangle className="w-8 h-8 text-red-500 mx-auto" />
                <p className="text-muted-foreground">{error}</p>
                <Button variant="outline" onClick={() => navigate('/dashboard')}><ArrowLeft className="w-4 h-4 mr-2" /> Dashboard</Button>
            </div>
        </div>
    );

    return (
        <LiveKitRoom
            serverUrl={connectionInfo.url}
            token={connectionInfo.token}
            connect={true}
            className="min-h-screen bg-background"
            data-lk-theme="default"
        >
            <RoomAudioRenderer />
            <ErrorBoundary>
                <RoomContent
                    courseCode={courseCode}
                    sessionId={connectionInfo.sessionId}
                    courseId={connectionInfo.courseId}
                    user={user}
                    initialWhiteboardState={connectionInfo.whiteboardState}
                    prepMode={true}
                    onLeave={() => navigate('/dashboard')}
                />
            </ErrorBoundary>
        </LiveKitRoom>
    );
}

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
            } catch (err) { setError(err.message); }
            setLoading(false);
        }
        fetchToken();
    }, [courseCode]);

    if (loading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
    if (error) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background/50 p-4">
                <div className="bg-card text-card-foreground shadow-sm rounded-xl border border-red-500/20 p-8 max-w-md w-full text-center space-y-4">
                    <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-2">
                        <AlertTriangle className="w-8 h-8 text-red-500" />
                    </div>
                    <h2 className="text-xl font-bold">Accès refusé</h2>
                    <p className="text-muted-foreground">{error}</p>
                    <Button
                        variant="outline"
                        className="mt-6 w-full"
                        onClick={() => navigate((user?.role === 'PROFESSOR' || user?.role === 'PROF') ? '/dashboard' : user?.role === 'PARENT' ? '/parent' : '/student')}
                    >
                        <ArrowLeft className="w-4 h-4 mr-2" /> Quitter
                    </Button>
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
            <ErrorBoundary>
                <RoomContent
                    courseCode={courseCode}
                    sessionId={connectionInfo.sessionId}
                    courseId={connectionInfo.courseId}
                    user={user}
                    initialWhiteboardState={connectionInfo.whiteboardState}
                    onLeave={() => navigate(user.role === 'PROFESSOR' ? '/dashboard' : '/student')}
                />
            </ErrorBoundary>
        </LiveKitRoom>
    );
}

function RoomContent({ courseCode, sessionId, courseId, user, initialWhiteboardState, onLeave, prepMode = false }) {
    const room = useRoomContext();
    const { localParticipant } = useLocalParticipant();
    const [messages, setMessages] = useState([]);
    const allCameraTracks = useTracks([Track.Source.Camera], { onlySubscribed: false });
    const screenShareTracks = useTracks([Track.Source.ScreenShare], { onlySubscribed: false });
    const [viewMode, setViewMode] = useState('BOARD'); // prep mode always BOARD
    const [chatOpen, setChatOpen] = useState(false);
    const [locked, setLocked] = useState(false);
    const [screenSharing, setScreenSharing] = useState(false);
    const [videoEnabled, setVideoEnabled] = useState(false);
    const [audioEnabled, setAudioEnabled] = useState(false);
    const isProf = user.role === 'PROFESSOR';

    // Audio recording state — Web Audio API mixer for local + remote audio
    const [isRecording, setIsRecording] = useState(false);
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    const audioContextRef = useRef(null);
    const mixerDestinationRef = useRef(null);
    const localSourceRef = useRef(null);
    const remoteSourcesRef = useRef(new Map()); // trackSid -> { source, stream }
    const localMicStreamRef = useRef(null);
    const sessionStartRef = useRef(new Date());

    // Post-room validation modal
    const [showValidateModal, setShowValidateModal] = useState(false);
    const [validating, setValidating] = useState(false);
    const [sessionDuration, setSessionDuration] = useState(0);
    const [validationResult, setValidationResult] = useState(null); // null | { billingMode, invoiceGenerated }
    const [courseHourlyRate, setCourseHourlyRate] = useState(null); // Fetched from course config
    const [savingLeave, setSavingLeave] = useState(false);

    // Fetch course's configured hourly rate (for prof)
    useEffect(() => {
        if (!isProf || !courseId) return;
        api.get(`/courses/${courseId}`)
            .then(data => {
                if (data.course?.hourlyRate != null) {
                    setCourseHourlyRate(data.course.hourlyRate);
                }
            })
            .catch(() => {}); // Silently fail — rate just stays null
    }, [isProf, courseId]);

    // ===== TAB STATE =====
    const initTabs = () => {
        if (initialWhiteboardState && Array.isArray(initialWhiteboardState) && initialWhiteboardState.length > 0) {
            return initialWhiteboardState;
        }
        return [makeTab(1, 'default-board-1')];
    };
    const [tabs, setTabs] = useState(initTabs);
    const [activeTabId, setActiveTabId] = useState(() => tabs[0]?.id || initTabs()[0].id);
    const whiteboardRef = useRef(null); // ref to get canvas snapshot
    const saveTimerRef = useRef(null);

    // ===== PERSISTENCE (Prof only) =====
    const saveWhiteboard = useCallback(async (tabsToSave) => {
        if (!isProf) return;
        try {
            // Get current canvas snapshot from Whiteboard component
            let currentTabs = tabsToSave || tabs;
            if (whiteboardRef.current?.getCanvasSnapshot) {
                const snapshot = whiteboardRef.current.getCanvasSnapshot();
                currentTabs = currentTabs.map(t => t.id === activeTabId ? { ...t, canvasData: snapshot } : t);
            }
            await api.post(`/room/whiteboard/${courseId}`, { tabs: currentTabs });
        } catch (e) { console.error('[Whiteboard] Save failed:', e); }
    }, [isProf, tabs, activeTabId, courseId]);

    const debouncedSave = useCallback(() => {
        if (!isProf) return;
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => saveWhiteboard(), 2000);
    }, [saveWhiteboard, isProf]);

    // Periodic auto-save every 30s (lightens the final save on leave)
    useEffect(() => {
        if (!isProf) return;
        const interval = setInterval(() => saveWhiteboard(), 30000);
        return () => clearInterval(interval);
    }, [isProf, saveWhiteboard]);

    // Save on leave
    const handleLeave = useCallback(async () => {
        if (isProf) {
            setSavingLeave(true);
            setTimeout(async () => {
                await saveWhiteboard();
                if (prepMode) { onLeave(); return; }
                // Stop recording if active
                if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
                    mediaRecorderRef.current.stop();
                }
                // Calculate session duration in minutes
                const durationMinutes = Math.round((new Date() - sessionStartRef.current) / 60000);
                setSessionDuration(durationMinutes);
                setSavingLeave(false);
                setShowValidateModal(true);
            }, 50);
            return; // Don't navigate yet
        }
        onLeave();
    }, [isProf, saveWhiteboard, onLeave, prepMode]);

    const confirmLeave = async (generateAIReport, durationMinutes) => {
        setValidating(true);
        try {
            const result = await api.post('/room/validate-session', {
                courseId,
                sessionId,
                durationMinutes: parseFloat(durationMinutes) || sessionDuration,
                hasAudioRecording: audioChunksRef.current.length > 0,
                generateAIReport,
                hourlyRate: courseHourlyRate ?? 0,
            });
            // Show result instead of immediately leaving
            setValidationResult(result);
        } catch (err) {
            console.error('[Room] Session validation error:', err);
            // Even on error, show result and let user leave
            setValidationResult({ error: err.message });
        }
        setValidating(false);
        // Don't navigate yet — show result banner first
    };

    const leaveAfterResult = () => {
        onLeave();
    };

    const skipAndLeave = () => {
        onLeave();
    };

    // Tab import handler
    const importTabs = useCallback((importedTabs) => {
        if (!isProf) return;
        // Always generate fresh IDs for imported tabs to avoid collisions
        const newTabs = importedTabs.map(t => ({ ...t, id: genId(), images: t.images || [] }));
        setTabs(prev => [...prev, ...newTabs]);
        setActiveTabId(newTabs[0].id);
        debouncedSave();
    }, [isProf, debouncedSave]);

    // ===== AUDIO RECORDING — Web Audio API mixer (local mic + remote tracks) =====
    // Attach/detach remote audio tracks to the mixer whenever they appear/disappear
    useEffect(() => {
        if (!isRecording || !audioContextRef.current || !mixerDestinationRef.current) return;
        if (!room) return;

        const ctx = audioContextRef.current;
        const dest = mixerDestinationRef.current;

        const attachRemoteTrack = (track) => {
            if (track.kind !== 'audio') return;
            const sid = track.sid || track.mediaStreamTrack?.id;
            if (!sid || remoteSourcesRef.current.has(sid)) return;
            try {
                const ms = new MediaStream([track.mediaStreamTrack]);
                const source = ctx.createMediaStreamSource(ms);
                source.connect(dest);
                remoteSourcesRef.current.set(sid, { source, stream: ms });
                console.log('[Recording] Remote audio track attached:', sid);
            } catch (e) {
                console.error('[Recording] Failed to attach remote track:', e);
            }
        };

        const detachRemoteTrack = (track) => {
            const sid = track.sid || track.mediaStreamTrack?.id;
            if (!sid) return;
            const entry = remoteSourcesRef.current.get(sid);
            if (entry) {
                try { entry.source.disconnect(); } catch (_) {}
                remoteSourcesRef.current.delete(sid);
                console.log('[Recording] Remote audio track detached:', sid);
            }
        };

        // Attach any existing remote audio tracks
        for (const p of room.remoteParticipants.values()) {
            for (const pub of p.audioTrackPublications.values()) {
                if (pub.track && pub.isSubscribed) attachRemoteTrack(pub.track);
            }
        }

        const onTrackSubscribed = (track) => attachRemoteTrack(track);
        const onTrackUnsubscribed = (track) => detachRemoteTrack(track);

        room.on(RoomEvent.TrackSubscribed, onTrackSubscribed);
        room.on(RoomEvent.TrackUnsubscribed, onTrackUnsubscribed);

        return () => {
            room.off(RoomEvent.TrackSubscribed, onTrackSubscribed);
            room.off(RoomEvent.TrackUnsubscribed, onTrackUnsubscribed);
        };
    }, [isRecording, room]);

    const startRecording = async () => {
        try {
            // 1. Create AudioContext + mixer destination
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const dest = ctx.createMediaStreamDestination();
            audioContextRef.current = ctx;
            mixerDestinationRef.current = dest;

            // 2. Get local microphone and connect to mixer
            const localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            localMicStreamRef.current = localStream;
            const localSource = ctx.createMediaStreamSource(localStream);
            localSource.connect(dest);
            localSourceRef.current = localSource;

            // 3. Attach any already-subscribed remote audio tracks
            if (room) {
                for (const p of room.remoteParticipants.values()) {
                    for (const pub of p.audioTrackPublications.values()) {
                        if (pub.track && pub.isSubscribed && pub.track.kind === 'audio') {
                            const sid = pub.track.sid || pub.track.mediaStreamTrack?.id;
                            if (sid && !remoteSourcesRef.current.has(sid)) {
                                try {
                                    const ms = new MediaStream([pub.track.mediaStreamTrack]);
                                    const src = ctx.createMediaStreamSource(ms);
                                    src.connect(dest);
                                    remoteSourcesRef.current.set(sid, { source: src, stream: ms });
                                } catch (_) {}
                            }
                        }
                    }
                }
            }

            // 4. Record the mixed output
            const mediaRecorder = new MediaRecorder(dest.stream, { mimeType: 'audio/webm' });
            audioChunksRef.current = [];
            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) audioChunksRef.current.push(e.data);
            };
            mediaRecorder.onstop = async () => {
                // Cleanup audio graph
                try { localSourceRef.current?.disconnect(); } catch (_) {}
                for (const [, entry] of remoteSourcesRef.current) {
                    try { entry.source.disconnect(); } catch (_) {}
                }
                remoteSourcesRef.current.clear();
                localMicStreamRef.current?.getTracks().forEach(t => t.stop());
                try { audioContextRef.current?.close(); } catch (_) {}
                audioContextRef.current = null;
                mixerDestinationRef.current = null;

                // Upload the combined recording
                if (audioChunksRef.current.length > 0) {
                    const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                    const formData = new FormData();
                    formData.append('file', blob, 'session-recording-' + new Date().toISOString() + '.webm');
                    formData.append('courseId', courseId);
                    formData.append('sessionId', sessionId);
                    formData.append('type', 'RECORDING');
                    formData.append('source', 'session_full_recording');
                    try {
                        await api.upload('/documents/upload', formData);
                        console.log('[Recording] Full session audio uploaded');
                    } catch (err) {
                        console.error('[Recording] Audio upload failed:', err);
                    }
                }
            };
            mediaRecorderRef.current = mediaRecorder;
            mediaRecorder.start(1000); // Chunk every 1s
            setIsRecording(true);
            console.log('[Recording] Started — mixing local mic + remote audio');
        } catch (err) {
            console.error('[Recording] Failed to start:', err);
            alert('Impossible d\'accéder au micro pour l\'enregistrement');
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
            console.log('[Recording] Stopped');
        }
    };

    // ===== TAB ACTIONS (Prof only) =====
    const addTab = useCallback(() => {
        if (!isProf) return;
        const newTab = makeTab(tabs.length + 1);
        setTabs(prev => [...prev, newTab]);
        sendDataPacketFn({ type: 'tab-add', tab: { id: newTab.id, title: newTab.title, background: newTab.background } });
        debouncedSave();
    }, [isProf, tabs.length, debouncedSave]);

    const closeTab = useCallback((tabId) => {
        if (!isProf || tabs.length <= 1) return;
        
        let newActiveId = activeTabId;
        if (activeTabId === tabId) {
            newActiveId = tabs.find(t => t.id !== tabId)?.id || tabs[0].id;
        }

        setTabs(prev => prev.filter(t => t.id !== tabId));
        setActiveTabId(newActiveId);
        
        sendDataPacketFn({ type: 'tab-close', tabId });
        debouncedSave();
    }, [isProf, tabs, activeTabId, debouncedSave]);

    const renameTab = useCallback((tabId, title) => {
        if (!isProf) return;
        setTabs(prev => prev.map(t => t.id === tabId ? { ...t, title } : t));
        sendDataPacketFn({ type: 'tab-rename', tabId, title });
        debouncedSave();
    }, [isProf, debouncedSave]);

    const switchTab = useCallback((tabId) => {
        if (tabId === activeTabId) return;
        // Snapshot current canvas before switching
        try {
            if (whiteboardRef.current?.getCanvasSnapshot) {
                const currentSnapshot = whiteboardRef.current.getCanvasSnapshot();
                if (currentSnapshot) {
                    setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, canvasData: currentSnapshot } : t));
                }
            }
        } catch (e) {
            console.error("Failed to snapshot canvas before switching", e);
        }
        setActiveTabId(tabId);
        if (isProf) {
            // Broadcast tab switch - we DO NOT send fromCanvasData here because it violates WebRTC size limits.
            // Students will take their own local snapshot of the departing tab.
            sendDataPacketFn({ type: 'tab-switch', tabId, fromTabId: activeTabId });
            debouncedSave();
        }
    }, [activeTabId, isProf, debouncedSave]);

    const changeBackground = useCallback((tabId, bg) => {
        setTabs(prev => prev.map(t => t.id === tabId ? { ...t, background: bg } : t));
        debouncedSave();
    }, [debouncedSave]);

    // We need a ref-stable sendDataPacket for tab actions
    const sendDataPacketFnRef = useRef(null);
    const sendDataPacketFn = (...args) => sendDataPacketFnRef.current?.(...args);

    useEffect(() => {
        if (!localParticipant) return;
        const sync = () => {
            setVideoEnabled(localParticipant.isCameraEnabled);
            setAudioEnabled(localParticipant.isMicrophoneEnabled);
            setScreenSharing(localParticipant.isScreenShareEnabled);
        };
        sync();
        localParticipant.on('trackPublished', sync);
        localParticipant.on('localTrackPublished', sync);
        return () => { localParticipant.off('trackPublished', sync); localParticipant.off('localTrackPublished', sync); };
    }, [localParticipant]);

    // Send full tab state to late-joining students
    useEffect(() => {
        if (!room || !isProf) return;
        const handleNewParticipant = () => {
            // Force a DB save so the new student gets the latest drawings if they refresh
            saveWhiteboard();
            sendDataPacketFn({
                type: 'tab-sync',
                activeTabId,
                tabsInfo: tabs.map(t => ({ id: t.id, title: t.title, background: t.background, images: t.images || [], mathObjects: t.mathObjects || [] })), // No canvasData to respect WebRTC limits
            });
        };
        room.on(RoomEvent.ParticipantConnected, handleNewParticipant);
        return () => room.off(RoomEvent.ParticipantConnected, handleNewParticipant);
    }, [room, isProf, activeTabId, tabs]);

    const broadcastMode = useCallback(async (mode) => {
        setViewMode(mode);
        if (!room || !localParticipant) return;
        try { await localParticipant.publishData(new TextEncoder().encode(JSON.stringify({ type: 'mode', mode })), DataPacket_Kind.RELIABLE); } catch (e) { console.error(e); }
    }, [room, localParticipant]);

    const toggleScreenShare = async () => {
        if (!isProf) return;
        const next = !screenSharing;
        await localParticipant?.setScreenShareEnabled(next);
        setScreenSharing(next);
        broadcastMode(next ? 'SCREEN_SHARE' : 'VIDEO');
    };

    const toggleVideo = async () => { await localParticipant?.setCameraEnabled(!videoEnabled); setVideoEnabled(!videoEnabled); };
    const toggleAudio = async () => { await localParticipant?.setMicrophoneEnabled(!audioEnabled); setAudioEnabled(!audioEnabled); };

    const sendDataPacket = async (payload) => {
        if (!room || !localParticipant) return;
        try { await localParticipant.publishData(new TextEncoder().encode(JSON.stringify(payload)), DataPacket_Kind.RELIABLE); } catch (e) { console.error(e); }
    };
    sendDataPacketFnRef.current = sendDataPacket;

    const sendChatMessage = async (text) => {
        if (!text.trim()) return;
        const msg = { type: 'chat', text, senderName: user.name };
        await sendDataPacket(msg);
        setMessages(prev => [...prev, { ...msg, time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }), isMe: true }]);
    };

    const sendFileMessage = async (fileData) => {
        const msg = { type: 'file', ...fileData, senderName: user.name };
        await sendDataPacket(msg);
        setMessages(prev => [...prev, { ...msg, time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }), isMe: true }]);
    };

    const handleChatUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('courseId', courseId); // For structured path
            formData.append('sessionId', sessionId);
            formData.append('type', 'OTHER'); // Or generic
            formData.append('source', 'chat_attachment');

            const res = await api.upload('/documents/upload', formData);
            const doc = res.document;

            await sendFileMessage({
                text: doc.title,
                url: doc.url,
                filename: doc.title,
                size: doc.size,
                mimeType: doc.mimeType
            });

        } catch (err) {
            console.error('Chat upload failed:', err);
            alert('Upload failed');
        }
        e.target.value = '';
    };

    useEffect(() => {
        if (!room) return;
        const handleData = (payload, participant) => {
            if (participant?.identity === localParticipant?.identity) return;
            try {
                const data = JSON.parse(new TextDecoder().decode(payload));
                const time = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

                if (data.type === 'mode') setViewMode(data.mode);
                else if (data.type === 'lock') setLocked(data.locked);
                else if (data.type === 'chat') setMessages(prev => [...prev, { sender: data.senderName, text: data.text, time, isMe: false }]);
                else if (data.type === 'file') setMessages(prev => [...prev, { sender: data.senderName, text: data.filename, url: data.url, filename: data.filename, size: data.size, type: 'file', time, isMe: false }]);
                // Tab events (from teacher)
                else if (data.type === 'tab-sync') {
                    if (data.tabsInfo) {
                        setTabs(prev => {
                            // Merge incoming tabsInfo with our local canvasData
                            const nextTabs = data.tabsInfo.map(tInfo => {
                                const exist = prev.find(p => p.id === tInfo.id);
                                return { ...tInfo, canvasData: exist ? exist.canvasData : null };
                            });
                            return nextTabs;
                        });
                    }
                    setActiveTabId(data.activeTabId);
                }
                else if (data.type === 'tab-switch') {
                    // Store the STUDENT'S local canvas snapshot for the tab we just left
                    if (data.fromTabId) {
                        try {
                            const localSnapshot = whiteboardRef.current?.getCanvasSnapshot?.();
                            if (localSnapshot) {
                                setTabs(prev => prev.map(t => t.id === data.fromTabId ? { ...t, canvasData: localSnapshot } : t));
                            }
                        } catch (e) { console.error("Snapshot failed on remote tab-switch", e); }
                    }
                    setActiveTabId(data.tabId);
                }
                else if (data.type === 'background') {
                    setTabs(prev => prev.map(t => t.id === data.tabId ? { ...t, background: data.bg } : t));
                }
                else if (data.type === 'tab-add') setTabs(prev => [...prev, { ...data.tab, canvasData: null }]);
                else if (data.type === 'tab-close') setTabs(prev => {
                    const next = prev.filter(t => t.id !== data.tabId);
                    setActiveTabId(cur => cur === data.tabId ? next[0]?.id : cur);
                    return next;
                });
                else if (data.type === 'tab-rename') setTabs(prev => prev.map(t => t.id === data.tabId ? { ...t, title: data.title } : t));
            } catch (err) { console.error(err); }
        };
        room.on(RoomEvent.DataReceived, handleData);
        return () => room.off(RoomEvent.DataReceived, handleData);
    }, [room, localParticipant]);

    const remoteVideoTrack = allCameraTracks.find(t => t.source === Track.Source.Camera && t.participant?.identity !== localParticipant?.identity);
    const localVideoTrack = allCameraTracks.find(t => t.source === Track.Source.Camera && t.participant?.identity === localParticipant?.identity);
    const activeScreenTrack = screenShareTracks.find(t => t.participant?.identity === localParticipant?.identity) || screenShareTracks.find(t => t.participant?.identity !== localParticipant?.identity);
    const showBoard = viewMode === 'BOARD' || viewMode === 'SCREEN_SHARE';

    return (
        <div className="h-screen flex flex-col">
            <div className="h-12 glass-strong border-b flex items-center justify-between px-4 shrink-0">
                <div className="flex items-center gap-3">
                    <Button variant="ghost" size="sm" onClick={handleLeave}><ArrowLeft className="w-4 h-4 mr-1" /> {prepMode ? 'Dashboard' : 'Quitter'}</Button>
                    {prepMode ? (
                        <Badge className="text-xs bg-violet-500/20 text-violet-300 border-violet-500/30">
                            <LayoutTemplate className="w-3 h-3 mr-1" /> Préparation de tableau
                        </Badge>
                    ) : (
                        <Badge variant="success" className="text-xs"><span className="w-2 h-2 rounded-full bg-emerald-400 mr-1.5 animate-pulse" /> En direct</Badge>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    {isProf && !prepMode && (
                        <>
                            <Button variant={locked ? 'destructive' : 'ghost'} size="sm" onClick={async () => { const next = !locked; setLocked(next); await sendDataPacket({ type: 'lock', locked: next }); }}>{locked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}</Button>
                            <Button variant={viewMode === 'BOARD' ? 'default' : 'ghost'} size="sm" onClick={() => (viewMode === 'BOARD' ? broadcastMode('VIDEO') : broadcastMode('BOARD'))}><PenTool className="w-4 h-4 mr-1" /> Tableau</Button>
                            <Button variant={screenSharing ? 'default' : 'ghost'} size="sm" onClick={toggleScreenShare}>{screenSharing ? <><MonitorOff className="w-4 h-4 mr-1" />Stop</> : <><Monitor className="w-4 h-4 mr-1" /> Écran</>}</Button>
                        </>
                    )}
                    {!prepMode && <Button variant={chatOpen ? 'default' : 'ghost'} size="sm" onClick={() => setChatOpen(!chatOpen)}><MessageSquare className="w-4 h-4 mr-1" /> Chat</Button>}
                    <ScreenshotButton sessionId={sessionId} courseId={courseId} />
                    {isProf && !prepMode && <HomeworkButton courseId={courseId} />}
                </div>
            </div>
            <div className="flex-1 flex overflow-hidden relative">

                {!showBoard && (
                    <div className="flex-1 relative bg-black">
                        {remoteVideoTrack ? <VideoTrack trackRef={remoteVideoTrack} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><p className="text-muted-foreground">En attente...</p></div>}
                        {localVideoTrack && <div className="absolute bottom-4 right-4 w-48 h-36 rounded-lg overflow-hidden z-10 border-2 border-border shadow-xl"><VideoTrack trackRef={localVideoTrack} className="w-full h-full object-cover mirror" /></div>}
                    </div>
                )}
                {showBoard && (
                    <>
                        <div className="flex-1 flex flex-col relative">
                            {/* Tab Bar + Export/Import */}
                            <div className="flex items-stretch">
                                <TabBar tabs={tabs} activeTabId={activeTabId} isProf={isProf} onSwitch={switchTab} onAdd={addTab} onClose={closeTab} onRename={renameTab} />
                                <div className="bg-gray-900 border-b border-gray-700 flex items-center px-1 gap-1 shrink-0">
                                    <TabExportImportButtons tabs={tabs} onImport={importTabs} isProf={isProf} whiteboardRef={whiteboardRef} activeTabId={activeTabId} />
                                </div>
                            </div>
                            <div className="flex-1 relative">
                                {viewMode === 'SCREEN_SHARE' && activeScreenTrack && <div className="absolute inset-0 z-0"><VideoTrack trackRef={activeScreenTrack} className="w-full h-full object-contain bg-black" /></div>}
                                <div className={`absolute inset-0 ${viewMode === 'SCREEN_SHARE' ? 'z-10' : 'z-0'}`}>
                                    <Whiteboard
                                        ref={whiteboardRef}
                                        localParticipant={localParticipant}
                                        locked={locked && !isProf}
                                        transparent={viewMode === 'SCREEN_SHARE'}
                                        isProf={isProf}
                                        activeTabId={activeTabId}
                                        tabData={tabs.find(t => t.id === activeTabId)}
                                        onBackgroundChange={changeBackground}
                                        onImagesChange={(tabId, newImages) => {
                                            setTabs(prev => prev.map(t => t.id === tabId ? { ...t, images: newImages } : t));
                                            debouncedSave();
                                        }}
                                        onMathObjectsChange={(tabId, newMathObjects) => {
                                            setTabs(prev => prev.map(t => t.id === tabId ? { ...t, mathObjects: newMathObjects } : t));
                                            debouncedSave();
                                        }}
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="w-56 bg-gray-950 border-l border-border flex flex-col gap-2 p-2 shrink-0">
                            {remoteVideoTrack && <div className="w-full aspect-video rounded-lg overflow-hidden border border-border"><VideoTrack trackRef={remoteVideoTrack} className="w-full h-full object-cover" /></div>}
                            {localVideoTrack && <div className="w-full aspect-video rounded-lg overflow-hidden border border-border"><VideoTrack trackRef={localVideoTrack} className="w-full h-full object-cover mirror" /></div>}
                        </div>
                    </>
                )}
                {chatOpen && <ChatPanel messages={messages} onSendMessage={sendChatMessage} onClose={() => setChatOpen(false)} onFileUpload={handleChatUpload} />}
            </div>
            <div className="h-16 glass-strong border-t flex items-center justify-center gap-3 shrink-0">
                <Button variant={videoEnabled ? 'secondary' : 'destructive'} size="icon" className="rounded-full w-12 h-12" onClick={toggleVideo}>{videoEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}</Button>
                <Button variant={audioEnabled ? 'secondary' : 'destructive'} size="icon" className="rounded-full w-12 h-12" onClick={toggleAudio}>{audioEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}</Button>
                {isProf && (
                    <Button
                        variant={isRecording ? 'destructive' : 'secondary'}
                        size="icon"
                        className={`rounded-full w-12 h-12 ${isRecording ? 'animate-pulse' : ''}`}
                        onClick={isRecording ? stopRecording : startRecording}
                        title={isRecording ? 'Arrêter l\'enregistrement' : 'Enregistrer la session'}
                    >
                        <div className={`w-4 h-4 rounded-full ${isRecording ? 'bg-white' : 'bg-red-500'}`} />
                    </Button>
                )}
                <Button variant="destructive" size="icon" className="rounded-full w-12 h-12" onClick={handleLeave}><X className="w-5 h-5" /></Button>
            </div>

            {/* Post-Room Validation Modal */}
            {showValidateModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70">
                    <div className="bg-card rounded-2xl border border-border p-8 w-[480px] shadow-2xl space-y-5">

                                {/* STEP 1: Validation form */}
                        {!validationResult && (
                            <>
                                <div className="text-center">
                                    <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                                        <CheckSquare className="w-8 h-8 text-primary" />
                                    </div>
                                    <h2 className="text-xl font-bold">Valider le cours</h2>
                                </div>

                                {/* Duration input — default = timer value, but professor can override */}
                                <div className="space-y-2">
                                    <Label>Durée de la séance (minutes)</Label>
                                    <Input
                                        id="durationField"
                                        type="number"
                                        step="1"
                                        min="1"
                                        defaultValue={sessionDuration}
                                        placeholder="ex: 60"
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        Le chronomètre indique <strong>{sessionDuration} min</strong>. Ajustez si nécessaire.
                                    </p>
                                </div>

                                {/* Show locked hourly rate from course config */}
                                <div className="p-3 rounded-lg border border-border/50 bg-secondary/30 space-y-1">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-muted-foreground">Taux horaire configuré</span>
                                        {courseHourlyRate != null ? (
                                            <span className="font-semibold text-emerald-400">{courseHourlyRate} €/h 🔒</span>
                                        ) : (
                                            <span className="text-amber-400 text-xs">Non configuré — facture à 0 €</span>
                                        )}
                                    </div>
                                    {courseHourlyRate != null && (
                                        <div className="flex justify-between text-xs text-muted-foreground">
                                            <span>Coût estimé</span>
                                            <strong className="text-primary">
                                                {((sessionDuration / 60) * courseHourlyRate).toFixed(2)} €
                                            </strong>
                                        </div>
                                    )}
                                    <p className="text-xs text-muted-foreground/60">
                                        Selon le mode de facturation, une facture sera générée ou enregistrée pour la fin du mois.
                                    </p>
                                </div>

                                <div className="flex items-center gap-2 border p-3 rounded-lg border-primary/20 bg-primary/5">
                                    <input type="checkbox" id="generateAI" defaultChecked className="w-4 h-4 rounded text-primary cursor-pointer" />
                                    <Label htmlFor="generateAI" className="m-0 cursor-pointer font-medium">Générer le rapport IA (BETA)</Label>
                                </div>

                                <div className="flex gap-3">
                                    <Button variant="ghost" className="flex-1" onClick={skipAndLeave}>Passer</Button>
                                    <Button
                                        variant="glow"
                                        className="flex-1"
                                        disabled={validating}
                                        onClick={() => {
                                            const genAI = document.getElementById('generateAI')?.checked;
                                            const duration = document.getElementById('durationField')?.value;
                                            confirmLeave(genAI, duration);
                                        }}
                                    >
                                        {validating ? 'Validation...' : 'Valider et quitter'}
                                    </Button>
                                </div>
                            </>
                        )}

                        {/* STEP 2: Result banner */}
                        {validationResult && (
                            <>
                                {validationResult.error ? (
                                    <div className="text-center space-y-4">
                                        <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto">
                                            <AlertTriangle className="w-8 h-8 text-red-400" />
                                        </div>
                                        <h2 className="text-xl font-bold">Erreur lors de la validation</h2>
                                        <p className="text-sm text-muted-foreground">{validationResult.error}</p>
                                        <p className="text-xs text-muted-foreground">La séance a été enregistrée mais aucune facture n'a été générée.</p>
                                        <Button variant="glow" className="w-full" onClick={leaveAfterResult}>Quitter</Button>
                                    </div>
                                ) : validationResult.invoiceGenerated ? (
                                    <div className="text-center space-y-4">
                                        <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto">
                                            <CheckSquare className="w-8 h-8 text-emerald-400" />
                                        </div>
                                        <h2 className="text-xl font-bold">Cours validé !</h2>
                                        <div className="p-4 rounded-xl bg-secondary/40 border border-border space-y-1 text-sm text-left">
                                            <div className="flex justify-between">
                                                <span className="text-muted-foreground">Facture générée :</span>
                                                <strong>{validationResult.invoiceGenerated.invoiceNumber}</strong>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-muted-foreground">Heures couvertes par acompte :</span>
                                                <span className="text-emerald-400">{validationResult.invoiceGenerated.coveredHours?.toFixed(2)}h</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-muted-foreground">Heures à facturer :</span>
                                                <span className="text-amber-400">{validationResult.invoiceGenerated.uncoveredHours?.toFixed(2)}h</span>
                                            </div>
                                            <div className="flex justify-between font-bold text-base mt-1 pt-1 border-t border-border">
                                                <span>Total facturé :</span>
                                                <span className={validationResult.invoiceGenerated.amount <= 0 ? 'text-emerald-400' : 'text-primary'}>
                                                    {validationResult.invoiceGenerated.amount?.toFixed(2)} €
                                                    {validationResult.invoiceGenerated.status === 'PAID' && <span className="ml-2 text-xs font-normal text-emerald-400">(Payé par acompte)</span>}
                                                </span>
                                            </div>
                                        </div>
                                        <Button variant="glow" className="w-full" onClick={leaveAfterResult}>Quitter</Button>
                                    </div>
                                ) : (
                                    <div className="text-center space-y-4">
                                        <div className="w-16 h-16 rounded-full bg-violet-500/10 flex items-center justify-center mx-auto">
                                            <CheckSquare className="w-8 h-8 text-violet-400" />
                                        </div>
                                        <h2 className="text-xl font-bold">Cours enregistré !</h2>
                                        <p className="text-sm text-muted-foreground">
                                            {validationResult.billingMode === 'MONTHLY'
                                                ? 'La séance a été enregistrée. La facture de solde sera générée à la fin du mois ou manuellement depuis l\'onglet Facturation.'
                                                : 'La séance a été enregistrée. Aucun élève n\'est assigné à ce cours, donc aucune facture n\'a été générée.'}
                                        </p>
                                        <Button variant="glow" className="w-full" onClick={leaveAfterResult}>Quitter</Button>
                                    </div>
                                )}
                            </>
                        )}

                    </div>
                </div>
            )}

            {/* Prep mode saving overlay */}
            {savingLeave && (
                <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm">
                    <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" />
                    <p className="font-semibold text-lg text-foreground">Sauvegarde du tableau en cours...</p>
                </div>
            )}
        </div>
    );
}

// ===== TAB BAR COMPONENT =====
function TabBar({ tabs, activeTabId, isProf, onSwitch, onAdd, onClose, onRename }) {
    const [editingId, setEditingId] = useState(null);
    const [editVal, setEditVal] = useState('');
    const inputRef = useRef(null);

    useEffect(() => { if (editingId && inputRef.current) inputRef.current.focus(); }, [editingId]);

    const startRename = (tab) => {
        if (!isProf) return;
        setEditingId(tab.id);
        setEditVal(tab.title);
    };
    const commitRename = () => {
        if (editVal.trim() && editingId) onRename(editingId, editVal.trim());
        setEditingId(null);
    };

    return (
        <div className="h-9 bg-gray-900 border-b border-gray-700 flex items-center px-2 gap-1 shrink-0 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
            {tabs.map(tab => (
                <div
                    key={tab.id}
                    onClick={() => { if (isProf) onSwitch(tab.id); }}
                    className={`flex items-center gap-1.5 px-3 h-7 rounded-md text-xs font-medium transition-all whitespace-nowrap select-none ${isProf ? 'cursor-pointer' : 'cursor-default'
                        } ${tab.id === activeTabId
                            ? 'bg-primary text-white shadow-sm'
                            : `bg-gray-800 text-gray-400 ${isProf ? 'hover:bg-gray-700 hover:text-gray-200' : ''}`
                        }`}
                >
                    {editingId === tab.id ? (
                        <input
                            ref={inputRef}
                            value={editVal}
                            onChange={e => setEditVal(e.target.value)}
                            onBlur={commitRename}
                            onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setEditingId(null); }}
                            onClick={e => e.stopPropagation()}
                            className="bg-transparent border-b border-white/50 outline-none text-white text-xs w-20"
                        />
                    ) : (
                        <span onDoubleClick={(e) => { e.stopPropagation(); startRename(tab); }}>{tab.title}</span>
                    )}
                    {isProf && tabs.length > 1 && (
                        <button onClick={(e) => { e.stopPropagation(); onClose(tab.id); }} className="ml-1 opacity-60 hover:opacity-100 transition-opacity">
                            <X className="w-3 h-3" />
                        </button>
                    )}
                </div>
            ))}
            {isProf && (
                <button onClick={onAdd} className="w-7 h-7 rounded-md bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white flex items-center justify-center transition-colors shrink-0 ml-1">
                    <Plus className="w-3.5 h-3.5" />
                </button>
            )}
        </div>
    );
}

// ===== TAB BAR EXPORT/IMPORT =====
function TabExportImportButtons({ tabs, onImport, isProf, whiteboardRef, activeTabId }) {
    const handleExport = () => {
        // Snapshot current canvas before exporting
        let exportTabs = tabs;
        if (whiteboardRef?.current?.getCanvasSnapshot) {
            const snapshot = whiteboardRef.current.getCanvasSnapshot();
            exportTabs = tabs.map(t => t.id === activeTabId ? { ...t, canvasData: snapshot } : t);
        }
        const blob = new Blob([JSON.stringify(exportTabs, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'mathbox-boards-' + new Date().toISOString().split('T')[0] + '.json';
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleImport = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const data = JSON.parse(ev.target.result);
                if (Array.isArray(data) && data.length > 0) {
                    onImport(data);
                } else {
                    alert('Format invalide');
                }
            } catch {
                alert('Fichier JSON invalide');
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    if (!isProf) return null;
    return (
        <>
            <button onClick={handleExport} className="w-7 h-7 rounded-md bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white flex items-center justify-center transition-colors shrink-0" title="Exporter les tableaux">
                <FileDown className="w-3.5 h-3.5" />
            </button>
            <label className="w-7 h-7 rounded-md bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white flex items-center justify-center transition-colors shrink-0 cursor-pointer" title="Importer des tableaux">
                <FileUp className="w-3.5 h-3.5" />
                <input type="file" accept=".json" className="hidden" onChange={handleImport} />
            </label>
        </>
    );
}

// ===== WHITEBOARD COMPONENT =====
const Whiteboard = React.forwardRef(function Whiteboard({ localParticipant, locked, transparent, isProf, activeTabId, tabData, onBackgroundChange, onImagesChange, onMathObjectsChange }, ref) {
    const room = useRoomContext();
    const canvasRef = useRef(null);
    const previewCanvasRef = useRef(null);
    const wrapperRef = useRef(null);
    const [tool, setTool] = useState('pen');
    const [color, setColor] = useState(COLORS[3]);
    const [thickness, setThickness] = useState(3);
    const [background, setBackground] = useState(tabData?.background || 'white');
    const [isDrawing, setIsDrawing] = useState(false);
    const lastPoint = useRef(null);
    const shapeStartRef = useRef(null);

    // Text sub-tool: 'text' (standard) or 'math' (LaTeX)
    const [textSubTool, setTextSubTool] = useState('text');
    const [textSubMenu, setTextSubMenu] = useState(false);

    // Zoom / pan state
    const [scale, setScale] = useState(1);
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const isPanning = useRef(false);
    const panStart = useRef({ x: 0, y: 0 });
    const MIN_ZOOM = 0.15;
    const MAX_ZOOM = 5;
    const [remoteText, setRemoteText] = useState(null);
    const [textInput, setTextInput] = useState(null);
    const textRef = useRef(null);
    const mathPreviewRef = useRef(null);
    const imageInputRef = useRef(null);
    const [cursorPos, setCursorPos] = useState(null);
    const [floatingImage, setFloatingImage] = useState(null);
    // Track images independently of the raster canvas so they can be moved without erasing background strokes
    const [localImages, setLocalImages] = useState(tabData?.images || []);
    const [localMathObjects, setLocalMathObjects] = useState(tabData?.mathObjects || []);
    const dragStartRef = useRef(null);
    const prevTabIdRef = useRef(null); // null so first mount triggers canvas restore
    const lastDrawnDataRef = useRef(null);

    // Cloud UI State
    const [showSourceModal, setShowSourceModal] = useState(false);
    const [showCloudPicker, setShowCloudPicker] = useState(false);

    // Expose getCanvasSnapshot to parent via ref
    React.useImperativeHandle(ref, () => ({
        getCanvasSnapshot: () => {
            try { return canvasRef.current?.toDataURL('image/png') || null; }
            catch (e) { return null; }
        },
    }));

    // Restore canvas when tab changes OR when receiving new sync data for the same tab
    useEffect(() => {
        if (prevTabIdRef.current === activeTabId && lastDrawnDataRef.current === tabData?.canvasData) return;
        prevTabIdRef.current = activeTabId;
        lastDrawnDataRef.current = tabData?.canvasData;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
        const pCtx = previewCanvasRef.current?.getContext('2d');
        if (pCtx) pCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);
        if (tabData?.images) setLocalImages(tabData.images);
        if (tabData?.mathObjects) setLocalMathObjects(tabData.mathObjects); else setLocalMathObjects([]);
        if (tabData?.canvasData) {
            const img = new Image();
            img.onload = () => { ctx.drawImage(img, 0, 0, CANVAS_W, CANVAS_H); };
            img.src = tabData.canvasData;
        }
        setBackground(tabData?.background || 'white');
    }, [activeTabId, tabData]);

    // Set large fixed canvas resolution once on mount — no resize needed
    useEffect(() => {
        const canvas = canvasRef.current;
        const preview = previewCanvasRef.current;
        if (!canvas || !preview) return;
        canvas.width = CANVAS_W;
        canvas.height = CANVAS_H;
        preview.width = CANVAS_W;
        preview.height = CANVAS_H;

        if (wrapperRef.current) {
            const rect = wrapperRef.current.getBoundingClientRect();
            setOffset({
                x: rect.width / 2 - CANVAS_W / 2,
                y: rect.height / 2 - CANVAS_H / 2
            });
        }

        // Restore initial canvasData
        if (tabData?.canvasData) {
            const img = new Image();
            img.onload = () => canvas.getContext('2d').drawImage(img, 0, 0, CANVAS_W, CANVAS_H);
            img.src = tabData.canvasData;
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const sendData = async (payload) => {
        if (!room || !localParticipant) return;
        try { await localParticipant.publishData(new TextEncoder().encode(JSON.stringify(payload)), DataPacket_Kind.RELIABLE); } catch (e) { console.error('WS send failed', e); }
    };

    // Draw logic (includes Triangle from Phase 11)
    const drawShape = (ctx, type, x1, y1, x2, y2, color, thickness) => {
        ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = thickness;
        if (type === 'line') { ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); }
        else if (type === 'rect') { ctx.strokeRect(x1, y1, x2 - x1, y2 - y1); return; }
        else if (type === 'circle') { const rx = (x2 - x1) / 2; const ry = (y2 - y1) / 2; ctx.ellipse(x1 + rx, y1 + ry, Math.abs(rx), Math.abs(ry), 0, 0, Math.PI * 2); }
        else if (type === 'triangle') { ctx.moveTo(x1 + (x2 - x1) / 2, y1); ctx.lineTo(x1, y2); ctx.lineTo(x2, y2); ctx.closePath(); }
        ctx.stroke();
    };

    const applyDrawing = (data) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        ctx.save();
        if (data.tool === 'pen') { ctx.globalCompositeOperation = 'source-over'; ctx.beginPath(); ctx.strokeStyle = data.color; ctx.lineWidth = data.thickness; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.moveTo(data.x1, data.y1); ctx.lineTo(data.x2, data.y2); ctx.stroke(); }
        else if (data.tool === 'eraser') { ctx.globalCompositeOperation = 'destination-out'; ctx.beginPath(); ctx.lineWidth = data.thickness; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.moveTo(data.x1, data.y1); ctx.lineTo(data.x2, data.y2); ctx.stroke(); }
        else if (['line', 'rect', 'circle', 'triangle'].includes(data.tool)) { ctx.globalCompositeOperation = 'source-over'; drawShape(ctx, data.tool, data.x1, data.y1, data.x2, data.y2, data.color, data.thickness); }
        else if (data.tool === 'text') {
            ctx.globalCompositeOperation = 'source-over';
            // Standard text rendering
            ctx.fillStyle = data.color;
            ctx.font = `${data.thickness * 6}px Inter, sans-serif`;
            const lines = data.text.split('\n');
            const lineHeight = data.thickness * 6 * 1.2;
            // Bottom-left anchor: last line baseline sits at click point (data.y1)
            const totalHeight = lines.length * lineHeight;
            lines.forEach((line, i) => { ctx.fillText(line, data.x1, data.y1 - totalHeight + (i * lineHeight) + (data.thickness * 6)); });
        }
        else if (data.tool === 'math') {
            // Math is rendered as DOM overlay, not on canvas — see localMathObjects
            // Nothing to do here for canvas
        }
        ctx.restore();
    };

    const clearCanvas = () => { const ctx = canvasRef.current?.getContext('2d'); ctx?.clearRect(0, 0, CANVAS_W, CANVAS_H); setLocalImages([]); onImagesChange(activeTabId, []); setLocalMathObjects([]); onMathObjectsChange(activeTabId, []); };
    const clearPreview = () => { const ctx = previewCanvasRef.current?.getContext('2d'); ctx?.clearRect(0, 0, CANVAS_W, CANVAS_H); };

    useEffect(() => {
        if (!room) return;
        const handler = (payload, participant) => {
            if (participant?.identity === localParticipant?.identity) return;
            try {
                const data = JSON.parse(new TextDecoder().decode(payload));
                // Only process events for the active tab
                if (data.tabId && data.tabId !== activeTabId) return;
                if (data.type === 'draw') applyDrawing(data);
                else if (data.type === 'clear') clearCanvas();
                else if (data.type === 'text-live') setRemoteText({ x: data.x1, y: data.y1, text: data.text, color: data.color, size: data.thickness * 6 });
                else if (data.type === 'text-commit') {
                    if (data.tool === 'math') {
                        // Add math object as DOM overlay
                        const mathObj = { id: genId(), x: data.x1, y: data.y1, rawText: data.text, color: data.color, thickness: data.thickness };
                        setLocalMathObjects(prev => { const next = [...prev, mathObj]; onMathObjectsChange(activeTabId, next); return next; });
                    } else {
                        applyDrawing(data);
                    }
                    setRemoteText(null);
                }
                else if (data.type === 'image-add') {
                    setLocalImages(prev => { const next = [...prev, data.image]; onImagesChange(activeTabId, next); return next; });
                }
                else if (data.type === 'image-remove') {
                    setLocalImages(prev => { const next = prev.filter(im => im.id !== data.imageId); onImagesChange(activeTabId, next); return next; });
                }
                else if (data.type === 'background') setBackground(data.bg);
            } catch (e) { }
        };
        room.on(RoomEvent.DataReceived, handler);
        return () => room.off(RoomEvent.DataReceived, handler);
    }, [room, localParticipant, activeTabId]);

    const getPos = (e) => {
        const rect = wrapperRef.current.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        // Account for zoom + pan: transform screen coords to virtual canvas coords
        return {
            x: (clientX - rect.left - offset.x) / scale,
            y: (clientY - rect.top - offset.y) / scale
        };
    };

    // Zoom via Ctrl+Wheel
    const handleWheel = useCallback((e) => {
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            const rect = wrapperRef.current.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            const delta = e.deltaY > 0 ? 0.9 : 1.1;
            const newScale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, scale * delta));
            // Zoom toward mouse position
            const scaleRatio = newScale / scale;
            setOffset(prev => ({
                x: mouseX - (mouseX - prev.x) * scaleRatio,
                y: mouseY - (mouseY - prev.y) * scaleRatio
            }));
            setScale(newScale);
        } else {
            // Pan with scroll
            setOffset(prev => ({
                x: prev.x - e.deltaX,
                y: prev.y - e.deltaY
            }));
        }
    }, [scale]);

    useEffect(() => {
        const el = wrapperRef.current;
        if (!el) return;
        el.addEventListener('wheel', handleWheel, { passive: false });
        return () => el.removeEventListener('wheel', handleWheel);
    }, [handleWheel]);

    const zoomIn = () => {
        const newScale = Math.min(MAX_ZOOM, scale * 1.25);
        setScale(newScale);
    };
    const zoomOut = () => {
        const newScale = Math.max(MIN_ZOOM, scale * 0.8);
        setScale(newScale);
    };
    const resetZoom = () => {
        setScale(1);
        setOffset({ x: 0, y: 0 });
    };

    // Text focus fix
    useEffect(() => { if (textInput && textRef.current) setTimeout(() => textRef.current?.focus(), 10); }, [textInput]);

    // Live KaTeX preview update
    useEffect(() => {
        if (textInput && textInput.mathMode && mathPreviewRef.current && textRef.current) {
            const raw = textRef.current.value || '';
            mathPreviewRef.current.innerHTML = raw.trim() ? renderKatexPreview(raw) : '<span style="color:#999;">Aperçu LaTeX...</span>';
        }
    });

    const onPointerDown = (e) => {
        if (locked) return;
        const pos = getPos(e);
        updateCursor(e);

        if (tool === 'move') {
            isPanning.current = true;
            panStart.current = { x: e.clientX, y: e.clientY, offsetX: offset.x, offsetY: offset.y };
            return;
        }

        if (textInput && tool !== 'text' && tool !== 'math') {
            const val = textRef.current?.value;
            if (val && val.trim()) {
                if (textInput.mathMode) {
                    const mathObj = { id: genId(), x: textInput.x, y: textInput.y, rawText: val, color: textInput.color, thickness: textInput.thickness };
                    setLocalMathObjects(prev => { const next = [...prev, mathObj]; onMathObjectsChange(activeTabId, next); return next; });
                    sendData({ type: 'text-commit', tool: 'math', x1: textInput.x, y1: textInput.y, color: textInput.color, thickness: textInput.thickness, text: val, textType: 'MATH', rawText: val });
                } else {
                    const drawData = { type: 'text-commit', tool: 'text', x1: textInput.x, y1: textInput.y, color: textInput.color, thickness: textInput.thickness, text: val, textType: 'STANDARD', rawText: val };
                    applyDrawing(drawData); sendData(drawData);
                }
            }
            setTextInput(null);
        }

        if (tool === 'text' || tool === 'math') {
            e.preventDefault();
            if (textInput) {
                const val = textRef.current?.value;
                if (val && val.trim()) {
                    if (textInput.mathMode) {
                        const mathObj = { id: genId(), x: textInput.x, y: textInput.y, rawText: val, color: textInput.color, thickness: textInput.thickness };
                        setLocalMathObjects(prev => { const next = [...prev, mathObj]; onMathObjectsChange(activeTabId, next); return next; });
                        sendData({ type: 'text-commit', tool: 'math', x1: textInput.x, y1: textInput.y, color: textInput.color, thickness: textInput.thickness, text: val, textType: 'MATH', rawText: val });
                    } else {
                        const drawData = { type: 'text-commit', tool: 'text', x1: textInput.x, y1: textInput.y, color: textInput.color, thickness: textInput.thickness, text: val, textType: 'STANDARD', rawText: val };
                        applyDrawing(drawData); sendData(drawData);
                    }
                }
            }
            setTextInput({ id: genId(), x: pos.x, y: pos.y, color, thickness, mathMode: tool === 'math' });
            return;
        }

        if (tool === 'image') {
            if (isProf) setShowSourceModal(true);
            return;
        }

        if (tool === 'imgselect') {
            // Find the topmost committed image at this canvas position
            // Since localImages are rendered sequentially, we search backwards
            for (let i = localImages.length - 1; i >= 0; i--) {
                const im = localImages[i];
                if (pos.x >= im.x && pos.x <= im.x + im.w && pos.y >= im.y && pos.y <= im.y + im.h) {
                    const nextImages = localImages.filter((_, idx) => idx !== i);
                    setLocalImages(nextImages);
                    onImagesChange(activeTabId, nextImages);
                    sendData({ type: 'image-remove', tabId: activeTabId, imageId: im.id });
                    setFloatingImage({ url: im.url, x: im.x, y: im.y, w: im.w, h: im.h });
                    return;
                }
            }
            return;
        }

        setIsDrawing(true);
        lastPoint.current = pos;
        if (['line', 'rect', 'circle', 'triangle'].includes(tool)) shapeStartRef.current = pos;
    };

    const onPointerMove = (e) => {
        updateCursor(e);
        if (tool === 'move' && isPanning.current) {
            setOffset({
                x: panStart.current.offsetX + (e.clientX - panStart.current.x),
                y: panStart.current.offsetY + (e.clientY - panStart.current.y)
            });
            return;
        }
        if (!isDrawing || locked) return;
        const pos = getPos(e);
        if (tool === 'pen' || tool === 'eraser') {
            const drawData = { type: 'draw', tabId: activeTabId, tool, x1: lastPoint.current.x, y1: lastPoint.current.y, x2: pos.x, y2: pos.y, color, thickness: tool === 'eraser' ? thickness * 5 : thickness };
            applyDrawing(drawData); sendData(drawData);
            lastPoint.current = pos;
        } else if (['line', 'rect', 'circle', 'triangle'].includes(tool) && shapeStartRef.current) {
            clearPreview();
            drawShape(previewCanvasRef.current.getContext('2d'), tool, shapeStartRef.current.x, shapeStartRef.current.y, pos.x, pos.y, color, thickness);
        }
    };

    const onPointerUp = (e) => {
        if (tool === 'move') {
            isPanning.current = false;
            return;
        }
        if (!isDrawing || locked) return;
        setIsDrawing(false);
        const pos = getPos(e.changedTouches ? e.changedTouches[0] : e);
        if (['line', 'rect', 'circle', 'triangle'].includes(tool) && shapeStartRef.current) {
            clearPreview();
            const drawData = { type: 'draw', tabId: activeTabId, tool, x1: shapeStartRef.current.x, y1: shapeStartRef.current.y, x2: pos.x, y2: pos.y, color, thickness };
            applyDrawing(drawData); sendData(drawData);
            shapeStartRef.current = null;
        }
    };

    const updateCursor = (e) => {
        if (tool === 'eraser') { const rect = wrapperRef.current?.getBoundingClientRect(); if (rect) setCursorPos({ x: (e.touches ? e.touches[0].clientX : e.clientX) - rect.left, y: (e.touches ? e.touches[0].clientY : e.clientY) - rect.top }); } else { setCursorPos(null); }
    };

    const activeBgInfo = BG_STYLES[background] || BG_STYLES.white;
    const bgStyle = transparent ? { backgroundColor: 'transparent' } : activeBgInfo.style;

    const commitFloatingImage = () => {
        if (!floatingImage || !canvasRef.current) return;
        const newImage = { id: genId(), url: floatingImage.url, x: floatingImage.x, y: floatingImage.y, w: floatingImage.w, h: floatingImage.h };
        const nextImages = [...localImages, newImage];
        setLocalImages(nextImages);
        onImagesChange(activeTabId, nextImages);
        sendData({ type: 'image-add', tabId: activeTabId, image: newImage });
        setFloatingImage(null);
        setTool('pen');
    };

    const handleCloudImageSelect = (file) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
            const w = Math.min(img.width, 800) / scale;
            const h = (img.height / img.width) * w;
            const cw = wrapperRef.current ? wrapperRef.current.clientWidth : 800;
            const ch = wrapperRef.current ? wrapperRef.current.clientHeight : 600;
            const nx = (cw / 2) - (w / 2 * scale);
            const ny = (ch / 2) - (h / 2 * scale);
            const cx = (nx - offset.x) / scale;
            const cy = (ny - offset.y) / scale;
            setFloatingImage({ url: file.url, x: cx, y: cy, w, h });
            setShowCloudPicker(false);
            setTool('move');
        };
        img.src = file.url;
    };

    useEffect(() => {
        const handleWinMove = (e) => {
            if (!dragStartRef.current) return;
            const drag = dragStartRef.current;
            if (drag.type === 'move' && floatingImage) {
                const dx = (e.clientX - drag.startX) / scale;
                const dy = (e.clientY - drag.startY) / scale;
                setFloatingImage(prev => ({ ...prev, x: drag.imgX + dx, y: drag.imgY + dy }));
            } else if (drag.type === 'resize' && floatingImage) {
                const dx = (e.clientX - drag.startX) / scale;
                const dy = (e.clientY - drag.startY) / scale;
                const ratio = drag.startW / drag.startH;
                const newW = Math.max(50, drag.startW + Math.max(dx, dy));
                setFloatingImage(prev => ({ ...prev, w: newW, h: newW / ratio }));
            } else if (drag.type === 'text-move') {
                const dx = (e.clientX - drag.startX) / scale;
                const dy = (e.clientY - drag.startY) / scale;
                setTextInput(prev => {
                    if (!prev) return prev;
                    const next = { ...prev, x: drag.startXCoord + dx, y: drag.startYCoord + dy };
                    sendData({ type: 'text-live', x1: next.x, y1: next.y, text: textRef.current?.value || '', color: next.color, thickness, mathMode: next.mathMode });
                    return next;
                });
            }
        };
        const handleWinUp = () => { if (dragStartRef.current) dragStartRef.current = null; };

        // Attach globally while using drag functionalities
        window.addEventListener('pointermove', handleWinMove);
        window.addEventListener('pointerup', handleWinUp);
        return () => {
            window.removeEventListener('pointermove', handleWinMove);
            window.removeEventListener('pointerup', handleWinUp);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [floatingImage, scale, thickness]);

    // Resize text dynamically when thickness changes in toolbar
    useEffect(() => {
        if (textInput) {
            sendData({ type: 'text-live', x1: textInput.x, y1: textInput.y, text: textRef.current?.value || '', color: textInput.color, thickness, mathMode: textInput.mathMode });
            if (textRef.current) {
                textRef.current.style.height = 'auto';
                textRef.current.style.height = textRef.current.scrollHeight + 'px';
            }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [thickness]);

    return (
        <div className="h-full flex">
            {/* Toolbar */}
            <div className="w-14 bg-gray-100 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 flex flex-col items-center py-3 gap-1 shrink-0 z-20">
                {TOOLS.map(t => {
                    if (t.id === 'image' && !isProf) return null;
                    // Text tool with sub-menu (text / math)
                    if (t.hasSubMenu) {
                        const isTextActive = tool === 'text' || tool === 'math';
                        return (
                            <div key={t.id} className="relative">
                                <button
                                    onClick={() => {
                                        if (isTextActive) {
                                            setTextSubMenu(prev => !prev);
                                        } else {
                                            setTool(textSubTool);
                                            setTextSubMenu(false);
                                        }
                                    }}
                                    className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${isTextActive ? 'bg-primary text-white shadow' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800'}`}
                                >
                                    {textSubTool === 'math'
                                        ? <span className="text-lg font-bold" style={{ fontFamily: 'serif' }}>Σ</span>
                                        : <Type className="w-5 h-5" />
                                    }
                                </button>
                                {textSubMenu && (
                                    <div className="absolute left-12 top-0 z-50 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl p-1 flex flex-col gap-0.5 min-w-[140px]">
                                        <button
                                            onClick={() => { setTextSubTool('text'); setTool('text'); setTextSubMenu(false); }}
                                            className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${textSubTool === 'text' ? 'bg-primary/10 text-primary font-medium' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
                                        >
                                            <Type className="w-4 h-4" />
                                            Texte
                                        </button>
                                        <button
                                            onClick={() => { setTextSubTool('math'); setTool('math'); setTextSubMenu(false); }}
                                            className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${textSubTool === 'math' ? 'bg-primary/10 text-primary font-medium' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
                                        >
                                            <span className="text-base font-bold" style={{ fontFamily: 'serif' }}>Σ</span>
                                            Math (LaTeX)
                                        </button>
                                    </div>
                                )}
                            </div>
                        );
                    }
                    return (
                        <button key={t.id} onClick={() => { setTool(t.id); setTextSubMenu(false); if (t.id === 'image') setShowSourceModal(true); }} className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${tool === t.id ? 'bg-primary text-white shadow' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800'}`}>
                            <t.icon className="w-5 h-5" />
                        </button>
                    );
                })}
                {/* ... colors/thickness/bg/clear ... */}
                <div className="w-8 border-t border-gray-300 dark:border-gray-600 my-2" />
                {COLORS.map(c => <button key={c} onClick={() => setColor(c)} className={`w-7 h-7 rounded-full border-2 transition-transform ${color === c ? 'border-primary scale-110' : 'border-gray-300 dark:border-gray-600'}`} style={{ backgroundColor: c }} />)}
                <div className="w-8 border-t border-gray-300 dark:border-gray-600 my-2" />
                <input type="range" min={1} max={10} value={thickness} onChange={e => setThickness(parseInt(e.target.value))} className="w-10 rotate-[-90deg] mt-4 mb-4" />
                <div className="w-8 border-t border-gray-300 dark:border-gray-600 my-2" />
                {!transparent && isProf && Object.entries(BG_STYLES).map(([id, bg]) => (
                    <button key={id} onClick={() => { setBackground(id); sendData({ type: 'background', tabId: activeTabId, bg: id }); if (onBackgroundChange) onBackgroundChange(activeTabId, id); }} className={`w-8 h-8 rounded border-2 transition-colors ${background === id ? 'border-primary' : 'border-gray-300 dark:border-gray-600'}`} style={{ background: id === 'white' ? '#fff' : id === 'grid' ? '#f0f0f0' : '#f5f0e8' }}>{id === 'grid' && <Grid3X3 className="w-4 h-4 text-gray-400 mx-auto" />}</button>
                ))}
                <div className="mt-auto" />
                <button onClick={() => { if (confirm('Tout effacer ?')) { clearCanvas(); clearPreview(); sendData({ type: 'clear', tabId: activeTabId }); } }} className="w-10 h-10 rounded-lg text-red-500 hover:bg-red-100 flex items-center justify-center"><Trash2 className="w-5 h-5" /></button>
                <div className="w-8 border-t border-gray-300 dark:border-gray-600 my-1" />
                <button onClick={zoomIn} className="w-10 h-10 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800 flex items-center justify-center" title="Zoom +"><ZoomIn className="w-5 h-5" /></button>
                <button onClick={zoomOut} className="w-10 h-10 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800 flex items-center justify-center" title="Zoom -"><ZoomOut className="w-5 h-5" /></button>
                <button onClick={resetZoom} className="w-8 h-6 rounded text-[10px] text-gray-500 hover:text-white hover:bg-gray-700 flex items-center justify-center" title="Reset zoom">{Math.round(scale * 100)}%</button>
            </div>

            <div ref={wrapperRef} className="flex-1 relative overflow-hidden bg-gray-200 dark:bg-gray-800" onPointerLeave={() => setCursorPos(null)}>
                {floatingImage && (
                    <div
                        className="absolute z-30 border-2 border-primary border-dashed group cursor-move"
                        style={{
                            left: floatingImage.x * scale + offset.x,
                            top: floatingImage.y * scale + offset.y,
                            width: Math.max(20, floatingImage.w * scale),
                            height: Math.max(20, floatingImage.h * scale),
                            transformOrigin: 'top left'
                        }}
                        onPointerDown={(e) => {
                            e.stopPropagation();
                            dragStartRef.current = { type: 'move', startX: e.clientX, startY: e.clientY, imgX: floatingImage.x, imgY: floatingImage.y };
                        }}
                    >
                        <img src={floatingImage.url} className="w-full h-full pointer-events-none object-fill" />
                        <div 
                            className="absolute -bottom-2 -right-2 w-6 h-6 bg-primary rounded-full cursor-nwse-resize opacity-0 group-hover:opacity-100 flex items-center justify-center text-white pb-0.5 select-none z-40"
                            onPointerDown={(e) => {
                                e.stopPropagation();
                                dragStartRef.current = { type: 'resize', startX: e.clientX, startY: e.clientY, startW: floatingImage.w, startH: floatingImage.h };
                            }}
                        >
                            <Plus className="w-4 h-4" />
                        </div>
                        <div className="absolute -bottom-12 left-1/2 -translate-x-1/2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onPointerDown={e => e.stopPropagation()} onClick={commitFloatingImage} className="w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center hover:bg-emerald-600 shadow-md">
                                <CheckSquare className="w-4 h-4" />
                            </button>
                            <button onPointerDown={e => e.stopPropagation()} onClick={() => setFloatingImage(null)} className="w-8 h-8 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 shadow-md">
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                )}
                
                {cursorPos && tool === 'eraser' && (
                    <div className="fixed pointer-events-none rounded-full border-2 border-black bg-white/50 z-50 transform -translate-x-1/2 -translate-y-1/2 shadow-sm shadow-white" style={{ left: wrapperRef.current?.getBoundingClientRect().left + cursorPos.x, top: wrapperRef.current?.getBoundingClientRect().top + cursorPos.y, width: thickness * 5 * scale, height: thickness * 5 * scale }} />
                )}

                {/* Zoom indicator */}
                {scale !== 1 && (
                    <div className="absolute top-2 right-2 z-30 bg-black/60 text-white text-xs px-2 py-1 rounded-md backdrop-blur-sm">
                        {Math.round(scale * 100)}%
                    </div>
                )}

                {/* Virtual canvas layer — fixed large resolution, CSS-scaled to fill wrapper */}
                <div style={{
                    position: 'absolute', top: 0, left: 0,
                    width: CANVAS_W, height: CANVAS_H,
                    transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
                    transformOrigin: '0 0',
                    boxShadow: '0 0 40px rgba(0,0,0,0.1)',
                    ...(!transparent ? bgStyle : {})
                }}>
                    <canvas
                        ref={canvasRef}
                        width={CANVAS_W} height={CANVAS_H}
                        style={{ display: 'block', cursor: tool === 'eraser' ? 'none' : tool === 'imgselect' ? 'crosshair' : 'crosshair', width: CANVAS_W, height: CANVAS_H }}
                        className="absolute top-0 left-0 z-10"
                        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
                        onPointerLeave={() => { setIsDrawing(false); setCursorPos(null); }}
                    />
                    <canvas
                        ref={previewCanvasRef}
                        width={CANVAS_W} height={CANVAS_H}
                        style={{ display: 'block', width: CANVAS_W, height: CANVAS_H }}
                        className="absolute top-0 left-0 z-20 pointer-events-none"
                    />
                    
                    {/* DOM-rendered images overlay (between canvas and previewCanvas conceptually, but visually on top) */}
                    {localImages.map(im => (
                        <img 
                            key={im.id} 
                            src={im.url} 
                            alt="" 
                            className="absolute pointer-events-none z-15" 
                            style={{ left: im.x, top: im.y, width: im.w, height: im.h }} 
                        />
                    ))}
                    {textInput && !textInput.mathMode && (
                        <div key={`text-${textInput.id}`} className="absolute z-50 group flex flex-col" style={{ left: textInput.x, top: textInput.y, transform: 'translateY(-100%)' }} onPointerDown={e => e.stopPropagation()}>
                            <div className="bg-primary/50 hover:bg-primary opacity-0 group-hover:opacity-100 transition-opacity cursor-move flex items-center justify-center rounded-t-md py-0.5 shadow-sm w-full"
                                 onPointerDown={e => { e.stopPropagation(); dragStartRef.current = { type: 'text-move', startX: e.clientX, startY: e.clientY, startXCoord: textInput.x, startYCoord: textInput.y }; }}>
                                <Grid3X3 className="w-4 h-4 text-white" />
                            </div>
                            <textarea ref={textRef} className="bg-white/50 outline-none resize-none overflow-hidden rounded-b-md" style={{ color: textInput.color, fontSize: `${thickness * 6}px`, fontFamily: 'Inter, sans-serif', minWidth: '20px', lineHeight: 1.2, border: '1px dashed #666' }}
                                autoFocus onKeyDown={e => {
                                    if (e.key === 'Escape') setTextInput(null);
                                    else if (e.key === 'Enter' && !e.shiftKey) { 
                                        e.preventDefault(); 
                                        e.target.blur();
                                        if (e.target.value.trim()) { 
                                            const drawData = { type: 'text-commit', tool: 'text', x1: textInput.x, y1: textInput.y, color: textInput.color, thickness, text: e.target.value, textType: 'STANDARD', rawText: e.target.value }; 
                                            applyDrawing(drawData); sendData(drawData); 
                                        } 
                                        setTextInput(null); 
                                    }
                                    e.stopPropagation();
                                }} 
                                onChange={e => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; sendData({ type: 'text-live', x1: textInput.x, y1: textInput.y, text: e.target.value, color: textInput.color, thickness }); }}
                            />
                        </div>
                    )}
                    {textInput && textInput.mathMode && (
                        <div
                            key={`math-${textInput.id}`}
                            className="absolute z-50 flex flex-col group"
                            style={{ left: textInput.x, top: textInput.y, transform: 'translateY(-100%)' }}
                            onPointerDown={e => e.stopPropagation()}
                        >
                            <div className="bg-primary/50 hover:bg-primary opacity-0 group-hover:opacity-100 transition-opacity cursor-move flex items-center justify-center rounded-t-md py-0.5 shadow-sm w-full"
                                 onPointerDown={e => { e.stopPropagation(); dragStartRef.current = { type: 'text-move', startX: e.clientX, startY: e.clientY, startXCoord: textInput.x, startYCoord: textInput.y }; }}>
                                <Grid3X3 className="w-4 h-4 text-white" />
                            </div>
                            {/* Live KaTeX preview */}
                            <div
                                ref={mathPreviewRef}
                                className="min-h-[30px] px-3 py-2 bg-white border border-b-0 border-gray-300 shadow-sm pointer-events-none select-none"
                                style={{ fontSize: `${thickness * 6}px`, color: textInput.color, minWidth: '120px' }}
                            >
                                <span style={{ color: '#999' }}>Aperçu LaTeX...</span>
                            </div>
                            {/* Raw LaTeX input */}
                            <textarea
                                ref={textRef}
                                autoFocus
                                className="bg-gray-50 outline-none resize-none overflow-hidden px-3 py-2 rounded-b-lg border border-gray-300 shadow-sm font-mono text-sm"
                                style={{ minWidth: '200px', minHeight: '36px', color: '#333' }}
                                placeholder="\\frac{a}{b}, \\sqrt{x}, ..."
                                onKeyDown={e => {
                                    if (e.key === 'Escape') { setTextInput(null); }
                                    else if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        const val = textRef.current?.value;
                                        if (val && val.trim()) {
                                            const mathObj = { id: genId(), x: textInput.x, y: textInput.y, rawText: val, color: textInput.color, thickness };
                                            setLocalMathObjects(prev => { const next = [...prev, mathObj]; onMathObjectsChange(activeTabId, next); return next; });
                                            sendData({ type: 'text-commit', tool: 'math', x1: textInput.x, y1: textInput.y, color: textInput.color, thickness, text: val, textType: 'MATH', rawText: val });
                                        }
                                        setTextInput(null);
                                    }
                                    e.stopPropagation();
                                }}
                                onChange={e => {
                                    e.target.style.height = 'auto';
                                    e.target.style.height = e.target.scrollHeight + 'px';
                                    // Update live preview
                                    if (mathPreviewRef.current) {
                                        const raw = e.target.value;
                                        mathPreviewRef.current.innerHTML = raw.trim() ? renderKatexPreview(raw) : '<span style="color:#999;">Aperçu LaTeX...</span>';
                                    }
                                    sendData({ type: 'text-live', x1: textInput.x, y1: textInput.y, text: e.target.value, color: textInput.color, thickness, mathMode: true });
                                }}
                            />
                        </div>
                    )}
                    
                    {/* Committed math objects (DOM overlay — persisted like images) */}
                    {localMathObjects.map(mo => (
                        <div
                            key={mo.id}
                            className="absolute pointer-events-none z-16 select-none"
                            style={{ left: mo.x, top: mo.y, transform: 'translateY(-100%)', fontSize: `${(mo.thickness || 3) * 6}px`, color: mo.color || '#000' }}
                            dangerouslySetInnerHTML={{ __html: renderKatexPreview(mo.rawText) }}
                        />
                    ))}

                    {remoteText && <span className="absolute pointer-events-none z-30 whitespace-pre" style={{ left: remoteText.x, top: remoteText.y, color: remoteText.color, fontSize: `${remoteText.size}px`, fontFamily: 'Inter, sans-serif', lineHeight: 1.2, textShadow: '0 0 2px white' }}>{remoteText.text}</span>}
                </div>

                {/* Hidden input for image uploads via toolbar */}
                <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = (ev) => { handleCloudImageSelect({ url: ev.target.result }); }; reader.readAsDataURL(file); e.target.value = ''; }} />
            </div>

            {/* Modals */}
            {showSourceModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className="bg-background rounded-xl border p-6 w-80 shadow-2xl space-y-4">
                        <h3 className="text-lg font-semibold">Choisir une image</h3>
                        <div className="grid gap-3">
                            <Button variant="outline" className="justify-start h-12" onClick={() => { setShowSourceModal(false); imageInputRef.current?.click(); }}>
                                <ImagePlus className="w-5 h-5 mr-3 text-blue-500" /> Depuis l'appareil
                            </Button>
                            <Button variant="outline" className="justify-start h-12" onClick={() => { setShowSourceModal(false); setShowCloudPicker(true); }}>
                                <Cloud className="w-5 h-5 mr-3 text-pink-500" /> Depuis mon Cloud
                            </Button>
                        </div>
                        <Button variant="ghost" className="w-full" onClick={() => setShowSourceModal(false)}>Annuler</Button>
                    </div>
                </div>
            )}

            {showCloudPicker && <CloudFilePicker onClose={() => setShowCloudPicker(false)} onSelect={handleCloudImageSelect} />}
        </div>
    );
});

// Minimal Cloud Picker Component
function CloudFilePicker({ onClose, onSelect }) {
    const [folders, setFolders] = useState([]);
    const [documents, setDocuments] = useState([]);
    const [currentFolder, setCurrentFolder] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetch = async () => {
            try {
                setLoading(true);

                // Fetch Folders
                const fQuery = currentFolder ? `?parentId=${currentFolder.id}` : '';
                const fRes = await api.get(`/folders${fQuery}`);
                setFolders(fRes.folders || []);

                // Fetch Documents (Skip for virtual roots)
                if (!currentFolder || currentFolder.id === 'students' || currentFolder.id.startsWith('virtual_')) {
                    setDocuments([]);
                } else {
                    let dQuery = '';
                    if (currentFolder.id === 'private') {
                        dQuery = '';
                    } else {
                        dQuery = `?folderId=${currentFolder.id}`;
                    }
                    const dRes = await api.get(`/documents${dQuery}`);
                    setDocuments((dRes.documents || []).filter(d => d.mimeType.startsWith('image/')));
                }
            } catch (e) { } finally { setLoading(false); }
        };
        fetch();
    }, [currentFolder]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-background rounded-xl border p-0 w-[600px] h-[500px] shadow-2xl flex flex-col overflow-hidden">
                <div className="p-4 border-b flex items-center justify-between bg-secondary/20">
                    <div className="flex items-center gap-2 font-medium">
                        <button onClick={() => setCurrentFolder(null)} className="hover:underline text-primary">Cloud</button>
                        {currentFolder && <><ChevronRight className="w-4 h-4 text-muted-foreground" /> <span>{currentFolder.name}</span></>}
                    </div>
                    <button onClick={onClose}><X className="w-5 h-5" /></button>
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                    {loading ? <div className="text-center p-8 text-muted-foreground">Chargement...</div> : (
                        <div className="grid grid-cols-4 gap-4">
                            {folders.map(f => (
                                <button key={f.id} onClick={() => setCurrentFolder(f)} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-secondary/40 border border-transparent hover:border-border transition-colors group">
                                    <Folder className="w-10 h-10 text-amber-400 fill-amber-400/20" />
                                    <span className="text-xs text-center truncate w-full">{f.name}</span>
                                </button>
                            ))}
                            {documents.map(d => (
                                <button key={d.id} onClick={() => onSelect(d)} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-secondary/40 border border-transparent hover:border-border transition-colors relative group">
                                    <div className="w-12 h-12 rounded bg-gray-100 dark:bg-gray-800 flex items-center justify-center overflow-hidden">
                                        <img src={d.url} alt="" className="w-full h-full object-cover" />
                                    </div>
                                    <span className="text-xs text-center truncate w-full">{d.title}</span>
                                </button>
                            ))}
                            {folders.length === 0 && documents.length === 0 && <div className="col-span-4 text-center text-muted-foreground py-8">Aucune image trouvée</div>}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function ChatPanel({ messages, onSendMessage, onClose, onFileUpload }) {
    const [input, setInput] = useState('');
    const messagesEndRef = useRef(null);
    const fileInputRef = useRef(null);
    useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
    const handleSubmit = (e) => { e.preventDefault(); onSendMessage(input); setInput(''); };

    const formatSize = (bytes) => {
        if (!bytes) return '';
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    };

    return (
        <div className="w-80 border-l border-border flex flex-col bg-background shrink-0">
            <div className="h-10 px-4 flex items-center justify-between border-b"><span className="text-sm font-medium">Chat</span><button onClick={onClose}><X className="w-4 h-4" /></button></div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.map((msg, i) => (
                    <div key={i} className={`flex flex-col ${msg.isMe ? 'items-end' : 'items-start'}`}>
                        <span className="text-[10px] text-muted-foreground mb-0.5">{msg.sender} • {msg.time}</span>
                        {msg.type === 'file' ? (
                            <a href={msg.url} target="_blank" rel="noopener noreferrer" className={`flex items-center gap-3 p-3 rounded-lg max-w-[95%] border ${msg.isMe ? 'bg-primary/10 border-primary/20' : 'bg-secondary border-border'} hover:bg-opacity-80 transition-colors`}>
                                <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
                                    <File className="w-5 h-5 text-current" />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-sm font-medium truncate">{msg.filename}</p>
                                    <p className="text-[10px] opacity-70">{formatSize(msg.size)}</p>
                                </div>
                                <Download className="w-4 h-4 ml-2 opacity-50" />
                            </a>
                        ) : (
                            <div className={`px-3 py-2 rounded-lg text-sm max-w-[85%] ${msg.isMe ? 'bg-primary text-white' : 'bg-secondary'}`}>{msg.text}</div>
                        )}
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </div>
            <form onSubmit={handleSubmit} className="p-3 border-t flex gap-2 items-center">
                <button type="button" onClick={() => fileInputRef.current?.click()} className="p-2 text-muted-foreground hover:text-foreground transition-colors hover:bg-secondary rounded-lg">
                    <Paperclip className="w-4 h-4" />
                </button>
                <input ref={fileInputRef} type="file" className="hidden" onChange={onFileUpload} />
                <input value={input} onChange={e => setInput(e.target.value)} placeholder="Message..." className="flex-1 h-9 rounded-lg bg-secondary/50 border border-input px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
                <Button type="submit" size="icon" className="h-9 w-9 shrink-0"><Send className="w-4 h-4" /></Button>
            </form>
        </div>
    );
}

function ScreenshotButton({ sessionId, courseId }) {
    const [saving, setSaving] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [captureName, setCaptureName] = useState('');
    const capturedDataRef = useRef(null);
    const takeScreenshot = () => { const canvas = document.querySelector('canvas'); if (!canvas) return; capturedDataRef.current = canvas.toDataURL('image/png'); const now = new Date(); setCaptureName(`Capture ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`); setShowModal(true); };
    const confirmSave = async () => { if (!capturedDataRef.current) return; setSaving(true); try { await api.post('/room/screenshot', { imageData: capturedDataRef.current, sessionId, courseId, name: captureName }); } catch (err) { console.error('Screenshot failed:', err); } setSaving(false); setShowModal(false); };
    return (
        <>
            <Button variant="ghost" size="sm" onClick={takeScreenshot} disabled={saving}><Camera className="w-4 h-4 mr-1" /> {saving ? '...' : '📸'}</Button>
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className="bg-background rounded-xl border p-6 w-96 shadow-2xl">
                        <h3 className="text-lg font-semibold mb-4">Nommer la capture</h3>
                        <input value={captureName} onChange={e => setCaptureName(e.target.value)} className="w-full h-10 rounded-lg bg-secondary/50 border border-input px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary mb-4" autoFocus onKeyDown={e => e.key === 'Enter' && confirmSave()} />
                        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setShowModal(false)}>Annuler</Button><Button onClick={confirmSave} disabled={saving}>{saving ? 'Enregistrement...' : 'Enregistrer'}</Button></div>
                    </div>
                </div>
            )}
        </>
    );
}



function HomeworkButton({ courseId }) {
    const [showModal, setShowModal] = useState(false);

    return (
        <>
            <Button variant="ghost" size="sm" onClick={() => setShowModal(true)}>
                <BookOpen className="w-4 h-4 mr-1" /> Devoirs
            </Button>
            <HomeworkModal
                courseId={courseId}
                isOpen={showModal}
                onClose={() => setShowModal(false)}
                onSuccess={() => alert('Devoirs assignés avec succès !')}
            />
        </>
    );
}
