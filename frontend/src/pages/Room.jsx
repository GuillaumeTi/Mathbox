import React, { useState, useEffect, useRef, useCallback } from 'react';
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
    Plus, Edit3
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const genId = () => Math.random().toString(36).substring(2, 10);
const makeTab = (n, id = null) => ({ id: id || genId(), title: `Board ${n}`, canvasData: null, background: 'white' });

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
    { id: 'pen', icon: PenTool, label: 'Stylo' },
    { id: 'eraser', icon: Eraser, label: 'Gomme' },
    { id: 'line', icon: Minus, label: 'Ligne' },
    { id: 'rect', icon: Square, label: 'Rectangle' },
    { id: 'circle', icon: Circle, label: 'Cercle' },
    { id: 'triangle', icon: Triangle, label: 'Triangle' },
    { id: 'text', icon: Type, label: 'Texte' },
    { id: 'image', icon: ImagePlus, label: 'Image' },
];

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
    if (error) return <div className="min-h-screen flex items-center justify-center">{error}</div>;

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
                    onLeave={() => navigate(user.role === 'PROF' ? '/dashboard' : '/student')}
                />
            </ErrorBoundary>
        </LiveKitRoom>
    );
}

function RoomContent({ courseCode, sessionId, courseId, user, initialWhiteboardState, onLeave }) {
    const room = useRoomContext();
    const { localParticipant } = useLocalParticipant();
    const [messages, setMessages] = useState([]);
    const allCameraTracks = useTracks([Track.Source.Camera], { onlySubscribed: false });
    const screenShareTracks = useTracks([Track.Source.ScreenShare], { onlySubscribed: false });
    const [viewMode, setViewMode] = useState('VIDEO');
    const [chatOpen, setChatOpen] = useState(false);
    const [locked, setLocked] = useState(false);
    const [screenSharing, setScreenSharing] = useState(false);
    const [videoEnabled, setVideoEnabled] = useState(false);
    const [audioEnabled, setAudioEnabled] = useState(false);
    const isProf = user.role === 'PROF';

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

    // Save on leave
    const handleLeave = useCallback(async () => {
        if (isProf) await saveWhiteboard();
        onLeave();
    }, [isProf, saveWhiteboard, onLeave]);

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
        setTabs(prev => {
            const next = prev.filter(t => t.id !== tabId);
            if (activeTabId === tabId) setActiveTabId(next[0].id);
            return next;
        });
        sendDataPacketFn({ type: 'tab-close', tabId });
        debouncedSave();
    }, [isProf, tabs.length, activeTabId, debouncedSave]);

    const renameTab = useCallback((tabId, title) => {
        if (!isProf) return;
        setTabs(prev => prev.map(t => t.id === tabId ? { ...t, title } : t));
        sendDataPacketFn({ type: 'tab-rename', tabId, title });
        debouncedSave();
    }, [isProf, debouncedSave]);

    const switchTab = useCallback((tabId) => {
        if (tabId === activeTabId) return;
        // Snapshot current canvas before switching
        let currentSnapshot = null;
        if (whiteboardRef.current?.getCanvasSnapshot) {
            currentSnapshot = whiteboardRef.current.getCanvasSnapshot();
            setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, canvasData: currentSnapshot } : t));
        }
        setActiveTabId(tabId);
        if (isProf) {
            // Broadcast tab switch WITH the departing tab's snapshot so students have the drawing data
            sendDataPacketFn({ type: 'tab-switch', tabId, fromTabId: activeTabId, fromCanvasData: currentSnapshot });
            debouncedSave();
        }
    }, [activeTabId, isProf, debouncedSave]);

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
            let currentSnapshot = null;
            if (whiteboardRef.current?.getCanvasSnapshot) {
                currentSnapshot = whiteboardRef.current.getCanvasSnapshot();
            }
            sendDataPacketFn({
                type: 'tab-sync',
                activeTabId,
                tabs: tabs.map(t => t.id === activeTabId ? { ...t, canvasData: currentSnapshot } : t),
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
                    setTabs(data.tabs);
                    setActiveTabId(data.activeTabId);
                }
                else if (data.type === 'tab-switch') {
                    // Store the teacher's canvas snapshot for the tab they just left
                    if (data.fromTabId && data.fromCanvasData) {
                        setTabs(prev => prev.map(t => t.id === data.fromTabId ? { ...t, canvasData: data.fromCanvasData } : t));
                    }
                    setActiveTabId(data.tabId);
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
                    <Button variant="ghost" size="sm" onClick={handleLeave}><ArrowLeft className="w-4 h-4 mr-1" /> Quitter</Button>
                    <Badge variant="success" className="text-xs"><span className="w-2 h-2 rounded-full bg-emerald-400 mr-1.5 animate-pulse" /> En direct</Badge>
                </div>
                <div className="flex items-center gap-2">
                    {isProf && (
                        <>
                            <Button variant={locked ? 'destructive' : 'ghost'} size="sm" onClick={async () => { const next = !locked; setLocked(next); await sendDataPacket({ type: 'lock', locked: next }); }}>{locked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}</Button>
                            <Button variant={viewMode === 'BOARD' ? 'default' : 'ghost'} size="sm" onClick={() => (viewMode === 'BOARD' ? broadcastMode('VIDEO') : broadcastMode('BOARD'))}><PenTool className="w-4 h-4 mr-1" /> Tableau</Button>
                            <Button variant={screenSharing ? 'default' : 'ghost'} size="sm" onClick={toggleScreenShare}>{screenSharing ? <><MonitorOff className="w-4 h-4 mr-1" /> Stop</> : <><Monitor className="w-4 h-4 mr-1" /> Écran</>}</Button>
                        </>
                    )}
                    <Button variant={chatOpen ? 'default' : 'ghost'} size="sm" onClick={() => setChatOpen(!chatOpen)}><MessageSquare className="w-4 h-4 mr-1" /> Chat</Button>
                    <ScreenshotButton sessionId={sessionId} courseId={courseId} />
                    {isProf && <HomeworkButton courseId={courseId} />}
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
                            {/* Tab Bar */}
                            <TabBar tabs={tabs} activeTabId={activeTabId} isProf={isProf} onSwitch={switchTab} onAdd={addTab} onClose={closeTab} onRename={renameTab} />
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
                <Button variant="destructive" size="icon" className="rounded-full w-12 h-12" onClick={handleLeave}><X className="w-5 h-5" /></Button>
            </div>
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

// ===== WHITEBOARD COMPONENT =====
const Whiteboard = React.forwardRef(function Whiteboard({ localParticipant, locked, transparent, isProf, activeTabId, tabData }, ref) {
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
    const [remoteText, setRemoteText] = useState(null);
    const [textInput, setTextInput] = useState(null);
    const textRef = useRef(null);
    const imageInputRef = useRef(null);
    const [cursorPos, setCursorPos] = useState(null);
    const prevTabIdRef = useRef(null); // null so first mount triggers canvas restore
    const lastDrawnDataRef = useRef(null);

    // Cloud UI State
    const [showSourceModal, setShowSourceModal] = useState(false);
    const [showCloudPicker, setShowCloudPicker] = useState(false);

    // Expose getCanvasSnapshot to parent via ref
    React.useImperativeHandle(ref, () => ({
        getCanvasSnapshot: () => canvasRef.current?.toDataURL('image/png') || null,
    }));

    // Restore canvas when tab changes OR when receiving new sync data for the same tab
    useEffect(() => {
        if (prevTabIdRef.current === activeTabId && lastDrawnDataRef.current === tabData?.canvasData) return;
        prevTabIdRef.current = activeTabId;
        lastDrawnDataRef.current = tabData?.canvasData;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const pCtx = previewCanvasRef.current?.getContext('2d');
        if (pCtx) pCtx.clearRect(0, 0, previewCanvasRef.current.width, previewCanvasRef.current.height);
        if (tabData?.canvasData) {
            const img = new Image();
            img.onload = () => { ctx.drawImage(img, 0, 0); };
            img.src = tabData.canvasData;
        }
        setBackground(tabData?.background || 'white');
    }, [activeTabId, tabData]);

    // Initial resize
    useEffect(() => {
        const handleResize = () => {
            const canvas = canvasRef.current;
            const preview = previewCanvasRef.current;
            if (!canvas || !preview || !wrapperRef.current) return;
            const rect = wrapperRef.current.getBoundingClientRect();
            const tmpCanvas = document.createElement('canvas');
            tmpCanvas.width = canvas.width; tmpCanvas.height = canvas.height;
            tmpCanvas.getContext('2d').drawImage(canvas, 0, 0);
            canvas.width = rect.width; canvas.height = rect.height;
            preview.width = rect.width; preview.height = rect.height;
            canvas.getContext('2d').drawImage(tmpCanvas, 0, 0);
        };
        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Draw initial canvasData after first resize (for persistent state on mount)
    useEffect(() => {
        if (!tabData?.canvasData) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const timer = setTimeout(() => {
            const img = new Image();
            img.onload = () => {
                canvas.getContext('2d').drawImage(img, 0, 0);
            };
            img.src = tabData.canvasData;
        }, 100); // Small delay to ensure resize has completed
        return () => clearTimeout(timer);
    }, []); // Only on mount

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
        else if (data.tool === 'text') { ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = data.color; ctx.font = `${data.thickness * 6}px Inter, sans-serif`; const lines = data.text.split('\n'); const lineHeight = data.thickness * 6 * 1.2; lines.forEach((line, i) => { ctx.fillText(line, data.x1, data.y1 + (i * lineHeight) + (data.thickness * 6)); }); }
        ctx.restore();
    };

    const clearCanvas = () => { const ctx = canvasRef.current?.getContext('2d'); ctx?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height); };
    const clearPreview = () => { const ctx = previewCanvasRef.current?.getContext('2d'); ctx?.clearRect(0, 0, previewCanvasRef.current.width, previewCanvasRef.current.height); };

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
                else if (data.type === 'text-commit') { applyDrawing(data); setRemoteText(null); }
                else if (data.type === 'image') { const img = new Image(); img.onload = () => { canvasRef.current.getContext('2d').drawImage(img, data.x, data.y, data.w, data.h) }; img.src = data.src; }
                else if (data.type === 'background') setBackground(data.bg);
            } catch (e) { }
        };
        room.on(RoomEvent.DataReceived, handler);
        return () => room.off(RoomEvent.DataReceived, handler);
    }, [room, localParticipant, activeTabId]);

    const getPos = (e) => { const rect = canvasRef.current.getBoundingClientRect(); return { x: (e.touches ? e.touches[0].clientX : e.clientX) - rect.left, y: (e.touches ? e.touches[0].clientY : e.clientY) - rect.top }; };

    // Text focus fix
    useEffect(() => { if (textInput && textRef.current) setTimeout(() => textRef.current?.focus(), 10); }, [textInput]);

    const onPointerDown = (e) => {
        if (locked) return;
        const pos = getPos(e);
        updateCursor(e);

        if (textInput && tool !== 'text') {
            const val = textRef.current?.value;
            if (val) { const drawData = { type: 'text-commit', tool: 'text', x1: textInput.x, y1: textInput.y, color: textInput.color, thickness: textInput.thickness, text: val }; applyDrawing(drawData); sendData(drawData); }
            setTextInput(null);
        }

        if (tool === 'text') {
            e.preventDefault();
            if (textInput) {
                const val = textRef.current?.value;
                if (val && val.trim()) { const drawData = { type: 'text-commit', tool: 'text', x1: textInput.x, y1: textInput.y, color: textInput.color, thickness: textInput.thickness, text: val }; applyDrawing(drawData); sendData(drawData); }
            }
            setTextInput({ x: pos.x, y: pos.y, color, thickness });
            return;
        }

        if (tool === 'image') {
            if (isProf) setShowSourceModal(true); // Open modal instead of click
            return;
        }

        setIsDrawing(true);
        lastPoint.current = pos;
        if (['line', 'rect', 'circle', 'triangle'].includes(tool)) shapeStartRef.current = pos;
    };

    const onPointerMove = (e) => {
        updateCursor(e);
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

    const handleCloudImageSelect = (file) => {
        const img = new Image();
        img.onload = () => {
            const w = Math.min(img.width, 400); const h = img.height * (w / img.width);
            const x = (canvasRef.current.width - w) / 2; const y = (canvasRef.current.height - h) / 2;
            canvasRef.current.getContext('2d').drawImage(img, x, y, w, h);
            sendData({ type: 'image', src: file.url, x, y, w, h });
        };
        img.src = file.url;
        setShowCloudPicker(false);
    };

    return (
        <div className="h-full flex">
            {/* Toolbar */}
            <div className="w-14 bg-gray-100 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 flex flex-col items-center py-3 gap-1 shrink-0 z-20">
                {TOOLS.map(t => {
                    if (t.id === 'image' && !isProf) return null;
                    return (
                        <button key={t.id} onClick={() => { setTool(t.id); if (t.id === 'image') setShowSourceModal(true); }} className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${tool === t.id ? 'bg-primary text-white shadow' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800'}`}>
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
                    <button key={id} onClick={() => { setBackground(id); sendData({ type: 'background', tabId: activeTabId, bg: id }); }} className={`w-8 h-8 rounded border-2 transition-colors ${background === id ? 'border-primary' : 'border-gray-300 dark:border-gray-600'}`} style={{ background: id === 'white' ? '#fff' : id === 'grid' ? '#f0f0f0' : '#f5f0e8' }}>{id === 'grid' && <Grid3X3 className="w-4 h-4 text-gray-400 mx-auto" />}</button>
                ))}
                <div className="mt-auto" />
                <button onClick={() => { if (confirm('Tout effacer ?')) { clearCanvas(); clearPreview(); sendData({ type: 'clear', tabId: activeTabId }); } }} className="w-10 h-10 rounded-lg text-red-500 hover:bg-red-100 flex items-center justify-center"><Trash2 className="w-5 h-5" /></button>
            </div>

            <div ref={wrapperRef} className="flex-1 relative overflow-hidden" style={bgStyle} onPointerLeave={() => setCursorPos(null)}>
                {cursorPos && tool === 'eraser' && (
                    <div className="fixed pointer-events-none rounded-full border-2 border-black bg-white/50 z-50 transform -translate-x-1/2 -translate-y-1/2 shadow-sm shadow-white" style={{ left: wrapperRef.current?.getBoundingClientRect().left + cursorPos.x, top: wrapperRef.current?.getBoundingClientRect().top + cursorPos.y, width: thickness * 5, height: thickness * 5 }} />
                )}

                <canvas ref={canvasRef} className="absolute inset-0 w-full h-full z-10" style={{ cursor: tool === 'eraser' ? 'none' : 'crosshair' }} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={() => { setIsDrawing(false); setCursorPos(null); }} />
                <canvas ref={previewCanvasRef} className="absolute inset-0 w-full h-full z-20 pointer-events-none" />

                {textInput && (
                    <textarea key={`${textInput.x}-${textInput.y}`} ref={textRef} className="absolute z-50 bg-white/50 outline-none resize-none overflow-hidden" style={{ left: textInput.x, top: textInput.y, color: textInput.color, fontSize: `${textInput.thickness * 6}px`, fontFamily: 'Inter, sans-serif', minWidth: '20px', lineHeight: 1.2, border: '1px dashed #666' }}
                        autoFocus onKeyDown={e => { if (e.key === 'Escape') setTextInput(null); e.stopPropagation(); }} onPointerDown={e => e.stopPropagation()}
                        onChange={e => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; sendData({ type: 'text-live', x1: textInput.x, y1: textInput.y, text: e.target.value, color: textInput.color, thickness: textInput.thickness }); }}
                        onBlur={e => { if (e.target.value.trim()) { const drawData = { type: 'text-commit', tool: 'text', x1: textInput.x, y1: textInput.y, color: textInput.color, thickness: textInput.thickness, text: e.target.value }; applyDrawing(drawData); sendData(drawData); } setTextInput(null); }}
                    />
                )}

                {remoteText && <span className="absolute pointer-events-none z-30 whitespace-pre" style={{ left: remoteText.x, top: remoteText.y, color: remoteText.color, fontSize: `${remoteText.size}px`, fontFamily: 'Inter, sans-serif', lineHeight: 1.2, textShadow: '0 0 2px white' }}>{remoteText.text}</span>}
                <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = (ev) => { const img = new Image(); img.onload = () => { const w = Math.min(img.width, 400); const h = img.height * (w / img.width); const x = (canvasRef.current.width - w) / 2; const y = (canvasRef.current.height - h) / 2; canvasRef.current.getContext('2d').drawImage(img, x, y, w, h); sendData({ type: 'image', src: ev.target.result, x, y, w, h }); }; img.src = ev.target.result; }; reader.readAsDataURL(file); e.target.value = ''; }} />
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
