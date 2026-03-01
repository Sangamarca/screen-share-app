// ============================================
// VERSIÓN COMPLETA - CON MANEJO DE NUEVOS VIEWERS
// ============================================

console.log('🚀 Iniciando...');

// Panel de diagnóstico WebRTC
const webrtcPanel = document.createElement('div');
webrtcPanel.style.cssText = `
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    background: #1a1a1a;
    color: #00ff00;
    font-family: monospace;
    font-size: 12px;
    padding: 10px;
    z-index: 10000;
    max-height: 150px;
    overflow-y: auto;
    border-top: 2px solid #00ff00;
`;
document.body.appendChild(webrtcPanel);

function webrtcLog(msg) {
    const time = new Date().toLocaleTimeString();
    console.log(`[WEBRTC] ${msg}`);
    const line = document.createElement('div');
    line.textContent = `[${time}] ${msg}`;
    webrtcPanel.appendChild(line);
    webrtcPanel.scrollTop = webrtcPanel.scrollHeight;
    while (webrtcPanel.children.length > 8) {
        webrtcPanel.removeChild(webrtcPanel.firstChild);
    }
}

webrtcLog('🔧 Panel de diagnóstico WebRTC activado');

document.addEventListener('DOMContentLoaded', function() {
    console.log('✅ DOM listo');
    
    // Elementos del DOM
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
        statusText: document.getElementById('statusText')
    };
    
    // Estado
    let socket = null;
    let localStream = null;
    let peerConnection = null;
    let currentRoom = null;
    let isBroadcaster = false;
    
    // Configuración STUN
    const configuration = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' }
        ],
        iceCandidatePoolSize: 10
    };
    
    // Función de estado
    function updateStatus(msg, isError = false) {
        console.log(`[STATUS] ${msg}`);
        if (elements.statusText) {
            elements.statusText.textContent = msg;
            elements.statusText.style.color = isError ? '#dc3545' : '#28a745';
        }
    }
    
    // Conectar al servidor
    function connectToServer() {
        updateStatus('Conectando...');
        
        socket = io({
            reconnection: true,
            reconnectionAttempts: Infinity
        });
        
        socket.on('connect', () => {
            updateStatus('✅ Conectado al servidor');
        });
        
        socket.on('disconnect', () => {
            updateStatus('❌ Desconectado', true);
        });
        
        socket.on('broadcaster-ready', () => {
            updateStatus('📡 Listo para transmitir');
        });
        
        socket.on('room-joined', (data) => {
            currentRoom = data.roomId;
            updateStatus(`✅ Unido a sala: ${data.roomId}`);
            if (elements.remoteOverlay) {
                elements.remoteOverlay.style.display = 'none';
            }
            webrtcLog(`✅ Unido a sala, esperando oferta del broadcaster`);
        });
        
        socket.on('room-error', (error) => {
            updateStatus(`❌ Error: ${error.message || error}`, true);
        });
        
        socket.on('broadcaster-disconnected', () => {
            updateStatus('📡 Transmisor desconectado', true);
            if (elements.remoteVideo) elements.remoteVideo.srcObject = null;
            if (elements.remoteOverlay) elements.remoteOverlay.style.display = 'flex';
        });
        
        // ============================================
        // EVENTOS WEBRTC (AMBOS LADOS)
        // ============================================
        
        // Para el VIEWER: Recibir oferta del broadcaster
        socket.on('offer', handleOffer);
        
        // Para el BROADCASTER: Recibir respuesta del viewer
        socket.on('answer', handleAnswer);
        
        // Para ambos: Intercambiar ICE candidates
        socket.on('ice-candidate', handleIceCandidate);
        
        // ============================================
        // EVENTOS ESPECÍFICOS DEL BROADCASTER
        // ============================================
        socket.on('viewer-joined', (viewerId) => {
            webrtcLog(`👁️ NUEVO VIEWER CONECTADO: ${viewerId}`);
            updateStatus(`👁️ Nuevo espectador conectado`);
            
            // Verificar que somos broadcaster
            if (!isBroadcaster) {
                webrtcLog('❌ Error: No soy broadcaster');
                return;
            }
            
            if (!peerConnection) {
                webrtcLog('❌ Error: peerConnection no existe');
                return;
            }
            
            webrtcLog('📤 Creando oferta para nuevo viewer...');
            
            // Crear oferta para este viewer específico
            peerConnection.createOffer()
                .then(offer => {
                    webrtcLog('✅ Oferta creada');
                    return peerConnection.setLocalDescription(offer);
                })
                .then(() => {
                    webrtcLog('✅ Descripción local establecida');
                    webrtcLog(`📤 Enviando oferta a viewer ${viewerId}...`);
                    
                    socket.emit('offer', {
                        target: viewerId,
                        offer: peerConnection.localDescription
                    });
                    
                    webrtcLog('✅ Oferta enviada');
                })
                .catch(err => {
                    webrtcLog(`❌ Error creando oferta: ${err.message}`);
                });
        });
        
        socket.on('viewer-left', (data) => {
            webrtcLog(`👋 Viewer desconectado: ${data.viewerId}`);
            webrtcLog(`👥 Viewers restantes: ${data.totalViewers}`);
            updateStatus(`👥 ${data.totalViewers} espectadores`);
        });
    }
    
    // ============================================
    // HANDLERS WEBRTC (PARA VIEWER)
    // ============================================
    async function handleOffer(data) {
        webrtcLog(`📥 OFERTA RECIBIDA del broadcaster`);
        webrtcLog(`   De: ${data.from}`);
        updateStatus('📥 Recibiendo oferta...');
        
        try {
            // Crear peer connection si no existe
            if (!peerConnection) {
                webrtcLog('🆕 Creando nueva PeerConnection');
                peerConnection = new RTCPeerConnection(configuration);
                
                peerConnection.ontrack = (event) => {
                    webrtcLog('✅ TRACK RECIBIDO - VIDEO LLEGANDO');
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
                    webrtcLog(`🧊 ICE state: ${peerConnection.iceConnectionState}`);
                    if (peerConnection.iceConnectionState === 'connected') {
                        updateStatus('✅ Conexión establecida');
                    }
                };
            }
            
            // Establecer la oferta como descripción remota
            await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
            webrtcLog('✅ Remote description set');
            
            // Crear respuesta
            const answer = await peerConnection.createAnswer();
            webrtcLog('✅ Answer creada');
            
            // Establecer como descripción local
            await peerConnection.setLocalDescription(answer);
            webrtcLog('✅ Local description set');
            
            // Enviar respuesta al broadcaster
            socket.emit('answer', {
                target: data.from,
                answer: answer
            });
            webrtcLog('📤 Respuesta enviada');
            
        } catch (err) {
            webrtcLog(`❌ ERROR: ${err.message}`);
            updateStatus(`❌ Error: ${err.message}`, true);
        }
    }
    
    async function handleAnswer(data) {
        webrtcLog(`📥 RESPUESTA RECIBIDA del viewer`);
        try {
            if (peerConnection) {
                await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
                webrtcLog('✅ Remote description set (answer)');
            }
        } catch (err) {
            webrtcLog(`❌ Error en answer: ${err.message}`);
        }
    }
    
    async function handleIceCandidate(data) {
        webrtcLog(`🧊 ICE candidate recibido`);
        try {
            if (peerConnection) {
                await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
                webrtcLog('✅ ICE candidate agregado');
            }
        } catch (err) {
            webrtcLog(`❌ Error agregando ICE: ${err.message}`);
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
        
        currentRoom = roomName;
        
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
            elements.remoteOverlay.innerHTML = '<span>⏳ Conectando...</span>';
        }
        
        webrtcLog(`👋 Uniéndose a sala: ${roomName}`);
        updateStatus(`👁️ Uniéndose a ${roomName}...`);
        socket.emit('viewer-join', roomName);
    }
    
    function leaveRoom() {
        if (peerConnection) {
            peerConnection.close();
            peerConnection = null;
        }
        
        if (elements.remoteVideo) {
            elements.remoteVideo.srcObject = null;
        }
        if (elements.remoteOverlay) {
            elements.remoteOverlay.style.display = 'flex';
            elements.remoteOverlay.innerHTML = '<span>📺 Esperando...</span>';
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
        updateStatus('👋 Desconectado');
    }
    
    // ============================================
    // FUNCIÓN TRANSMITIR (BROADCASTER)
    // ============================================
    async function startBroadcast() {
        try {
            const roomName = elements.roomId?.value.trim() || 'sala1';
            
            updateStatus('Solicitando pantalla...');
            localStream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: true
            });
            
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
            
            peerConnection = new RTCPeerConnection(configuration);
            localStream.getTracks().forEach(track => {
                peerConnection.addTrack(track, localStream);
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
                console.log('ICE broadcaster:', peerConnection.iceConnectionState);
            };
            
            localStream.getVideoTracks()[0].onended = () => {
                stopBroadcast();
            };
            
            updateStatus(`📡 Transmitiendo en ${roomName}`);
            
        } catch (err) {
            updateStatus(`❌ Error: ${err.message}`, true);
        }
    }
    
    function stopBroadcast() {
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
        
        if (elements.startBtn) elements.startBtn.disabled = false;
        if (elements.stopBtn) elements.stopBtn.disabled = true;
        if (elements.joinBtn) elements.joinBtn.disabled = false;
        
        isBroadcaster = false;
        currentRoom = null;
        updateStatus('⏹️ Transmisión detenida');
    }
    
    // ============================================
    // INICIALIZAR
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
    
    updateStatus('✅ App lista');
    webrtcLog('✅ Diagnóstico WebRTC listo');
});