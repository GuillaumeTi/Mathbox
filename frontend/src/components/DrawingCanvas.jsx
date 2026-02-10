import './DrawingCanvas.css';

function DrawingCanvas({ canvasRef, isProfessor, tool }) {
    return (
        <canvas
            ref={canvasRef}
            className={`drawing-canvas ${isProfessor ? 'interactive' : 'readonly'}`}
            style={{
                cursor: isProfessor ? (
                    tool === 'pen' ? 'crosshair' :
                        tool === 'highlighter' ? 'cell' :
                            tool === 'eraser' ? 'not-allowed' :
                                tool === 'laser' ? 'pointer' :
                                    'default'
                ) : 'default',
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                pointerEvents: isProfessor ? 'auto' : 'none',
                touchAction: 'none'
            }}
        />
    );
}

export default DrawingCanvas;
