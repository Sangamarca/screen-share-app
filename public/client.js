// ============================================
// VERSIÓN FINAL - SOPORTE PARA MÚLTIPLES VIEWERS
// ============================================

console.log('🚀 Cliente iniciando...');

// Panel de diagnóstico visible
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
    
    // Limitar líneas
    while (diagnosticPanel.children.length > 12) {
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
        viewerCount: document.getElementById('viewerCount')
    };
    
    // Verificar elementos
    for (const [key, el] of Object.entries(elements)) {
        if (!el) log(`⚠️ Elemento no encontrado: ${key}`, 'WARN');
    }
    
    // ============================================
    // ESTADO (MODIFICADO PARA MÚLTIPLES VIEWERS)
    // ============================================
    let socket = null;
    let localStream = null;
    let peerConnections = new Map(); // CAMBIO: ahora es un Map para múltiples viewers
    let currentRoom = null;
    let isBroadcaster = false;
    
    // ============================================
    // CONFIGURACIÓN STUN
    // ============================================
    const configuration = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' },
            { urls: 'stun:stun4.l.google.com:19302' }
        ],
        iceCandidatePoolSize: 10
    };
    
    // ============================================
    // FUNCIONES AUXILIARES
    // ============================================
    function updateStatus(msg) {
        log(msg, 'STATUS');
        if (elements.statusText) {
            elements.statusText.textContent = msg;
        }
    }
    
    function resetUI() {
        if (localStream) {
            localStream.getTracks().forEach(t => t.stop());
            localStream = null;
        }
        
        // Cerrar todas las conexiones de viewers
        for (const [viewerId, pc] of peerConnections.entries()) {
            pc.close();
            log(`🧹 Conexión con ${viewerId} cerrada`, 'INFO');
        }
        peerConnections.clear();
        
        if (elements.localVideo) elements.localVideo.srcObject = null;
        if (elements.remoteVideo) elements.remoteVideo.srcObject = null;
        if (elements.localOverlay) elements.localOverlay.style.display = 'flex';
        if (elements.remoteOverlay) elements.remoteOverlay.style.display = 'flex';
        
        isBroadcaster = false;
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
        
        socket = io({
            reconnection: true,
            reconnectionAttempts: Infinity
        });
        
        socket.on('connect', () => {
            log('✅ Conectado al servidor', 'SUCCESS');
            updateStatus('Conectado');
        });
        
        socket.on('disconnect', (reason) => {
            log(`❌ Desconectado: ${reason}`, 'ERROR');
            updateStatus('Desconectado');
            resetUI();
        });
        
        // ============================================
        // EVENTOS GENERALES
        // ============================================
        socket.on('broadcaster-ready', () => {
            log('📡 Modo transmisor listo', 'SUCCESS');
        });
        
        socket.on('room-joined', (data) => {
            currentRoom = data.roomId;
            log(`✅ Unido a sala: ${data.roomId}`, 'SUCCESS');
            log('⏳ Esperando oferta del broadcaster...', 'INFO');
            updateStatus(`Unido a ${data.roomId}`);
            
            if (elements.remoteOverlay) {
                elements.remoteOverlay.style.display = 'none';
            }
            if (elements.joinBtn) {
                elements.joinBtn.disabled = false;
                elements.joinBtn.textContent = 'Unirse';
            }
        });
        
        socket.on('room-error', (error) => {
            log(`❌ Error: ${error}`, 'ERROR');
            updateStatus(`Error: ${error}`);
            resetUI();
        });
        
        socket.on('broadcaster-disconnected', () => {
            log('📡 Transmisor desconectado', 'WARN');
            updateStatus('Transmisor desconectado');
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
        // EVENTO CRÍTICO: viewer-joined (MULTIPLE VIEWERS)
        // ============================================
        socket.on('viewer-joined', (data) => {
            const viewerId = data.viewerId;
            
            // Mensaje SUPER visible
            console.log('%c🔥 NUEVO VIEWER DETECTADO 🔥', 'background: red; color: white; font-size: 16px');
            log(`🔥 NUEVO VIEWER: ${viewerId}`, 'CRITICAL');
            log(`👥 Total viewers: ${data.totalViewers}`, 'INFO');
            
            if (!isBroadcaster) {
                log('❌ No soy broadcaster, ignorando', 'ERROR');
                return;
            }
            
            // Crear nueva peer connection para este viewer
            log(`🆕 Creando PeerConnection para viewer ${viewerId}`, 'INFO');
            const pc = new RTCPeerConnection(configuration);
            
            // Añadir tracks locales
            if (localStream) {
                localStream.getTracks().forEach(track => {
                    pc.addTrack(track, localStream);
                    log(`➕ Track añadido a conexión de ${viewerId}`, 'INFO');
                });
            }
            
            // Manejar ICE candidates para este viewer
            pc.onicecandidate = (event) => {
                if (event.candidate) {
                    socket.emit('ice-candidate', {
                        target: viewerId,
                        candidate: event.candidate
                    });
                }
            };
            
            pc.oniceconnectionstatechange = () => {
                log(`🧊 ICE (viewer ${viewerId}): ${pc.iceConnectionState}`, 'INFO');
            };
            
            // Guardar en Map
            peerConnections.set(viewerId, pc);
            
            // Crear oferta para este viewer
            log(`📤 Creando oferta para viewer ${viewerId}...`, 'INFO');
            
            pc.createOffer()
                .then(offer => {
                    log(`✅ Oferta creada para ${viewerId}`, 'SUCCESS');
                    return pc.setLocalDescription(offer);
                })
                .then(() => {
                    log(`📤 Enviando oferta a viewer ${viewerId}...`, 'INFO');
                    
                    socket.emit('offer', {
                        target: viewerId,
                        offer: pc.localDescription
                    });
                    
                    log(`✅ Oferta enviada a ${viewerId}`, 'SUCCESS');
                })
                .catch(err => {
                    log(`❌ Error creando oferta para ${viewerId}: ${err.message}`, 'ERROR');
                });
        });
        
        // ============================================
        // MANEJO DE DESCONEXIÓN DE VIEWERS
        // ============================================
        socket.on('viewer-left', (data) => {
            const viewerId = data.viewerId;
            log(`👋 Viewer ${viewerId} desconectado`, 'INFO');
            log(`👥 Viewers restantes: ${data.totalViewers}`, 'INFO');
            
            const pc = peerConnections.get(viewerId);
            if (pc) {
                pc.close();
                peerConnections.delete(viewerId);
                log(`🧹 Conexión de ${viewerId} limpiada`, 'INFO');
            }
        });
        
        // ============================================
        // EVENTOS WEBRTC (PARA VIEWER)
        // ============================================
        socket.on('offer', handleOffer);
        socket.on('answer', handleAnswer);
        socket.on('ice-candidate', handleIceCandidate);
    }
    
    // ============================================
    // HANDLERS WEBRTC (PARA VIEWER)
    // ============================================
    async function handleOffer(data) {
        log(`📥 OFERTA RECIBIDA del broadcaster ${data.from}`, 'SUCCESS');
        
        try {
            // Como viewer, solo tenemos UNA peer connection (la del broadcaster)
            if (!peerConnections.has('broadcaster')) {
                log('🆕 Creando PeerConnection como viewer', 'INFO');
                const pc = new RTCPeerConnection(configuration);
                
                pc.ontrack = (event) => {
                    log('🎥 VIDEO RECIBIDO 🎥', 'SUCCESS');
                    log(`   Kind: ${event.track.kind}`, 'INFO');
                    
                    if (elements.remoteVideo) {
                        elements.remoteVideo.srcObject = event.streams[0];
                        if (elements.remoteOverlay) {
                            elements.remoteOverlay.style.display = 'none';
                        }
                        updateStatus('✅ Video recibido');
                        
                        // Intentar reproducir
                        elements.remoteVideo.play()
                            .then(() => log('✅ Video reproduciéndose', 'SUCCESS'))
                            .catch(err => log(`⚠️ Error al reproducir: ${err.message}`, 'WARN'));
                    }
                };
                
                pc.onicecandidate = (event) => {
                    if (event.candidate) {
                        socket.emit('ice-candidate', {
                            target: data.from,
                            candidate: event.candidate
                        });
                    }
                };
                
                pc.oniceconnectionstatechange = () => {
                    log(`🧊 ICE state: ${pc.iceConnectionState}`, 'INFO');
                    if (pc.iceConnectionState === 'connected') {
                        updateStatus('✅ Conexión establecida');
                    }
                };
                
                peerConnections.set('broadcaster', pc);
            }
            
            const pc = peerConnections.get('broadcaster');
            
            log('📥 Estableciendo descripción remota...', 'INFO');
            await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
            log('✅ Remote description set', 'SUCCESS');
            
            log('📤 Creando respuesta...', 'INFO');
            const answer = await pc.createAnswer();
            log('✅ Answer creada', 'SUCCESS');
            
            log('📤 Estableciendo descripción local...', 'INFO');
            await pc.setLocalDescription(answer);
            log('✅ Local description set', 'SUCCESS');
            
            log(`📤 Enviando respuesta a broadcaster ${data.from}...`, 'INFO');
            socket.emit('answer', {
                target: data.from,
                answer: answer
            });
            log('✅ Respuesta enviada', 'SUCCESS');
            
        } catch (err) {
            log(`❌ Error en handleOffer: ${err.message}`, 'ERROR');
        }
    }
    
    // ============================================
    // HANDLERS WEBRTC (PARA BROADCASTER - MODIFICADOS)
    // ============================================
    async function handleAnswer(data) {
        const viewerId = data.from;
        log(`📥 Respuesta recibida de viewer ${viewerId}`, 'SUCCESS');
        
        try {
            const pc = peerConnections.get(viewerId);
            if (pc) {
                await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
                log(`✅ Remote description set para ${viewerId}`, 'SUCCESS');
            } else {
                log(`❌ No se encontró peer connection para ${viewerId}`, 'ERROR');
            }
        } catch (err) {
            log(`❌ Error en handleAnswer: ${err.message}`, 'ERROR');
        }
    }
    
    async function handleIceCandidate(data) {
        const viewerId = data.from;
        log(`🧊 ICE candidate recibido de ${viewerId}`, 'INFO');
        
        try {
            // Buscar en el Map de peer connections
            const pc = peerConnections.get(viewerId);
            if (pc) {
                await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
                log(`✅ ICE candidate agregado para ${viewerId}`, 'SUCCESS');
            } else {
                log(`⚠️ No hay peer connection para ${viewerId}`, 'WARN');
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
        
        log(`👋 Uniéndose a sala: ${roomName}`, 'VIEWER');
        
        if (elements.joinBtn) {
            elements.joinBtn.disabled = true;
            elements.joinBtn.textContent = 'Conectando...';
        }
        if (elements.leaveBtn) {
            elements.leaveBtn.disabled = false;
        }
        if (elements.startBtn) {
            elements.startBtn.disabled = true;
        }
        if (elements.remoteOverlay) {
            elements.remoteOverlay.innerHTML = '<span>⏳ Conectando al transmisor...</span>';
        }
        
        currentRoom = roomName;
        socket.emit('viewer-join', roomName);
        updateStatus(`Uniéndose a ${roomName}...`);
    }
    
    function leaveRoom() {
        log('👋 Saliendo de la sala', 'VIEWER');
        
        const pc = peerConnections.get('broadcaster');
        if (pc) {
            pc.close();
            peerConnections.delete('broadcaster');
        }
        
        if (elements.remoteVideo) {
            elements.remoteVideo.srcObject = null;
        }
        if (elements.remoteOverlay) {
            elements.remoteOverlay.style.display = 'flex';
            elements.remoteOverlay.innerHTML = '<span>📺 Esperando transmisión...</span>';
        }
        
        if (elements.joinBtn) {
            elements.joinBtn.disabled = false;
            elements.joinBtn.textContent = 'Unirse';
        }
        if (elements.leaveBtn) {
            elements.leaveBtn.disabled = true;
        }
        if (elements.startBtn) {
            elements.startBtn.disabled = false;
        }
        
        currentRoom = null;
        updateStatus('Desconectado');
    }
    
    // ============================================
    // FUNCIÓN TRANSMITIR (BROADCASTER)
    // ============================================
    async function startBroadcast() {
        try {
            const roomName = elements.roomId?.value.trim();
            if (!roomName) {
                alert('Ingresa un nombre para la sala');
                return;
            }
            
            log('📤 Solicitando captura de pantalla...', 'BROADCASTER');
            
            localStream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: true
            });
            
            log('✅ Captura obtenida', 'SUCCESS');
            
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
            log(`📡 Unido a sala: ${roomName} como BROADCASTER`, 'BROADCASTER');
            
            // NOTA: Ya no creamos una peer connection aquí
            // Se crearán dinámicamente cuando lleguen viewers
            
            localStream.getVideoTracks()[0].onended = () => {
                log('⏹️ Captura finalizada por el usuario', 'WARN');
                stopBroadcast();
            };
            
            updateStatus(`📡 Transmitiendo en ${roomName}`);
            
        } catch (err) {
            log(`❌ Error: ${err.message}`, 'ERROR');
            resetUI();
        }
    }
    
    function stopBroadcast() {
        log('⏹️ Deteniendo transmisión...', 'BROADCASTER');
        
        // Cerrar todas las conexiones de viewers
        for (const [viewerId, pc] of peerConnections.entries()) {
            pc.close();
            log(`🧹 Conexión con ${viewerId} cerrada`, 'INFO');
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
    // INICIALIZACIÓN
    // ============================================
    connectToServer();
    
    if (elements.startBtn) {
        elements.startBtn.addEventListener('click', startBroadcast);
    }
    if (elements.stopBtn) {
        elements.stopBtn.addEventListener('click', stopBroadcast);
    }
    if (elements.joinBtn) {
        elements.joinBtn.addEventListener('click', joinRoom);
    }
    if (elements.leaveBtn) {
        elements.leaveBtn.addEventListener('click', leaveRoom);
    }
    
    if (elements.roomId) {
        elements.roomId.value = 'sala1';
    }
    if (elements.viewRoomId) {
        elements.viewRoomId.value = 'sala1';
    }
    
    // Agregar evento de click para reproducción en móvil
    if (elements.remoteVideo) {
        elements.remoteVideo.addEventListener('click', () => {
            elements.remoteVideo.play();
            if (elements.remoteOverlay) {
                elements.remoteOverlay.style.display = 'none';
            }
        });
    }
    
    log('✅ Inicialización completa', 'SUCCESS');
});