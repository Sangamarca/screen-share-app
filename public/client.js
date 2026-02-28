// ============================================
// VERSIÓN OPTIMIZADA PARA MÓVIL - CON HEARTBEAT
// ============================================
console.log('🚀 Cliente optimizado para móvil');

document.addEventListener('DOMContentLoaded', function() {
    console.log('✅ DOM listo');
    
    // Detectar móvil
    const isMobile = /mobile|android|iphone|ipad/i.test(navigator.userAgent);
    console.log('📱 Dispositivo:', isMobile ? 'MÓVIL' : 'PC');
    
    // Elementos
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
        connectionLog: document.getElementById('connectionLog'),
        debugContent: document.getElementById('debugContent')
    };
    
    // Configuración
    const configuration = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
        ]
    };
    
    // Estado
    let socket = null;
    let localStream = null;
    let peerConnection = null;
    let currentRoom = null;
    let isBroadcaster = false;
    let heartbeatInterval = null;
    
    // ============================================
    // FUNCIONES DE UTILIDAD
    // ============================================
    function log(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        console.log(`[${timestamp}] ${message}`);
        
        if (elements.connectionLog) {
            const entry = document.createElement('div');
            entry.textContent = `[${timestamp}] ${message}`;
            elements.connectionLog.appendChild(entry);
            elements.connectionLog.scrollTop = elements.connectionLog.scrollHeight;
        }
        
        if (elements.statusText) {
            elements.statusText.textContent = message;
        }
    }
    
    function updateConnectionStatus(connected, message = '') {
        const indicator = document.querySelector('.status-indicator');
        if (indicator) {
            if (connected) {
                indicator.classList.add('connected');
            } else {
                indicator.classList.remove('connected');
            }
        }
    }
    
    function showNotification(message, type = 'info') {
        console.log(`🔔 ${type}: ${message}`);
        
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 25px;
            background: white;
            border-radius: 8px;
            box-shadow: 0 5px 20px rgba(0,0,0,0.2);
            z-index: 9999;
            border-left: 4px solid ${type === 'success' ? '#28a745' : type === 'error' ? '#dc3545' : '#ffc107'};
        `;
        notification.textContent = message;
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 3000);
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
    // CONEXIÓN AL SERVIDOR CON HEARTBEAT (PARTE 2)
    // ============================================
    function connectToServer() {
        log('Conectando al servidor...');
        
        // Configuración de socket con WebSocket puro para mayor estabilidad
        socket = io({
            transports: ['websocket'], // Forzar WebSocket puro
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            timeout: 20000
        });
        
        socket.on('connect', () => {
            log('✅ Conectado al servidor');
            updateConnectionStatus(true, 'Conectado');
            showNotification('Conectado al servidor', 'success');
            
            // ===== HEARTBEAT: Enviar ping cada 30 segundos =====
            if (heartbeatInterval) {
                clearInterval(heartbeatInterval);
            }
            
            heartbeatInterval = setInterval(() => {
                if (socket && socket.connected) {
                    socket.emit('ping');
                    log('💓 Heartbeat enviado');
                } else {
                    // Si el socket no está conectado, limpiar el intervalo
                    if (heartbeatInterval) {
                        clearInterval(heartbeatInterval);
                        heartbeatInterval = null;
                    }
                }
            }, 30000); // Cada 30 segundos
            // ===== FIN HEARTBEAT =====
        });
        
        socket.on('pong', () => {
            log('💓 Heartbeat recibido');
        });
        
        socket.on('disconnect', (reason) => {
            log(`❌ Desconectado: ${reason}`);
            updateConnectionStatus(false, 'Desconectado');
            showNotification('Desconectado del servidor', 'error');
            
            // Limpiar heartbeat al desconectar
            if (heartbeatInterval) {
                clearInterval(heartbeatInterval);
                heartbeatInterval = null;
            }
            
            // Si éramos broadcaster, limpiar UI
            if (isBroadcaster) {
                resetUI();
            }
        });
        
        socket.on('connect_error', (err) => {
            log(`❌ Error conexión: ${err.message}`);
            updateConnectionStatus(false, 'Error de conexión');
        });
        
        socket.on('broadcaster-ready', () => {
            log('📡 Modo transmisor listo');
            showNotification('Transmisión iniciada', 'success');
        });
        
        socket.on('room-joined', (data) => {
            currentRoom = data.roomId;
            log(`✅ Unido a sala: ${data.roomId}`);
            showNotification(`Unido a sala ${data.roomId}`, 'success');
            if (elements.remoteOverlay) elements.remoteOverlay.style.display = 'none';
        });
        
        socket.on('room-error', (error) => {
            const msg = error.message || String(error);
            log(`❌ Error sala: ${msg}`);
            showNotification(msg, 'error');
            resetUI();
        });
        
        socket.on('broadcaster-disconnected', () => {
            log('📡 Transmisor desconectado');
            showNotification('El transmisor se ha desconectado', 'warning');
            if (elements.remoteVideo) elements.remoteVideo.srcObject = null;
            if (elements.remoteOverlay) elements.remoteOverlay.style.display = 'flex';
            resetUI();
        });
        
        // WebRTC signaling
        socket.on('offer', handleOffer);
        socket.on('answer', handleAnswer);
        socket.on('ice-candidate', handleIceCandidate);
    }
    
    // ============================================
    // WEBRTC HANDLERS
    // ============================================
    async function handleOffer(data) {
        log('📤 Oferta recibida');
        
        if (!peerConnection) {
            peerConnection = new RTCPeerConnection(configuration);
            
            peerConnection.ontrack = (event) => {
                log('📥 Track remoto recibido');
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
            socket.emit('answer', { target: data.from, answer });
            log('📥 Respuesta enviada');
        } catch (err) {
            log(`❌ Error en offer: ${err.message}`);
        }
    }
    
    async function handleAnswer(data) {
        log('📥 Respuesta recibida');
        try {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
            log('✅ Conexión establecida');
        } catch (err) {
            log(`❌ Error en answer: ${err.message}`);
        }
    }
    
    async function handleIceCandidate(data) {
        try {
            if (peerConnection) {
                await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
                log('🧊 ICE candidate agregado');
            }
        } catch (err) {
            log(`❌ Error ICE: ${err.message}`);
        }
    }
    
    // ============================================
    // FUNCIONES DE TRANSMISIÓN
    // ============================================
    async function startBroadcast() {
        try {
            const roomName = elements.roomId?.value.trim();
            if (!roomName) {
                showNotification('Ingresa un nombre para la sala', 'error');
                return;
            }
            
            log('Solicitando captura de pantalla...');
            
            const constraints = {
                video: {
                    frameRate: isMobile ? 15 : 30,
                    width: isMobile ? 640 : 1280,
                    height: isMobile ? 360 : 720
                },
                audio: true
            };
            
            localStream = await navigator.mediaDevices.getDisplayMedia(constraints);
            
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
            
            localStream.getVideoTracks()[0].onended = () => {
                log('⏹️ Captura finalizada por el usuario');
                stopBroadcast();
            };
            
            log(`📡 Transmitiendo en: ${roomName}`);
            showNotification('Transmisión iniciada', 'success');
            
        } catch (error) {
            log(`❌ Error al transmitir: ${error.message}`);
            showNotification('Error al iniciar transmisión: ' + error.message, 'error');
            resetUI();
        }
    }
    
    function stopBroadcast() {
        log('⏹️ Deteniendo transmisión...');
        
        if (localStream) {
            localStream.getTracks().forEach(track => {
                track.stop();
            });
            localStream = null;
        }
        
        if (peerConnection) {
            peerConnection.close();
            peerConnection = null;
        }
        
        if (currentRoom && isBroadcaster) {
            socket.emit('stop-broadcast', currentRoom);
        }
        
        if (elements.localVideo) {
            elements.localVideo.srcObject = null;
        }
        if (elements.localOverlay) {
            elements.localOverlay.style.display = 'flex';
        }
        
        resetUI();
        log('✅ Transmisión detenida');
        showNotification('Transmisión detenida', 'info');
    }
    
    // ============================================
    // FUNCIONES DE VISUALIZACIÓN
    // ============================================
    function joinAsViewer() {
        const roomName = elements.viewRoomId?.value.trim();
        if (!roomName) {
            showNotification('Ingresa un nombre para la sala', 'error');
            return;
        }
        
        currentRoom = roomName;
        
        if (elements.joinBtn) elements.joinBtn.disabled = true;
        if (elements.leaveBtn) elements.leaveBtn.disabled = false;
        if (elements.startBtn) elements.startBtn.disabled = true;
        
        if (elements.remoteOverlay) {
            elements.remoteOverlay.innerHTML = '<span>⏳ Conectando...</span>';
        }
        
        socket.emit('viewer-join', roomName);
        log(`👁️ Uniéndose a: ${roomName}`);
    }
    
    function leaveAsViewer() {
        log('👋 Saliendo...');
        
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
        
        if (elements.joinBtn) elements.joinBtn.disabled = false;
        if (elements.leaveBtn) elements.leaveBtn.disabled = true;
        if (elements.startBtn) elements.startBtn.disabled = false;
        
        currentRoom = null;
        log('✅ Desconectado');
    }
    
    // ============================================
    // FUNCIÓN TOGGLE DEBUG
    // ============================================
    window.toggleDebug = function() {
        if (elements.debugContent) {
            elements.debugContent.classList.toggle('collapsed');
            const icon = document.querySelector('.toggle-icon');
            if (icon) {
                icon.textContent = elements.debugContent.classList.contains('collapsed') ? '▶' : '▼';
            }
        }
    };
    
    // ============================================
    // INICIALIZACIÓN
    // ============================================
    function init() {
        log('Inicializando aplicación...');
        
        // Conectar al servidor
        connectToServer();
        
        // Event listeners
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
        
        // Generar nombre de sala aleatorio
        if (elements.roomId) {
            elements.roomId.value = 'fut' + Math.floor(Math.random() * 1000);
        }
        
        log('✅ Aplicación lista');
    }
    
    // Iniciar
    init();
});