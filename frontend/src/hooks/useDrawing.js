import { useRef, useCallback } from 'react';

/**
 * Drawing hook inspired by working example
 * - Fixed canvas size: 1920x1080
 * - Relative coordinates: 0-1
 * - trackSid-based targeting
 */
export function useDrawing(canvasRef, trackSid, room, isProfessor) {
    const isDrawingRef = useRef(false);
    const lastPointRef = useRef(null);

    // Get relative coordinates (0-1) from mouse/touch event
    const getRelativeCoords = useCallback((e) => {
        if (!canvasRef.current) return null;

        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();

        let clientX, clientY;
        if (e.touches && e.touches.length > 0) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }

        const x = (clientX - rect.left) / rect.width;
        const y = (clientY - rect.top) / rect.height;

        return { x, y };
    }, [canvasRef]);

    // Draw line on canvas using relative coordinates
    const drawLine = useCallback((fromX, fromY, toX, toY, color, lineWidth) => {
        if (!canvasRef.current) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Convert relative coords (0-1) to absolute canvas coords
        const absFromX = fromX * canvas.width;
        const absFromY = fromY * canvas.height;
        const absToX = toX * canvas.width;
        const absToY = toY * canvas.height;

        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        ctx.beginPath();
        ctx.moveTo(absFromX, absFromY);
        ctx.lineTo(absToX, absToY);
        ctx.stroke();
    }, [canvasRef]);

    const startDrawing = useCallback((e) => {
        if (!isProfessor) return;

        e.preventDefault();
        isDrawingRef.current = true;
        const coords = getRelativeCoords(e);
        lastPointRef.current = coords;
    }, [isProfessor, getRelativeCoords]);

    const draw = useCallback((e, color, lineWidth) => {
        if (!isProfessor || !isDrawingRef.current || !lastPointRef.current) return;

        e.preventDefault();
        const currentPoint = getRelativeCoords(e);
        if (!currentPoint) return;

        // Draw locally
        drawLine(
            lastPointRef.current.x,
            lastPointRef.current.y,
            currentPoint.x,
            currentPoint.y,
            color,
            lineWidth
        );

        // Send to remote via LiveKit data channel
        const encoder = new TextEncoder();
        const dataObject = {
            type: 'draw',
            trackSid,
            x: currentPoint.x,
            y: currentPoint.y,
            prevX: lastPointRef.current.x,
            prevY: lastPointRef.current.y,
            color,
            lineWidth
        };
        const payload = encoder.encode(JSON.stringify(dataObject));

        // Fix: publishData(data, options)
        // options: { reliable: boolean, destination: [], topic: string }
        if (room && trackSid) {
            room.localParticipant.publishData(payload, { reliable: true });
        }

        lastPointRef.current = currentPoint;
    }, [isProfessor, getRelativeCoords, room, trackSid, drawLine]);

    const stopDrawing = useCallback(() => {
        isDrawingRef.current = false;
        lastPointRef.current = null;
    }, []);

    // Handle received drawing data
    const handleDataReceived = useCallback((payload) => {
        try {
            const decoder = new TextDecoder();
            const text = decoder.decode(payload);
            const data = JSON.parse(text);

            // Only process if it's for this canvas
            if (data.trackSid !== trackSid) return;

            if (data.type === 'draw') {
                drawLine(data.prevX, data.prevY, data.x, data.y, data.color, data.lineWidth);
            } else if (data.type === 'clear') {
                if (canvasRef.current) {
                    const ctx = canvasRef.current.getContext('2d');
                    if (ctx) {
                        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
                    }
                }
            }
        } catch (error) {
            console.error('Error handling drawing data:', error);
        }
    }, [trackSid, drawLine, canvasRef]);

    return {
        startDrawing,
        draw,
        stopDrawing,
        handleDataReceived
    };
}
