// ============================================
// VERSIÓN CON WEBRTC MEJORADO PARA MÓVIL
// ============================================

console.log('🚀 Iniciando...');

document.addEventListener('DOMContentLoaded', function() {
    console.log('✅ DOM listo');
    
    // ============================================
    // ELEMENTOS
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
        statusText: document.getElementById('statusText')
    };
    
    // ============================================
    // ESTADO
    // ============================================
    let socket = null;
    let localStream = null;
    let peerConnection = null;
    let currentRoom = null;
    let isBroadcaster = false;
    
    // ============================================
    // CONFIGURACIÓN CON MÚLTIPLES STUN
    // ============================================
    const configuration = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' },
            { urls: 'stun:stun4.l.google.com:19302' },
            { urls: 'stun:stun.ekiga.net' },
            { urls: 'stun:stun.ideasip.com' },
            { urls: 'stun:stun.schlund.de' }
        ],
        iceCandidatePoolSize: 10,
        iceTransportPolicy: 'all',
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require'
    };
    
    // ============================================
    // FUNCIONES
    // ============================================
    function updateStatus(msg, isError = false) {
        console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);
        if (elements.statusText) {
            elements.statusText.textContent = msg;
            elements.statusText.style.color = isError ? '#dc3545' : '#28a745';
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
    }
    
    // ============================================
    // CONEXIÓN AL SERVIDOR
    // ============================================
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
            resetUI();
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
            
            if (elements.joinBtn) {
                elements.joinBtn.disabled = false;
                elements.joinBtn.textContent = 'Unirse';
            }
            
            // Aquí NO creamos peer connection - el broadcaster nos enviará la oferta
        });
        
        socket.on('room-error', (error) => {
            updateStatus(`❌ Error: ${error.message || error}`, true);
            resetUI();
        });
        
        socket.on('broadcaster-disconnected', () => {
            updateStatus('📡 Transmisor desconectado', true);
            if (elements.remoteVideo) elements.remoteVideo.srcObject = null;
            if (elements.remoteOverlay) elements.remoteOverlay.style.display = 'flex';
            resetUI();
        });
        
        // Eventos WebRTC
        socket.on('offer', handleOffer);
        socket.on('answer', handleAnswer);
        socket.on('ice-candidate', handleIceCandidate);
    }
    
    // ============================================
    // WEBRTC HANDLERS (MEJORADOS)
    // ============================================
    async function handleOffer(data) {
        updateStatus('📥 Recibida oferta del broadcaster');
        console.log('Oferta recibida:', data.offer);
        
        try {
            // Crear peer connection si no existe
            if (!peerConnection) {
                peerConnection = new RTCPeerConnection(configuration);
                
                peerConnection.ontrack = (event) => {
                    updateStatus('✅ Video recibido del broadcaster');
                    console.log('Track recibido:', event.track.kind);
                    
                    if (elements.remoteVideo) {
                        elements.remoteVideo.srcObject = event.streams[0];
                        if (elements.remoteOverlay) {
                            elements.remoteOverlay.style.display = 'none';
                        }
                    }
                };
                
                peerConnection.onicecandidate = (event) => {
                    if (event.candidate) {
                        console.log('ICE candidate generado');
                        socket.emit('ice-candidate', {
                            target: data.from,
                            candidate: event.candidate
                        });
                    }
                };
                
                peerConnection.oniceconnectionstatechange = () => {
                    console.log('ICE state:', peerConnection.iceConnectionState);
                    if (peerConnection.iceConnectionState === 'connected') {
                        updateStatus('✅ Conexión establecida');
                    }
                    if (peerConnection.iceConnectionState === 'failed') {
                        updateStatus('❌ Error de conexión', true);
                    }
                };
            }
            
            // Establecer la oferta como descripción remota
            await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
            console.log('✅ Remote description set');
            
            // Crear respuesta
            const answer = await peerConnection.createAnswer();
            console.log('✅ Answer created');
            
            // Establecer como descripción local
            await peerConnection.setLocalDescription(answer);
            console.log('✅ Local description set');
            
            // Enviar respuesta al broadcaster
            socket.emit('answer', {
                target: data.from,
                answer: answer
            });
            updateStatus('📤 Respuesta enviada');
            
        } catch (err) {
            updateStatus(`❌ Error en oferta: ${err.message}`, true);
            console.error('Error en handleOffer:', err);
        }
    }
    
    async function handleAnswer(data) {
        console.log('Respuesta recibida:', data.answer);
        try {
            if (peerConnection) {
                await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
                console.log('✅ Remote description set (answer)');
            }
        } catch (err) {
            console.error('Error en handleAnswer:', err);
        }
    }
    
    async function handleIceCandidate(data) {
        console.log('ICE candidate recibido');
        try {
            if (peerConnection) {
                await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
                console.log('✅ ICE candidate agregado');
            }
        } catch (err) {
            console.error('Error en handleIceCandidate:', err);
        }
    }
    
    // ============================================
    // FUNCIÓN UNIRSE
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
            elements.remoteOverlay.innerHTML = '<span>⏳ Conectando al transmisor...</span>';
        }
        
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
            elements.remoteOverlay.innerHTML = '<span>📺 Esperando transmisión...</span>';
        }
        
        resetUI();
        updateStatus('👋 Desconectado');
    }
    
    // ============================================
    // FUNCIÓN TRANSMITIR
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
            resetUI();
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
        
        resetUI();
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
});