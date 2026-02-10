import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { LiveKitRoom, VideoTrack, AudioTrack, useRoomContext, useTracks } from '@livekit/components-react';
import { Track, RoomEvent, DataPacket_Kind } from 'livekit-client';
import { useMultiCamera } from '../hooks/useMultiCamera';
import { useDrawing } from '../hooks/useDrawing';
import CameraSetup from '../components/CameraSetup';
import DrawingToolbar from '../components/DrawingToolbar';
import './VideoRoom.css';

function VideoRoom({ user, token }) {
    const { roomName } = useParams();
    const [livekitToken, setLivekitToken] = useState('');
    const [livekitUrl, setLivekitUrl] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        fetchLivekitToken();
    }, [roomName]);

    const fetchLivekitToken = async () => {
        try {
            const response = await fetch('/api/livekit-token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({ room_name: roomName }),
            });

            if (!response.ok) {
                setError('Erreur de connexion à la salle');
                setLoading(false);
                return;
            }

            const data = await response.json();
            setLivekitToken(data.token);
            setLivekitUrl(data.url);
            setLoading(false);
        } catch (error) {
            console.error('Error fetching LiveKit token:', error);
            setError('Erreur de connexion à la salle');
            setLoading(false);
        }
    };

    if (error) {
        return (
            <div className="video-room-error">
                <div className="error-content">
                    <div className="error-icon">⚠️</div>
                    <div className="error-message">{error}</div>
                    <button
                        onClick={() => navigate(user.role === 'PROF' ? '/professor' : '/student')}
                        className="btn-back"
                    >
                        Retour au tableau de bord
                    </button>
                </div>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="video-room-loading">
                <div className="loading-content">
                    <div className="loading-spinner"></div>
                    <div className="loading-text">Connexion à la salle...</div>
                </div>
            </div>
        );
    }

    return (
        <div className="video-room-container">
            <LiveKitRoom
                token={livekitToken}
                serverUrl={livekitUrl}
                connect={true}
                audio={true}
                video={user.role === 'PROF'}
                onError={(error) => console.error('LiveKit error:', error)}
            >
                <RoomContent
                    user={user}
                    onLeave={() => navigate(user.role === 'PROF' ? '/professor' : '/student')}
                />
            </LiveKitRoom>
        </div>
    );
}

function RoomContent({ user, onLeave }) {
    const room = useRoomContext();
    const isProfessor = user.role === 'PROF';
    const isStudent = user.role === 'STUDENT';

    // Multi-camera setup for students
    const cameraSetup = useMultiCamera(room, isStudent);

    // Drawing state
    const [tool, setTool] = useState('pen');
    const [color, setColor] = useState('#EF4444');
    const [lineWidth, setLineWidth] = useState(3);
    const [isScreenSharing, setIsScreenSharing] = useState(false);

    // Get all tracks
    const tracks = useTracks([
        { source: Track.Source.Camera, withPlaceholder: false },
        { source: Track.Source.ScreenShare, withPlaceholder: false },
    ]);

    // Separate local and remote tracks
    const localTracks = tracks.filter(t => t.participant.isLocal);
    const remoteTracks = tracks.filter(t => !t.participant.isLocal);

    // Find screen share
    const screenShareTrack = tracks.find(t => t.source === Track.Source.ScreenShare);

    // PROFESSOR VIEW: Get student tracks
    let studentFaceTrack = null;
    let studentPaperTrack = null;

    if (isProfessor) {
        const studentCameraTracks = remoteTracks.filter(t => t.source === Track.Source.Camera);
        console.log('👨‍🏫 Prof View - Student Tracks:', studentCameraTracks.length);

        if (studentCameraTracks.length > 0) {
            // Priority: Face (0), Paper (1)
            studentFaceTrack = studentCameraTracks[0];
            studentPaperTrack = studentCameraTracks.length > 1 ? studentCameraTracks[1] : studentCameraTracks[0];
        }
    }

    // STUDENT VIEW: Get own tracks
    let myFaceTrack = null;
    let myPaperTrack = null;

    if (isStudent) {
        const myCameraTracks = localTracks.filter(t => t.source === Track.Source.Camera);
        console.log('👨‍🎓 Student View - My Tracks:', myCameraTracks.length);

        if (myCameraTracks.length > 0) {
            // Priority: Paper (for main view), Face (for PiP)
            // If only 1 camera, it's used as Paper
            if (myCameraTracks.length === 1) {
                myPaperTrack = myCameraTracks[0];
            } else {
                myFaceTrack = myCameraTracks[0]; // First published is Face
                myPaperTrack = myCameraTracks[1]; // Second published is Paper
            }
        }
    }

    // Professor's camera
    const professorTrack = isProfessor ?
        localTracks.find(t => t.source === Track.Source.Camera) :
        remoteTracks.find(t => t.participant.identity?.startsWith('PROF') && t.source === Track.Source.Camera);

    // Main video: screen share > paper camera (student's for prof, own for student)
    const mainTrack = screenShareTrack || (isProfessor ? studentPaperTrack : myPaperTrack);
    const mainTrackSid = mainTrack?.publication?.trackSid;

    console.log('🎥 Rendering tracks:', {
        isProfessor,
        mainTrack: mainTrack?.source,
        studentFace: studentFaceTrack?.source,
        studentPaper: studentPaperTrack?.source,
        myFace: myFaceTrack?.source,
        myPaper: myPaperTrack?.source,
        profTrack: professorTrack?.source
    });

    // Handle screen sharing
    const handleScreenShare = async () => {
        if (isScreenSharing) {
            const screenTracks = room.localParticipant.videoTracks;
            screenTracks.forEach((publication) => {
                if (publication.source === Track.Source.ScreenShare) {
                    room.localParticipant.unpublishTrack(publication.track);
                }
            });
            setIsScreenSharing(false);
        } else {
            try {
                const stream = await navigator.mediaDevices.getDisplayMedia({
                    video: true,
                    audio: false
                });

                const track = stream.getVideoTracks()[0];

                track.onended = () => {
                    setIsScreenSharing(false);
                };

                await room.localParticipant.publishTrack(track, {
                    source: Track.Source.ScreenShare
                });

                setIsScreenSharing(true);
            } catch (error) {
                console.error('Error sharing screen:', error);
            }
        }
    };

    // Publish cameras after setup
    useEffect(() => {
        if (isStudent && !cameraSetup.showCameraSetup && room) {
            cameraSetup.publishCameras();
        }
    }, [cameraSetup.showCameraSetup, room, isStudent]);

    return (
        <>
            {/* Camera Setup Modal for Students */}
            {isStudent && cameraSetup.showCameraSetup && (
                <CameraSetup
                    cameras={cameraSetup.cameras}
                    selectedFaceCamera={cameraSetup.selectedFaceCamera}
                    setSelectedFaceCamera={cameraSetup.setSelectedFaceCamera}
                    selectedPaperCamera={cameraSetup.selectedPaperCamera}
                    setSelectedPaperCamera={cameraSetup.setSelectedPaperCamera}
                    singleCameraType={cameraSetup.singleCameraType}
                    setSingleCameraType={cameraSetup.setSingleCameraType}
                    onConfirm={() => cameraSetup.setShowCameraSetup(false)}
                />
            )}

            {/* Main Room Interface */}
            <div className="room-layout">
                {/* Main Video Area */}
                <div className="main-video-area">
                    {mainTrack ? (
                        <VideoWithCanvas
                            trackRef={mainTrack}
                            trackSid={mainTrackSid}
                            room={room}
                            isProfessor={isProfessor}
                            tool={tool}
                            color={color}
                            lineWidth={lineWidth}
                        />
                    ) : (
                        <div className="no-video-placeholder">
                            <div className="placeholder-icon">📹</div>
                            <div className="placeholder-text">
                                {isProfessor ? "En attente de la caméra de l'étudiant..." : "En attente..."}
                            </div>
                        </div>
                    )}
                </div>

                {/* PiP Videos */}
                {/* Top Right: Professor (for Student) OR Student Face (for Prof) */}
                {((isProfessor && studentFaceTrack) || (isStudent && professorTrack)) && (
                    <div className="pip-top-right">
                        <VideoTrack
                            trackRef={isProfessor ? studentFaceTrack : professorTrack}
                            className="pip-video"
                        />
                        {/* Audio is handled automatically by LiveKitRoom, but we can add explicit AudioTrack if needed */}
                        <div className="pip-label">
                            {isProfessor ? 'Étudiant (Visage)' : 'Professeur'}
                        </div>
                    </div>
                )}

                {/* Bottom Right: Self (Prof) OR Student Face (Student - only if dual) */}
                {((isProfessor && professorTrack) || (isStudent && myFaceTrack)) && (
                    <div className="pip-bottom-right">
                        <VideoTrack
                            trackRef={isProfessor ? professorTrack : myFaceTrack}
                            className="pip-video"
                        />
                        <div className="pip-label">
                            {isProfessor ? 'Moi' : 'Moi (Visage)'}
                        </div>
                    </div>
                )}

                {/* Drawing Toolbar (Professor only) */}
                {isProfessor && mainTrack && (
                    <DrawingToolbar
                        tool={tool}
                        setTool={setTool}
                        color={color}
                        setColor={setColor}
                        lineWidth={lineWidth}
                        setLineWidth={setLineWidth}
                        onClearAll={() => {
                            if (room && mainTrackSid) {
                                const clearData = {
                                    type: 'clear',
                                    trackSid: mainTrackSid
                                };
                                const encoder = new TextEncoder();
                                const payload = encoder.encode(JSON.stringify(clearData));
                                room.localParticipant.publishData(payload, DataPacket_Kind.RELIABLE);

                                // Also clear locally
                                const event = new CustomEvent('clearCanvas', { detail: { trackSid: mainTrackSid } });
                                window.dispatchEvent(event);
                            }
                        }}
                        onScreenShare={handleScreenShare}
                        isScreenSharing={isScreenSharing}
                    />
                )}

                {/* Leave Button */}
                <button onClick={onLeave} className="btn-leave">
                    🚪 Quitter
                </button>
            </div>
        </>
    );
}

// Component that combines video and canvas
function VideoWithCanvas({ trackRef, trackSid, room, isProfessor, tool, color, lineWidth }) {
    const canvasRef = useRef(null);
    const videoRef = useRef(null);
    const isEraser = tool === 'eraser';

    // Use the slider value for pen/eraser. 
    // If you want fixed size for eraser: const currentLineWidth = isEraser ? 20 : lineWidth;
    // But user asked to configure thickness, so let's stick to slider for both or at least for pen.
    // The previous code had fixed sizes. Let's use the slider value.
    // However, eraser usually needs to be bigger. Let's default eraser to a multiplier or just use the slider.
    // Requester said: "Pour le stylo, je veux que tu rajoutes le noir... et que je puisse configurer l'épaisseur".
    // Didn't explicitly say for Eraser. But let's apply it to both for flexibility.

    // Drawing hook
    const drawing = useDrawing(canvasRef, trackSid, room, isProfessor);

    // Listen for drawing data from remote
    useEffect(() => {
        if (!room) return;

        const handleData = (payload) => {
            drawing.handleDataReceived(payload);
        };

        room.on(RoomEvent.DataReceived, handleData);

        return () => {
            room.off(RoomEvent.DataReceived, handleData);
        };
    }, [room, drawing]);

    // Listen for clear canvas event
    useEffect(() => {
        const handleClear = (e) => {
            if (e.detail.trackSid === trackSid && canvasRef.current) {
                const ctx = canvasRef.current.getContext('2d');
                if (ctx) {
                    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
                }
            }
        };

        window.addEventListener('clearCanvas', handleClear);
        return () => window.removeEventListener('clearCanvas', handleClear);
    }, [trackSid]);

    // Custom cursor for eraser (white circle with black border matching lineWidth exactly)
    const eraserCursor = useMemo(() => {
        const size = Math.max(lineWidth, 4); // Minimum size for visibility
        const fullSize = size + 2;
        const center = fullSize / 2;
        const radius = size / 2;
        const svg = `<svg width="${fullSize}" height="${fullSize}" viewBox="0 0 ${fullSize} ${fullSize}" xmlns="http://www.w3.org/2000/svg"><circle cx="${center}" cy="${center}" r="${radius}" fill="white" stroke="black" stroke-width="1"/></svg>`;
        return `url('data:image/svg+xml;base64,${btoa(svg)}') ${center} ${center}, auto`;
    }, [lineWidth]);

    return (
        <div className="main-video-wrapper" ref={videoRef}>
            <VideoTrack
                trackRef={trackRef}
                className="main-video"
            />
            <AudioTrack trackRef={trackRef} />

            {/* Fixed size canvas overlay - 1920x1080 */}
            <canvas
                ref={canvasRef}
                className="drawing-canvas"
                width={1920}
                height={1080}
                onMouseDown={drawing.startDrawing}
                onMouseMove={(e) => drawing.draw(e, color, lineWidth, isEraser)}
                onMouseUp={drawing.stopDrawing}
                onMouseLeave={drawing.stopDrawing}
                onTouchStart={drawing.startDrawing}
                onTouchMove={(e) => drawing.draw(e, color, lineWidth, isEraser)}
                onTouchEnd={drawing.stopDrawing}
                style={{
                    cursor: isProfessor ? (isEraser ? eraserCursor : 'crosshair') : 'default',
                    pointerEvents: isProfessor ? 'auto' : 'none'
                }}
            />
        </div>
    );
}

export default VideoRoom;
