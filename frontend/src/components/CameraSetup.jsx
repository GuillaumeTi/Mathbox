import { useState } from 'react';
import './CameraSetup.css';

function CameraSetup({
    cameras,
    selectedFaceCamera,
    setSelectedFaceCamera,
    selectedPaperCamera,
    setSelectedPaperCamera,
    singleCameraType,
    setSingleCameraType,
    onConfirm,
    onCancel
}) {
    const isSingleCamera = cameras.length === 1;

    const handleConfirm = () => {
        if (isSingleCamera && !singleCameraType) {
            alert('Veuillez sélectionner le type de caméra');
            return;
        }
        if (!isSingleCamera && (!selectedFaceCamera || !selectedPaperCamera)) {
            alert('Veuillez sélectionner les deux caméras');
            return;
        }
        onConfirm();
    };

    return (
        <div className="camera-setup-overlay">
            <div className="camera-setup-modal">
                <div className="camera-setup-header">
                    <h2>📹 Configuration des Caméras</h2>
                    <p className="camera-setup-subtitle">
                        {isSingleCamera
                            ? 'Vous avez une seule caméra. Que montre-t-elle ?'
                            : 'Sélectionnez vos caméras pour le visage et la feuille'}
                    </p>
                </div>

                <div className="camera-setup-content">
                    {isSingleCamera ? (
                        // Single camera: ask type
                        <div className="single-camera-choice">
                            <button
                                className={`camera-type-btn ${singleCameraType === 'face' ? 'active' : ''}`}
                                onClick={() => setSingleCameraType('face')}
                            >
                                <div className="camera-type-icon">👤</div>
                                <div className="camera-type-label">Mon Visage</div>
                                <div className="camera-type-desc">La caméra montre mon visage</div>
                            </button>

                            <button
                                className={`camera-type-btn ${singleCameraType === 'paper' ? 'active' : ''}`}
                                onClick={() => setSingleCameraType('paper')}
                            >
                                <div className="camera-type-icon">📄</div>
                                <div className="camera-type-label">Ma Feuille</div>
                                <div className="camera-type-desc">La caméra montre ma feuille de travail</div>
                            </button>
                        </div>
                    ) : (
                        // Multiple cameras: select face and paper
                        <div className="dual-camera-selection">
                            <div className="camera-select-group">
                                <label className="camera-select-label">
                                    <span className="camera-icon">👤</span>
                                    Caméra du Visage
                                </label>
                                <select
                                    value={selectedFaceCamera || ''}
                                    onChange={(e) => setSelectedFaceCamera(e.target.value)}
                                    className="camera-select"
                                >
                                    <option value="">Sélectionner...</option>
                                    {cameras.map((camera, index) => (
                                        <option key={camera.deviceId} value={camera.deviceId}>
                                            {camera.label || `Caméra ${index + 1}`}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="camera-select-group">
                                <label className="camera-select-label">
                                    <span className="camera-icon">📄</span>
                                    Caméra de la Feuille
                                </label>
                                <select
                                    value={selectedPaperCamera || ''}
                                    onChange={(e) => setSelectedPaperCamera(e.target.value)}
                                    className="camera-select"
                                >
                                    <option value="">Sélectionner...</option>
                                    {cameras.map((camera, index) => (
                                        <option key={camera.deviceId} value={camera.deviceId}>
                                            {camera.label || `Caméra ${index + 1}`}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {selectedFaceCamera && selectedPaperCamera && selectedFaceCamera === selectedPaperCamera && (
                                <div className="camera-warning">
                                    ⚠️ Vous avez sélectionné la même caméra deux fois
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="camera-setup-actions">
                    {onCancel && (
                        <button onClick={onCancel} className="btn-cancel">
                            Annuler
                        </button>
                    )}
                    <button onClick={handleConfirm} className="btn-confirm">
                        Confirmer
                    </button>
                </div>
            </div>
        </div>
    );
}

export default CameraSetup;
