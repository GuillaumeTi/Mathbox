import { useState, useEffect } from 'react';
import { createLocalVideoTrack, LocalTrack } from 'livekit-client';

/**
 * Multi-camera hook for students
 * - Enumerates cameras
 * - Publishes in order: Face first, Paper second
 * - NO trackName (just like working example)
 */
export function useMultiCamera(room, isStudent) {
    const [cameras, setCameras] = useState([]);
    const [selectedFaceCamera, setSelectedFaceCamera] = useState('');
    const [selectedPaperCamera, setSelectedPaperCamera] = useState('');
    const [singleCameraType, setSingleCameraType] = useState(''); // 'face' or 'paper'
    const [showCameraSetup, setShowCameraSetup] = useState(false);
    const [publishedTracks, setPublishedTracks] = useState([]);

    // Enumerate cameras on mount (students only)
    useEffect(() => {
        if (!isStudent) return;

        const enumerateCameras = async () => {
            try {
                const devices = await navigator.mediaDevices.enumerateDevices();
                const videoDevices = devices.filter(device => device.kind === 'videoinput');

                console.log('📹 Available cameras:', videoDevices.length);
                setCameras(videoDevices);

                // Show setup modal if cameras are available
                if (videoDevices.length > 0) {
                    setShowCameraSetup(true);
                }
            } catch (error) {
                console.error('❌ Error enumerating cameras:', error);
            }
        };

        enumerateCameras();
    }, [isStudent]);

    // Publish cameras - NO trackName, just publish in order
    const publishCameras = async () => {
        if (!room || !isStudent) {
            console.log('❌ Cannot publish - no room or not student');
            return;
        }

        try {
            const tracks = [];

            // Single camera mode
            if (cameras.length === 1 && singleCameraType) {
                console.log('📹 Publishing single camera (type:', singleCameraType, ')');

                const track = await createLocalVideoTrack({
                    deviceId: cameras[0].deviceId,
                    resolution: { width: 1280, height: 720 },
                });

                // NO trackName - just publish
                await room.localParticipant.publishTrack(track);
                tracks.push(track);

                console.log('✅ Published 1 camera');
            }
            // Dual camera mode
            else if (selectedFaceCamera && selectedPaperCamera) {
                console.log('📹 Publishing dual cameras (Face + Paper)');

                // Publish FACE camera FIRST
                const faceTrack = await createLocalVideoTrack({
                    deviceId: selectedFaceCamera,
                    resolution: { width: 1280, height: 720 },
                });
                await room.localParticipant.publishTrack(faceTrack);
                tracks.push(faceTrack);
                console.log('✅ Published Face camera (track 0)');

                // Publish PAPER camera SECOND
                const paperTrack = await createLocalVideoTrack({
                    deviceId: selectedPaperCamera,
                    resolution: { width: 1920, height: 1080 }, // Higher res for paper
                });
                await room.localParticipant.publishTrack(paperTrack);
                tracks.push(paperTrack);
                console.log('✅ Published Paper camera (track 1)');
            } else {
                console.log('❌ Invalid camera configuration', {
                    camerasLength: cameras.length,
                    singleCameraType,
                    selectedFaceCamera,
                    selectedPaperCamera
                });
            }

            setPublishedTracks(tracks);
            setShowCameraSetup(false);
        } catch (error) {
            console.error('❌ Error publishing cameras:', error);
        }
    };

    return {
        cameras,
        selectedFaceCamera,
        setSelectedFaceCamera,
        selectedPaperCamera,
        setSelectedPaperCamera,
        showCameraSetup,
        setShowCameraSetup,
        singleCameraType,
        setSingleCameraType,
        publishCameras,
        publishedTracks
    };
}
