// ============================================
// VERSIÓN PARA MÓVIL - CORREGIDA
// ============================================
console.log('🚀 Cliente iniciado - Versión móvil');

// Esperar a que el DOM esté listo
document.addEventListener('DOMContentLoaded', function() {
    console.log('✅ DOM listo');
    
    // ============================================
    // OBTENER ELEMENTOS
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
        viewerCount: document.getElementById('viewerCount'),
        deviceInfo: document.getElementById('deviceInfo'),
        statusText: document.getElementById('statusText')
    };
    
    console.log('✅ Elementos obtenidos');
    
    // ============================================
    // CONFIGURACIÓN
    // ============================================
    const configuration = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' }
        ]
    };
    
    // Estado
    let socket = null;
    let localStream = null;
    let peerConnection = null;
    let currentRoom = null;
    let isBroadcaster = false;
    
    // ============================================
    // FUNCIONES UTILIDAD
    // ============================================
    function log(msg) {
        console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);
    }
    
    function showMessage(msg, isError = false) {
        // Mostrar como alert si es error importante
        if (isError) {
            alert(String(msg)); // Convertir a string
        } else {
            console.log('📢', msg);
        }
        
        // Actualizar estado si existe
        if (elements.statusText) {
            elements.statusText.textContent = String(msg);
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
    }
    
    // ============================================
    // DETECTAR DISPOSITIVO
    // ============================================
    function detectDevice() {
        const ua = navigator.userAgent.toLowerCase();
        let type = 'PC';
        
        if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
            type = '📱 MÓVIL';
        } else if (ua.includes('tablet') || ua.includes('ipad')) {
            type = '📱 TABLET';
        } else if (ua.includes('tv') || ua.includes('smart-tv')) {
            type = '📺 TV';
        }
        
        if (elements.deviceInfo) {
            elements.deviceInfo.textContent = type;
        }
        
        return type;
    }
    
    // ============================================
    // CONEXIÓN AL SERVIDOR
    // ============================================
    function connectToServer() {
        log('Conectando al servidor...');
        
        socket = io();
        
        socket.on('connect', () => {
            log('✅ Conectado');
            showMessage('Conectado al servidor');
        });
        
        socket.on('disconnect', () => {
            log('❌ Desconectado');
            showMessage('Desconectado del servidor', true);
        });
        
        socket.on('connect_error', (err) => {
            log('❌ Error conexión:', err);
            showMessage('Error de conexión: ' + err.message, true);
        });
        
        socket.on('broadcaster-ready', () => {
            log('📡 Listo para transmitir');
            showMessage('Transmisión lista');
        });
        
        socket.on('room-joined', (data) => {
            currentRoom = data.roomId;
            log(`✅ Unido a sala: ${data.roomId}`);
            showMessage(`Unido a sala ${data.roomId}`);
            if (elements.remoteOverlay) elements.remoteOverlay.style.display = 'none';
            if (elements.viewerCount) elements.viewerCount.textContent = '👥 1 espectador';
        });
        
        socket.on('room-error', (error) => {
            const msg = error.message || String(error);
            log(`❌ Error sala: ${msg}`);
            showMessage('Error: ' + msg, true);
            resetUI();
        });
        
        socket.on('broadcaster-disconnected', () => {
            log('📡 Transmisor desconectado');
            showMessage('El transmisor se desconectó', true);
            if (elements.remoteVideo) elements.remoteVideo.srcObject = null;
            if (elements.remoteOverlay) elements.remoteOverlay.style.display = 'flex';
            resetUI();
        });
        
        // WebRTC events
        socket.on('offer', handleOffer);
        socket.on('answer', handleAnswer);
        socket.on('ice-candidate', handleIceCandidate);
    }
    
    // ============================================
    // WEBRTC
    // ============================================
    async function handleOffer(data) {
        log('📤 Oferta recibida');
        
        if (!peerConnection) {
            peerConnection = new RTCPeerConnection(configuration);
            
            peerConnection.ontrack = (event) => {
                log('📥 Video recibido');
                if (elements.remoteVideo) {
                    elements.remoteVideo.srcObject = event.streams[0];
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
        }
        
        try {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            
            socket.emit('answer', {
                target: data.from,
                answer: answer
            });
            
            log('📥 Respuesta enviada');
        } catch (err) {
            log('❌ Error:', err.message);
        }
    }
    
    async function handleAnswer(data) {
        log('📥 Respuesta recibida');
        try {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
            log('✅ Conexión establecida');
        } catch (err) {
            log('❌ Error:', err.message);
        }
    }
    
    async function handleIceCandidate(data) {
        try {
            if (peerConnection) {
                await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
                log('🧊 ICE agregado');
            }
        } catch (err) {
            log('❌ Error ICE:', err.message);
        }
    }
    
    // ============================================
    // TRANSMITIR
    // ============================================
    async function startBroadcast() {
        try {
            const room = elements.roomId?.value.trim();
            if (!room) {
                showMessage('Ingresa un nombre para la sala', true);
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
            
            log(`📡 Transmitiendo en: ${room}`);
            showMessage('✅ Transmisión iniciada');
            
        } catch (err) {
            log('❌ Error:', err.message);
            showMessage('Error: ' + err.message, true);
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
        log('⏹️ Transmisión detenida');
        showMessage('Transmisión detenida');
    }
    
    // ============================================
    // VER
    // ============================================
    function joinAsViewer() {
        const room = elements.viewRoomId?.value.trim();
        if (!room) {
            showMessage('Ingresa un nombre para la sala', true);
            return;
        }
        
        currentRoom = room;
        
        if (elements.joinBtn) elements.joinBtn.disabled = true;
        if (elements.leaveBtn) elements.leaveBtn.disabled = false;
        if (elements.startBtn) elements.startBtn.disabled = true;
        
        if (elements.remoteOverlay) {
            elements.remoteOverlay.innerHTML = '<span>⏳ Conectando...</span>';
        }
        
        socket.emit('viewer-join', room);
        log(`👁️ Uniéndose a: ${room}`);
    }
    
    function leaveAsViewer() {
        if (peerConnection) {
            peerConnection.close();
            peerConnection = null;
        }
        
        if (elements.remoteVideo) elements.remoteVideo.srcObject = null;
        if (elements.remoteOverlay) {
            elements.remoteOverlay.style.display = 'flex';
            elements.remoteOverlay.innerHTML = '<span>📺 Esperando transmisión...</span>';
        }
        
        resetUI();
        log('👋 Desconectado');
    }
    
    // ============================================
    // INICIALIZAR
    // ============================================
    log('Inicializando...');
    
    // Detectar dispositivo
    const deviceType = detectDevice();
    log(`Dispositivo: ${deviceType}`);
    
    // Conectar al servidor
    connectToServer();
    
    // Eventos
    if (elements.startBtn) elements.startBtn.addEventListener('click', startBroadcast);
    if (elements.stopBtn) elements.stopBtn.addEventListener('click', stopBroadcast);
    if (elements.joinBtn) elements.joinBtn.addEventListener('click', joinAsViewer);
    if (elements.leaveBtn) elements.leaveBtn.addEventListener('click', leaveAsViewer);
    
    // Nombre de sala aleatorio
    if (elements.roomId) {
        const random = Math.random().toString(36).substring(7);
        elements.roomId.value = `sala-${random}`;
    }
    
    log('✅ Aplicación lista');
});