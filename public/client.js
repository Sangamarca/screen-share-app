// ============================================
// VERSIÓN FINAL - CON FEEDBACK PARA MÓVIL
// ============================================
console.log('🚀 Cliente iniciando...');

document.addEventListener('DOMContentLoaded', function() {
    console.log('✅ DOM listo');
    
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
    
    // ============================================
    // ESTADO
    // ============================================
    let socket = null;
    let localStream = null;
    let peerConnection = null;
    let currentRoom = null;
    let isBroadcaster = false;
    
    // ============================================
    // FUNCIONES DE UTILIDAD
    // ============================================
    function log(msg) {
        const time = new Date().toLocaleTimeString();
        console.log(`[${time}] ${msg}`);
        if (elements.statusText) {
            elements.statusText.textContent = msg;
        }
    }
    
    function showStatus(msg, isError = false) {
        log(msg);
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
        if (elements.joinBtn) elements.joinBtn.disabled = false;
        if (elements.leaveBtn) elements.leaveBtn.disabled = true;
        if (elements.viewerCount) elements.viewerCount.textContent = '0 espectadores';
    }
    
    // ============================================
    // CONEXIÓN AL SERVIDOR
    // ============================================
    function connectToServer() {
        log('Conectando...');
        
        socket = io({
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 1000
        });
        
        socket.on('connect', () => {
            showStatus('✅ Conectado al servidor');
        });
        
        socket.on('disconnect', () => {
            showStatus('❌ Desconectado', true);
            resetUI();
        });
        
        socket.on('broadcaster-ready', () => {
            showStatus('📡 Transmisión lista');
        });
        
        socket.on('room-joined', (data) => {
            currentRoom = data.roomId;
            showStatus(`✅ Unido a sala: ${data.roomId}`);
            if (elements.remoteOverlay) {
                elements.remoteOverlay.style.display = 'none';
            }
            if (elements.viewerCount) {
                elements.viewerCount.textContent = '👥 1 espectador';
            }
            if (elements.leaveBtn) {
                elements.leaveBtn.disabled = false;
            }
        });
        
        socket.on('room-error', (error) => {
            const msg = error.message || String(error);
            showStatus(`❌ Error: ${msg}`, true);
            resetUI();
        });
        
        socket.on('broadcaster-disconnected', () => {
            showStatus('📡 Transmisor desconectado', true);
            if (elements.remoteVideo) elements.remoteVideo.srcObject = null;
            if (elements.remoteOverlay) elements.remoteOverlay.style.display = 'flex';
            resetUI();
        });
        
        socket.on('viewer-joined', () => {
            if (elements.viewerCount) {
                elements.viewerCount.textContent = '👥 1 espectador';
            }
        });
        
        // WebRTC
        socket.on('offer', handleOffer);
        socket.on('answer', handleAnswer);
        socket.on('ice-candidate', handleIceCandidate);
    }
    
    // ============================================
    // WEBRTC
    // ============================================
    const configuration = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
        ]
    };
    
    async function handleOffer(data) {
        log('📤 Oferta recibida');
        
        if (!peerConnection) {
            peerConnection = new RTCPeerConnection(configuration);
            
            peerConnection.ontrack = (event) => {
                log('📥 Video recibido');
                if (elements.remoteVideo) {
                    elements.remoteVideo.srcObject = event.streams[0];
                    elements.remoteOverlay.style.display = 'none';
                    showStatus('✅ Video recibido');
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
                log(`ICE: ${peerConnection.iceConnectionState}`);
            };
        }
        
        try {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            socket.emit('answer', { target: data.from, answer });
            log('📥 Respuesta enviada');
        } catch (err) {
            log(`❌ Error: ${err.message}`);
        }
    }
    
    async function handleAnswer(data) {
        try {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
            log('✅ Conexión establecida');
            showStatus('✅ Conectado a transmisión');
        } catch (err) {
            log(`❌ Error: ${err.message}`);
        }
    }
    
    async function handleIceCandidate(data) {
        try {
            if (peerConnection) {
                await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
            }
        } catch (err) {
            log(`❌ Error ICE: ${err.message}`);
        }
    }
    
    // ============================================
    // TRANSMITIR
    // ============================================
    async function startBroadcast() {
        try {
            const room = elements.roomId?.value.trim();
            if (!room) {
                alert('Ingresa un nombre para la sala');
                return;
            }
            
            log('Solicitando pantalla...');
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
            currentRoom = room;
            
            if (elements.startBtn) elements.startBtn.disabled = true;
            if (elements.stopBtn) elements.stopBtn.disabled = false;
            if (elements.joinBtn) elements.joinBtn.disabled = true;
            
            socket.emit('broadcaster-join', room);
            
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
            
            localStream.getVideoTracks()[0].onended = () => {
                stopBroadcast();
            };
            
            showStatus(`📡 Transmitiendo en: ${room}`);
            
        } catch (err) {
            showStatus(`❌ Error: ${err.message}`, true);
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
        showStatus('⏹️ Transmisión detenida');
    }
    
    // ============================================
    // VER (VERSIÓN MEJORADA PARA MÓVIL)
    // ============================================
    function joinAsViewer() {
        const room = elements.viewRoomId?.value.trim();
        if (!room) {
            alert('Ingresa un nombre para la sala');
            return;
        }
        
        // CAMBIO IMPORTANTE: Feedback visual inmediato
        showStatus(`🔍 Buscando sala: ${room}...`);
        
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
        
        currentRoom = room;
        socket.emit('viewer-join', room);
        log(`👁️ Uniéndose a: ${room}`);
    }
    
    function leaveAsViewer() {
        showStatus('👋 Desconectando...');
        
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
        showStatus('✅ Desconectado');
    }
    
    // ============================================
    // INICIALIZAR
    // ============================================
    function init() {
        log('Inicializando...');
        
        // Detectar móvil para ajustar UI
        const isMobile = /mobile|android|iphone|ipad/i.test(navigator.userAgent);
        if (isMobile) {
            log('📱 Modo móvil activado');
            // Ajustes para móvil si son necesarios
        }
        
        // Conectar
        connectToServer();
        
        // Eventos
        if (elements.startBtn) {
            elements.startBtn.addEventListener('click', startBroadcast);
        }
        if (elements.stopBtn) {
            elements.stopBtn.addEventListener('click', stopBroadcast);
        }
        if (elements.joinBtn) {
            elements.joinBtn.addEventListener('click', joinAsViewer);
        }
        if (elements.leaveBtn) {
            elements.leaveBtn.addEventListener('click', leaveAsViewer);
        }
        
        // Valores por defecto
        if (elements.roomId) {
            elements.roomId.value = 'sala1';
        }
        if (elements.viewRoomId) {
            elements.viewRoomId.value = 'sala1';
        }
        
        log('✅ App lista');
    }
    
    init();
});