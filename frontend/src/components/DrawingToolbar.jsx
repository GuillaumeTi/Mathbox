import './DrawingToolbar.css';

function DrawingToolbar({
    tool,
    setTool,
    color,
    setColor,
    onClearAll,
    onScreenShare,
    isScreenSharing
}) {
    const colors = [
        { name: 'Rouge', value: '#EF4444' },
        { name: 'Bleu', value: '#3B82F6' },
        { name: 'Vert', value: '#10B981' }
    ];

    return (
        <div className="drawing-toolbar">
            <div className="toolbar-section">
                <div className="toolbar-label">Outils</div>
                <div className="toolbar-tools">
                    <button
                        className={`tool-btn ${tool === 'pen' ? 'active' : ''}`}
                        onClick={() => setTool('pen')}
                        title="Stylo"
                    >
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                            <path d="M12 19l7-7 3 3-7 7-3-3z" />
                            <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
                            <path d="M2 2l7.586 7.586" />
                        </svg>
                        <span>Stylo</span>
                    </button>

                    <button
                        className={`tool-btn ${tool === 'highlighter' ? 'active' : ''}`}
                        onClick={() => setTool('highlighter')}
                        title="Surligneur"
                    >
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                            <path d="M9 11l3 3L22 4" />
                            <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
                        </svg>
                        <span>Surligneur</span>
                    </button>

                    <button
                        className={`tool-btn ${tool === 'eraser' ? 'active' : ''}`}
                        onClick={() => setTool('eraser')}
                        title="Gomme"
                    >
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                            <path d="M20 20H7L3 16l10-10 8 8-1 1z" />
                            <path d="M8 12l4 4" />
                        </svg>
                        <span>Gomme</span>
                    </button>

                    <button
                        className={`tool-btn ${tool === 'laser' ? 'active' : ''}`}
                        onClick={() => setTool('laser')}
                        title="Pointeur Laser"
                    >
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                            <circle cx="12" cy="12" r="3" />
                            <path d="M12 1v6m0 6v6M1 12h6m6 0h6" />
                        </svg>
                        <span>Laser</span>
                    </button>
                </div>
            </div>

            {tool === 'pen' && (
                <div className="toolbar-section">
                    <div className="toolbar-label">Couleur</div>
                    <div className="toolbar-colors">
                        {colors.map(c => (
                            <button
                                key={c.value}
                                className={`color-btn ${color === c.value ? 'active' : ''}`}
                                style={{ backgroundColor: c.value }}
                                onClick={() => setColor(c.value)}
                                title={c.name}
                            />
                        ))}
                    </div>
                </div>
            )}

            <div className="toolbar-section">
                <div className="toolbar-label">Actions</div>
                <div className="toolbar-actions">
                    <button
                        className="action-btn"
                        onClick={onClearAll}
                        title="Effacer tout"
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                            <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                        </svg>
                        <span>Effacer</span>
                    </button>

                    <button
                        className={`action-btn ${isScreenSharing ? 'active' : ''}`}
                        onClick={onScreenShare}
                        title={isScreenSharing ? "Arrêter le partage" : "Partager l'écran"}
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                            <rect x="2" y="3" width="20" height="14" rx="2" />
                            <path d="M8 21h8M12 17v4" />
                        </svg>
                        <span>{isScreenSharing ? 'Arrêter' : 'Partager'}</span>
                    </button>
                </div>
            </div>
        </div>
    );
}

export default DrawingToolbar;
