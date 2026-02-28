// ============================================
// VERSIÓN HIPER-SIMPLIFICADA - 100% FUNCIONAL
// ============================================

console.log('🚀 Cliente iniciando...');

// ============================================
// ESPERAR A QUE EL DOM ESTÉ COMPLETAMENTE CARGADO
// ============================================
document.addEventListener('DOMContentLoaded', function() {
    console.log('✅ DOM completamente cargado');
    
    // ============================================
    // 1. OBTENER TODOS LOS ELEMENTOS DEL DOM
    // ============================================
    const localVideo = document.getElementById('localVideo');
    const remoteVideo = document.getElementById('remoteVideo');
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const joinBtn = document.getElementById('joinBtn');
    const leaveBtn = document.getElementById('leaveBtn');
    const roomId = document.getElementById('roomId');
    const viewRoomId = document.getElementById('viewRoomId');
    const localOverlay = document.getElementById('localOverlay');
    const remoteOverlay = document.getElementById('remoteOverlay');
    const viewerCount = document.getElementById('viewerCount');
    const deviceInfo = document.getElementById('deviceInfo');
    
    console.log('✅ Elementos obtenidos:', { 
        startBtn: !!startBtn, 
        stopBtn: !!stopBtn, 
        joinBtn: !!joinBtn, 
        leaveBtn: !!leaveBtn 
    });
    
    // ============================================
    // 2. DETECTAR DISPOSITIVO (FUNCIÓN SIMPLE)
    // ============================================
    function detectDevice() {
        const ua = navigator.userAgent.toLowerCase();
        let type = 'PC';
        
        if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
            type = 'MÓVIL';
        } else if (ua.includes('tablet') || ua.includes('ipad')) {
            type = 'TABLET';
        } else if (ua.includes('tv') || ua.includes('smart-tv')) {
            type = 'TV';
        }
        
        if (deviceInfo) {
            deviceInfo.textContent = `📱 ${type}`;
        }
        
        return type;
    }
    
    // ============================================
    // 3. CONFIGURACIÓN
    // ============================================
    const configuration = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' }
        ]
    };
    
    // Estado de la aplicación
    let socket = null;
    let localStream = null;
    let peerConnection = null;
    let currentRoom = null;
    let isBroadcaster = false;
    
    // ============================================
    // 4. FUNCIONES DE UTILIDAD
    // ============================================
    function log(msg) {
        console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);
    }
    
    function showNotification(msg, type) {
        console.log(`🔔 ${type}: ${msg}`);
        alert(msg); // Simple y efectivo para pruebas
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
        
        if (localVideo) localVideo.srcObject = null;
        if (remoteVideo) remoteVideo.srcObject = null;
        if (localOverlay) localOverlay.style.display = 'flex';
        if (remoteOverlay) remoteOverlay.style.display = 'flex';
        
        isBroadcaster = false;
        currentRoom = null;
        
        if (startBtn) startBtn.disabled = false;
        if (stopBtn) stopBtn.disabled = true;
        if (joinBtn) joinBtn.disabled = false;
        if (leaveBtn) leaveBtn.disabled = true;
    }
    
    // ============================================
    // 5. CONEXIÓN AL SERVIDOR
    // ============================================
    function connectToServer() {
        log('Conectando al servidor...');
        
        socket = io();
        
        socket.on('connect', () => {
            log('✅ Conectado al servidor');
            showNotification('Conectado al servidor', 'success');
        });
        
        socket.on('disconnect', () => {
            log('❌ Desconectado del servidor');
            resetUI();
        });
        
        socket.on('broadcaster-ready', () => {
            log('📡 Modo transmisor listo');
        });
        
        socket.on('room-joined', (data) => {
            currentRoom = data.roomId;
            log(`✅ Unido a sala: ${data.roomId}`);
            if (remoteOverlay) remoteOverlay.style.display = 'none';
            if (viewerCount) viewerCount.textContent = '1 espectador';
        });
        
        socket.on('room-error', (error) => {
            log(`❌ Error: ${error}`);
            alert(error);
            resetUI();
        });
        
        socket.on('broadcaster-disconnected', () => {
            log('📡 Transmisor desconectado');
            if (remoteVideo) remoteVideo.srcObject = null;
            if (remoteOverlay) remoteOverlay.style.display = 'flex';
            resetUI();
        });
        
        // WebRTC events
        socket.on('offer', handleOffer);
        socket.on('answer', handleAnswer);
        socket.on('ice-candidate', handleIceCandidate);
    }
    
    // ============================================
    // 6. FUNCIONES WEBRTC
    // ============================================
    async function handleOffer(data) {
        log('📤 Oferta recibida');
        
        if (!peerConnection) {
            peerConnection = new RTCPeerConnection(configuration);
            
            peerConnection.ontrack = (event) => {
                log('📥 Track remoto recibido');
                if (remoteVideo) remoteVideo.srcObject = event.streams[0];
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
            log(`❌ Error: ${err.message}`);
        }
    }
    
    async function handleAnswer(data) {
        log('📥 Respuesta recibida');
        try {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
            log('✅ Conexión establecida');
        } catch (err) {
            log(`❌ Error: ${err.message}`);
        }
    }
    
    async function handleIceCandidate(data) {
        try {
            if (peerConnection) {
                await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
                log('🧊 ICE candidate agregado');
            }
        } catch (err) {
            log(`❌ Error: ${err.message}`);
        }
    }
    
    // ============================================
    // 7. FUNCIONES DE TRANSMISIÓN
    // ============================================
    async function startBroadcast() {
        try {
            const room = roomId?.value.trim();
            if (!room) {
                alert('Ingresa un nombre para la sala');
                return;
            }
            
            log('Solicitando captura de pantalla...');
            localStream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: true
            });
            
            if (localVideo) localVideo.srcObject = localStream;
            if (localOverlay) localOverlay.style.display = 'none';
            
            isBroadcaster = true;
            currentRoom = room;
            
            if (startBtn) startBtn.disabled = true;
            if (stopBtn) stopBtn.disabled = false;
            if (joinBtn) joinBtn.disabled = true;
            
            socket.emit('broadcaster-join', room);
            
            // Crear peer connection
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
            showNotification('Transmisión iniciada', 'success');
            
        } catch (err) {
            log(`❌ Error: ${err.message}`);
            alert('Error: ' + err.message);
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
        
        if (localVideo) localVideo.srcObject = null;
        if (localOverlay) localOverlay.style.display = 'flex';
        
        resetUI();
        log('⏹️ Transmisión detenida');
        showNotification('Transmisión detenida', 'info');
    }
    
    function joinAsViewer() {
        const room = viewRoomId?.value.trim();
        if (!room) {
            alert('Ingresa un nombre para la sala');
            return;
        }
        
        currentRoom = room;
        
        if (joinBtn) joinBtn.disabled = true;
        if (leaveBtn) leaveBtn.disabled = false;
        if (startBtn) startBtn.disabled = true;
        
        if (remoteOverlay) {
            remoteOverlay.innerHTML = '<span>Conectando...</span>';
        }
        
        socket.emit('viewer-join', room);
        log(`👁️ Uniéndose a: ${room}`);
    }
    
    function leaveAsViewer() {
        if (peerConnection) {
            peerConnection.close();
            peerConnection = null;
        }
        
        if (remoteVideo) remoteVideo.srcObject = null;
        if (remoteOverlay) {
            remoteOverlay.style.display = 'flex';
            remoteOverlay.innerHTML = '<span>Esperando transmisión...</span>';
        }
        
        resetUI();
        log('👋 Desconectado');
    }
    
    // ============================================
    // 8. INICIALIZACIÓN
    // ============================================
    log('Inicializando...');
    
    // Detectar dispositivo
    const deviceType = detectDevice();
    log(`Dispositivo: ${deviceType}`);
    
    // Conectar al servidor
    connectToServer();
    
    // Configurar eventos
    if (startBtn) startBtn.addEventListener('click', startBroadcast);
    if (stopBtn) stopBtn.addEventListener('click', stopBroadcast);
    if (joinBtn) joinBtn.addEventListener('click', joinAsViewer);
    if (leaveBtn) leaveBtn.addEventListener('click', leaveAsViewer);
    
    // Generar nombre de sala aleatorio
    if (roomId) {
        const random = Math.random().toString(36).substring(7);
        roomId.value = `sala-${random}`;
    }
    
    log('✅ Aplicación lista');
});

// ============================================
// 9. FUNCIÓN GLOBAL PARA DEBUG (si existe)
// ============================================
window.toggleDebug = function() {
    const debugContent = document.getElementById('debugContent');
    if (debugContent) {
        debugContent.classList.toggle('collapsed');
        const icon = document.querySelector('.toggle-icon');
        if (icon) {
            icon.textContent = debugContent.classList.contains('collapsed') ? '▶' : '▼';
        }
    }
};

console.log('📦 Script cargado, esperando DOM...');