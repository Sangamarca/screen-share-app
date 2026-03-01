// ============================================
// VERSIÓN FINAL - CON TODO CORREGIDO
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
    // ESTADO
    // ============================================
    let socket = null;
    let localStream = null;
    let peerConnection = null;
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
        if (peerConnection) {
            peerConnection.close();
            peerConnection = null;
        }
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
        // EVENTO CRÍTICO: viewer-joined (SOLO BROADCASTER)
        // ============================================
        socket.on('viewer-joined', (data) => {
            // Mensaje SUPER visible
            console.log('%c🔥 NUEVO VIEWER DETECTADO 🔥', 'background: red; color: white; font-size: 16px');
            log(`🔥 NUEVO VIEWER: ${data.viewerId}`, 'CRITICAL');
            log(`👥 Total viewers: ${data.totalViewers}`, 'INFO');
            
            if (!isBroadcaster) {
                log('❌ No soy broadcaster, ignorando', 'ERROR');
                return;
            }
            
            if (!peerConnection) {
                log('❌ peerConnection no existe', 'ERROR');
                return;
            }
            
            log('📤 Creando oferta para nuevo viewer...', 'INFO');
            
            peerConnection.createOffer()
                .then(offer => {
                    log('✅ Oferta creada', 'SUCCESS');
                    return peerConnection.setLocalDescription(offer);
                })
                .then(() => {
                    log(`📤 Enviando oferta a viewer ${data.viewerId}...`, 'INFO');
                    
                    socket.emit('offer', {
                        target: data.viewerId,
                        offer: peerConnection.localDescription
                    });
                    
                    log('✅ Oferta enviada', 'SUCCESS');
                })
                .catch(err => {
                    log(`❌ Error creando oferta: ${err.message}`, 'ERROR');
                });
        });
        
        socket.on('viewer-left', (data) => {
            log(`👋 Viewer ${data.viewerId} desconectado`, 'INFO');
            log(`👥 Viewers restantes: ${data.totalViewers}`, 'INFO');
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
        log(`📥 OFERTA RECIBIDA del broadcaster ${data.from}`, 'SUCCESS');
        
        try {
            if (!peerConnection) {
                log('🆕 Creando PeerConnection como viewer', 'INFO');
                peerConnection = new RTCPeerConnection(configuration);
                
                peerConnection.ontrack = (event) => {
                    log('🎥 VIDEO RECIBIDO 🎥', 'SUCCESS');
                    log(`   Kind: ${event.track.kind}`, 'INFO');
                    
                    if (elements.remoteVideo) {
                        elements.remoteVideo.srcObject = event.streams[0];
                        if (elements.remoteOverlay) {
                            elements.remoteOverlay.style.display = 'none';
                        }
                        updateStatus('✅ Video recibido');
                    }
                };
                
                peerConnection.onicecandidate = (event) => {
                    if (event.candidate) {
                        socket.emit('ice-candidate', {
                            target: data.from,
                            candidate: event.candidate
                        });
                    }
                };
                
                peerConnection.oniceconnectionstatechange = () => {
                    log(`🧊 ICE state: ${peerConnection.iceConnectionState}`, 'INFO');
                    if (peerConnection.iceConnectionState === 'connected') {
                        updateStatus('✅ Conexión establecida');
                    }
                };
            }
            
            log('📥 Estableciendo descripción remota...', 'INFO');
            await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
            log('✅ Remote description set', 'SUCCESS');
            
            log('📤 Creando respuesta...', 'INFO');
            const answer = await peerConnection.createAnswer();
            log('✅ Answer creada', 'SUCCESS');
            
            log('📤 Estableciendo descripción local...', 'INFO');
            await peerConnection.setLocalDescription(answer);
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
    
    async function handleAnswer(data) {
        log(`📥 Respuesta recibida de viewer ${data.from}`, 'SUCCESS');
        try {
            if (peerConnection) {
                await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
                log('✅ Remote description set (answer)', 'SUCCESS');
                log('✅ Conexión WebRTC establecida', 'SUCCESS');
            }
        } catch (err) {
            log(`❌ Error en handleAnswer: ${err.message}`, 'ERROR');
        }
    }
    
    async function handleIceCandidate(data) {
        log(`🧊 ICE candidate recibido`, 'INFO');
        try {
            if (peerConnection) {
                await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
                log('✅ ICE candidate agregado', 'SUCCESS');
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
        
        if (peerConnection) {
            peerConnection.close();
            peerConnection = null;
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
            
            peerConnection = new RTCPeerConnection(configuration);
            localStream.getTracks().forEach(track => {
                peerConnection.addTrack(track, localStream);
                log(`➕ Track añadido: ${track.kind}`, 'INFO');
            });
            
            peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    socket.emit('ice-candidate', {
                        target: 'broadcast',
                        candidate: event.candidate
                    });
                }
            };
            
            peerConnection.oniceconnectionstatechange = () => {
                log(`🧊 ICE broadcaster: ${peerConnection.iceConnectionState}`, 'INFO');
            };
            
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
        
        if (localStream) {
            localStream.getTracks().forEach(t => t.stop());
            localStream = null;
        }
        if (peerConnection) {
            peerConnection.close();
            peerConnection = null;
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
    
    log('✅ Inicialización completa', 'SUCCESS');
});