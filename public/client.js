// ============================================
// VERSIÓN FINAL - CON PANTALLA COMPLETA Y OPTIMIZACIONES
// ============================================

console.log('🚀 Cliente final iniciando...');

// Panel de diagnóstico
const diagnosticPanel = document.createElement('div');
diagnosticPanel.id = 'diagnosticPanel';
diagnosticPanel.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    background: black;
    color: #00ff00;
    font-family: monospace;
    font-size: 12px;
    padding: 10px;
    z-index: 10000;
    max-height: 200px;
    overflow-y: auto;
    border-bottom: 3px solid #ff0000;
`;
document.body.appendChild(diagnosticPanel);

function log(msg, type = 'INFO') {
    const time = new Date().toLocaleTimeString();
    const logMsg = `[${time}] [${type}] ${msg}`;
    console.log(logMsg);
    
    const line = document.createElement('div');
    line.textContent = logMsg;
    diagnosticPanel.appendChild(line);
    diagnosticPanel.scrollTop = diagnosticPanel.scrollHeight;
    while (diagnosticPanel.children.length > 15) {
        diagnosticPanel.removeChild(diagnosticPanel.firstChild);
    }
}

log('🔧 Panel de diagnóstico activado');

document.addEventListener('DOMContentLoaded', function() {
    log('✅ DOM listo');
    
    // ============================================
    // ELEMENTOS DEL DOM
    // ============================================
    const elements = {
        localVideo: document.getElementById('localVideo'),
        remoteVideo: document.getElementById('remoteVideo'),
        startBtn: document.getElementById('startBtn'),
        stopBtn: document.getElementById('stopBtn'),
        joinBtn: document.getElementById('joinBtn'),
        leaveBtn: document.getElementById('leaveBtn'),
        roomId: document.getElementById('roomId'),
        viewRoomId: document.getElementById('viewRoomId'),
        localOverlay: document.getElementById('localOverlay'),
        remoteOverlay: document.getElementById('remoteOverlay'),
        statusText: document.getElementById('statusText'),
        viewerCount: document.getElementById('viewerCount'),
        deviceInfo: document.getElementById('deviceInfo'),
        fullscreenBtn: document.getElementById('fullscreenBtn')
    };
    
    // ============================================
    // ESTADO
    // ============================================
    let socket = null;
    let localStream = null;
    let peerConnections = new Map();
    let peerConnectionViewer = null;
    let currentRoom = null;
    let isBroadcaster = false;
    let isViewer = false;
    
    // ============================================
    // CONFIGURACIÓN STUN
    // ============================================
    const configuration = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' }
        ]
    };
    
    // ============================================
    // FUNCIONES AUXILIARES
    // ============================================
    function updateStatus(msg) {
        log(msg, 'STATUS');
        if (elements.statusText) elements.statusText.textContent = msg;
    }
    
    function resetUI() {
        if (isBroadcaster) {
            for (const [id, pc] of peerConnections.entries()) {
                pc.close();
            }
            peerConnections.clear();
        }
        
        if (peerConnectionViewer) {
            peerConnectionViewer.close();
            peerConnectionViewer = null;
        }
        
        if (localStream) {
            localStream.getTracks().forEach(t => t.stop());
            localStream = null;
        }
        
        if (elements.localVideo) elements.localVideo.srcObject = null;
        if (elements.remoteVideo) elements.remoteVideo.srcObject = null;
        if (elements.localOverlay) elements.localOverlay.style.display = 'flex';
        if (elements.remoteOverlay) elements.remoteOverlay.style.display = 'flex';
        
        isBroadcaster = false;
        isViewer = false;
        currentRoom = null;
        
        if (elements.startBtn) elements.startBtn.disabled = false;
        if (elements.stopBtn) elements.stopBtn.disabled = true;
        if (elements.joinBtn) {
            elements.joinBtn.disabled = false;
            elements.joinBtn.textContent = 'Unirse';
        }
        if (elements.leaveBtn) elements.leaveBtn.disabled = true;
        if (elements.viewerCount) elements.viewerCount.textContent = '0 espectadores';
    }
    
    // ============================================
    // CONEXIÓN AL SERVIDOR
    // ============================================
    function connectToServer() {
        log('Conectando al servidor...');
        
        socket = io();
        
        socket.on('connect', () => {
            log('✅ Conectado al servidor', 'SUCCESS');
            updateStatus('Conectado');
        });
        
        socket.on('disconnect', () => {
            log('❌ Desconectado', 'ERROR');
            resetUI();
        });
        
        socket.on('broadcaster-ready', () => {
            log('📡 Modo transmisor listo', 'SUCCESS');
        });
        
        socket.on('room-joined', (data) => {
            currentRoom = data.roomId;
            isViewer = true;
            log(`✅ Unido a sala: ${data.roomId}`, 'SUCCESS');
            updateStatus(`Unido a ${data.roomId}`);
            if (elements.remoteOverlay) elements.remoteOverlay.style.display = 'none';
            if (elements.joinBtn) {
                elements.joinBtn.disabled = false;
                elements.joinBtn.textContent = 'Unirse';
            }
        });
        
        socket.on('room-error', (error) => {
            log(`❌ Error: ${error}`, 'ERROR');
            resetUI();
        });
        
        socket.on('broadcaster-disconnected', () => {
            log('📡 Transmisor desconectado', 'WARN');
            if (elements.remoteVideo) elements.remoteVideo.srcObject = null;
            if (elements.remoteOverlay) elements.remoteOverlay.style.display = 'flex';
            resetUI();
        });
        
        socket.on('viewers-update', (data) => {
            log(`👥 Viewers: ${data.total}`, 'INFO');
            if (elements.viewerCount) {
                elements.viewerCount.textContent = `${data.total} espectadores`;
            }
        });
        
        // ============================================
        // EVENTOS PARA BROADCASTER
        // ============================================
        socket.on('viewer-joined', (data) => {
            const viewerId = data.viewerId;
            log(`🔥 NUEVO VIEWER: ${viewerId}`, 'CRITICAL');
            
            if (!isBroadcaster || !localStream) {
                log('❌ No soy broadcaster o no hay stream', 'ERROR');
                return;
            }
            
            // Crear nueva conexión para este viewer
            log(`🆕 Creando conexión para ${viewerId}`, 'INFO');
            const pc = new RTCPeerConnection(configuration);
            
            localStream.getTracks().forEach(track => {
                pc.addTrack(track, localStream);
            });
            
            pc.onicecandidate = (event) => {
                if (event.candidate) {
                    socket.emit('ice-candidate', {
                        target: viewerId,
                        candidate: event.candidate
                    });
                }
            };
            
            pc.oniceconnectionstatechange = () => {
                log(`🧊 ICE ${viewerId}: ${pc.iceConnectionState}`, 'INFO');
            };
            
            peerConnections.set(viewerId, pc);
            
            // Crear oferta
            pc.createOffer()
                .then(offer => {
                    log(`✅ Oferta creada para ${viewerId}`, 'SUCCESS');
                    return pc.setLocalDescription(offer);
                })
                .then(() => {
                    socket.emit('offer', {
                        target: viewerId,
                        offer: pc.localDescription
                    });
                    log(`📤 Oferta enviada a ${viewerId}`, 'SUCCESS');
                })
                .catch(err => {
                    log(`❌ Error: ${err.message}`, 'ERROR');
                    peerConnections.delete(viewerId);
                });
        });
        
        socket.on('viewer-left', (data) => {
            const viewerId = data.viewerId;
            log(`👋 Viewer ${viewerId} desconectado`, 'INFO');
            
            const pc = peerConnections.get(viewerId);
            if (pc) {
                pc.close();
                peerConnections.delete(viewerId);
                log(`🧹 Conexión de ${viewerId} eliminada`, 'INFO');
            }
        });
        
        // ============================================
        // EVENTOS WEBRTC
        // ============================================
        socket.on('offer', handleOffer);
        socket.on('answer', handleAnswer);
        socket.on('ice-candidate', handleIceCandidate);
    }
    
    // ============================================
    // HANDLERS WEBRTC
    // ============================================
    async function handleOffer(data) {
        log(`📥 Oferta recibida de ${data.from}`, 'SUCCESS');
        
        if (isBroadcaster) return;
        
        try {
            if (!peerConnectionViewer) {
                peerConnectionViewer = new RTCPeerConnection(configuration);
                
                peerConnectionViewer.ontrack = (event) => {
                    log('🎥 VIDEO RECIBIDO 🎥', 'SUCCESS');
                    if (elements.remoteVideo) {
                        elements.remoteVideo.srcObject = event.streams[0];
                        if (elements.remoteOverlay) {
                            elements.remoteOverlay.style.display = 'none';
                        }
                        elements.remoteVideo.play().catch(e => log(`Error play: ${e.message}`, 'WARN'));
                    }
                };
                
                peerConnectionViewer.onicecandidate = (event) => {
                    if (event.candidate) {
                        socket.emit('ice-candidate', {
                            target: data.from,
                            candidate: event.candidate
                        });
                    }
                };
            }
            
            await peerConnectionViewer.setRemoteDescription(new RTCSessionDescription(data.offer));
            log('✅ Remote description set', 'SUCCESS');
            
            const answer = await peerConnectionViewer.createAnswer();
            await peerConnectionViewer.setLocalDescription(answer);
            log('✅ Answer creada', 'SUCCESS');
            
            socket.emit('answer', {
                target: data.from,
                answer: answer
            });
            log('📤 Respuesta enviada', 'SUCCESS');
            
        } catch (err) {
            log(`❌ Error: ${err.message}`, 'ERROR');
        }
    }
    
    async function handleAnswer(data) {
        const viewerId = data.from;
        log(`📥 Respuesta recibida de ${viewerId}`, 'SUCCESS');
        
        if (isBroadcaster) {
            const pc = peerConnections.get(viewerId);
            if (pc) {
                try {
                    await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
                    log(`✅ Remote description set para ${viewerId}`, 'SUCCESS');
                } catch (err) {
                    log(`❌ Error: ${err.message}`, 'ERROR');
                }
            } else {
                log(`❌ No peer connection para ${viewerId}`, 'ERROR');
            }
        }
    }
    
    async function handleIceCandidate(data) {
        const fromId = data.from;
        log(`🧊 ICE candidate de ${fromId}`, 'INFO');
        
        try {
            if (isBroadcaster) {
                const pc = peerConnections.get(fromId);
                if (pc) {
                    await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
                    log(`✅ ICE agregado para ${fromId}`, 'SUCCESS');
                } else {
                    log(`⚠️ No peer connection para ${fromId}`, 'WARN');
                }
            } else {
                if (peerConnectionViewer) {
                    await peerConnectionViewer.addIceCandidate(new RTCIceCandidate(data.candidate));
                    log(`✅ ICE agregado`, 'SUCCESS');
                }
            }
        } catch (err) {
            log(`❌ Error ICE: ${err.message}`, 'ERROR');
        }
    }
    
    // ============================================
    // FUNCIÓN UNIRSE (VIEWER)
    // ============================================
    function joinRoom() {
        const roomName = elements.viewRoomId?.value.trim();
        if (!roomName) {
            alert('Ingresa un nombre de sala');
            return;
        }
        
        log(`👋 Uniéndose a: ${roomName}`, 'VIEWER');
        
        if (elements.joinBtn) {
            elements.joinBtn.disabled = true;
            elements.joinBtn.textContent = 'Conectando...';
        }
        if (elements.leaveBtn) elements.leaveBtn.disabled = false;
        if (elements.startBtn) elements.startBtn.disabled = true;
        if (elements.remoteOverlay) {
            elements.remoteOverlay.innerHTML = '<span>⏳ Conectando...</span>';
        }
        
        currentRoom = roomName;
        socket.emit('viewer-join', roomName);
        updateStatus(`Uniéndose a ${roomName}...`);
    }
    
    function leaveRoom() {
        log('👋 Saliendo', 'VIEWER');
        
        if (peerConnectionViewer) {
            peerConnectionViewer.close();
            peerConnectionViewer = null;
        }
        
        if (elements.remoteVideo) elements.remoteVideo.srcObject = null;
        if (elements.remoteOverlay) {
            elements.remoteOverlay.style.display = 'flex';
            elements.remoteOverlay.innerHTML = '<span>📺 Esperando...</span>';
        }
        
        if (elements.joinBtn) {
            elements.joinBtn.disabled = false;
            elements.joinBtn.textContent = 'Unirse';
        }
        if (elements.leaveBtn) elements.leaveBtn.disabled = true;
        if (elements.startBtn) elements.startBtn.disabled = false;
        
        currentRoom = null;
        isViewer = false;
        updateStatus('Desconectado');
    }
    
    // ============================================
    // FUNCIÓN TRANSMITIR (BROADCASTER) - OPTIMIZADA
    // ============================================
    async function startBroadcast() {
        try {
            const roomName = elements.roomId?.value.trim();
            if (!roomName) {
                alert('Ingresa un nombre');
                return;
            }
            
            log('📤 Solicitando pantalla...', 'BROADCASTER');
            
            // Calidad balanceada para múltiples viewers
            const videoConstraints = {
                width: { ideal: 640 },
                height: { ideal: 360 },
                frameRate: { ideal: 15 }
            };
            
            localStream = await navigator.mediaDevices.getDisplayMedia({
                video: videoConstraints,
                audio: true
            });
            
            log('✅ Captura obtenida - Calidad: 640p, 15fps', 'SUCCESS');
            
            if (elements.localVideo) {
                elements.localVideo.srcObject = localStream;
            }
            if (elements.localOverlay) {
                elements.localOverlay.style.display = 'none';
            }
            
            isBroadcaster = true;
            currentRoom = roomName;
            
            if (elements.startBtn) elements.startBtn.disabled = true;
            if (elements.stopBtn) elements.stopBtn.disabled = false;
            if (elements.joinBtn) elements.joinBtn.disabled = true;
            
            socket.emit('broadcaster-join', roomName);
            log(`📡 Transmitiendo en ${roomName}`, 'BROADCASTER');
            
            localStream.getVideoTracks()[0].onended = () => stopBroadcast();
            
            updateStatus(`📡 Transmitiendo en ${roomName}`);
            
        } catch (err) {
            log(`❌ Error: ${err.message}`, 'ERROR');
            resetUI();
        }
    }
    
    function stopBroadcast() {
        log('⏹️ Deteniendo...', 'BROADCASTER');
        
        for (const [id, pc] of peerConnections.entries()) {
            pc.close();
        }
        peerConnections.clear();
        
        if (localStream) {
            localStream.getTracks().forEach(t => t.stop());
            localStream = null;
        }
        
        if (currentRoom && isBroadcaster) {
            socket.emit('stop-broadcast', currentRoom);
        }
        
        if (elements.localVideo) elements.localVideo.srcObject = null;
        if (elements.localOverlay) elements.localOverlay.style.display = 'flex';
        
        resetUI();
        updateStatus('⏹️ Transmisión detenida');
    }
    
    // ============================================
    // FUNCIÓN DE PANTALLA COMPLETA
    // ============================================
    function setupFullscreen() {
        const remoteVideo = elements.remoteVideo;
        const fullscreenBtn = elements.fullscreenBtn;
        
        if (!remoteVideo) {
            log('⚠️ Elemento remoteVideo no encontrado', 'WARN');
            return;
        }
        
        if (!fullscreenBtn) {
            log('⚠️ Botón fullscreen no encontrado', 'WARN');
            return;
        }
        
        fullscreenBtn.addEventListener('click', toggleFullscreen);
        remoteVideo.addEventListener('dblclick', toggleFullscreen);
        
        log('✅ Botón de pantalla completa configurado', 'SUCCESS');
    }
    
    function toggleFullscreen() {
        const remoteVideo = elements.remoteVideo;
        if (!remoteVideo) return;
        
        if (!document.fullscreenElement) {
            // Entrar en pantalla completa
            if (remoteVideo.requestFullscreen) {
                remoteVideo.requestFullscreen();
            } else if (remoteVideo.webkitRequestFullscreen) {
                remoteVideo.webkitRequestFullscreen();
            } else if (remoteVideo.msRequestFullscreen) {
                remoteVideo.msRequestFullscreen();
            }
            log('⛶ Pantalla completa activada', 'INFO');
        } else {
            // Salir de pantalla completa
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            } else if (document.msExitFullscreen) {
                document.msExitFullscreen();
            }
            log('⛶ Saliendo de pantalla completa', 'INFO');
        }
    }
    
    // Detectar cambios en pantalla completa
    document.addEventListener('fullscreenchange', updateFullscreenButton);
    document.addEventListener('webkitfullscreenchange', updateFullscreenButton);
    document.addEventListener('mozfullscreenchange', updateFullscreenButton);
    document.addEventListener('MSFullscreenChange', updateFullscreenButton);
    
    function updateFullscreenButton() {
        const fullscreenBtn = elements.fullscreenBtn;
        if (fullscreenBtn) {
            if (document.fullscreenElement || 
                document.webkitFullscreenElement || 
                document.mozFullScreenElement || 
                document.msFullscreenElement) {
                fullscreenBtn.textContent = '✕';
                fullscreenBtn.title = 'Salir de pantalla completa';
            } else {
                fullscreenBtn.textContent = '⛶';
                fullscreenBtn.title = 'Pantalla completa';
            }
        }
    }
    
    // ============================================
    // INICIALIZACIÓN
    // ============================================
    connectToServer();
    
    if (elements.startBtn) elements.startBtn.addEventListener('click', startBroadcast);
    if (elements.stopBtn) elements.stopBtn.addEventListener('click', stopBroadcast);
    if (elements.joinBtn) elements.joinBtn.addEventListener('click', joinRoom);
    if (elements.leaveBtn) elements.leaveBtn.addEventListener('click', leaveRoom);
    
    if (elements.roomId) elements.roomId.value = 'sala1';
    if (elements.viewRoomId) elements.viewRoomId.value = 'sala1';
    
    if (elements.deviceInfo) {
        const isMobile = /mobile|android|iphone|ipad/i.test(navigator.userAgent);
        elements.deviceInfo.textContent = isMobile ? '📱 MÓVIL' : '💻 PC';
    }
    
    // Configurar pantalla completa
    setupFullscreen();
    
    log('✅ Inicialización completa', 'SUCCESS');
});