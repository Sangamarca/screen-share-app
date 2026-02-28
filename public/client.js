// ============================================
// VERSIÓN CON MANEJO DE CORTES - ESTABLE
// ============================================
console.log('🚀 Cliente iniciado - Versión estable');

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
        statusText: document.getElementById('statusText'),
        localDeviceBadge: document.getElementById('localDeviceBadge'),
        remoteDeviceBadge: document.getElementById('remoteDeviceBadge'),
        viewerCount: document.getElementById('viewerCount')
    };
    
    // ============================================
    // CONFIGURACIÓN MEJORADA
    // ============================================
    const configuration = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' },
            { urls: 'stun:stun4.l.google.com:19302' }
        ],
        iceCandidatePoolSize: 10,
        iceTransportPolicy: 'all'
    };
    
    // ============================================
    // ESTADO
    // ============================================
    const state = {
        socket: null,
        localStream: null,
        peerConnection: null,
        currentRoom: null,
        isBroadcaster: false,
        reconnectAttempts: 0,
        maxReconnectAttempts: 5,
        connectionMonitor: null
    };
    
    // ============================================
    // UTILIDADES
    // ============================================
    function log(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        console.log(`[${timestamp}] ${message}`);
        
        // Actualizar UI de estado
        if (elements.statusText) {
            elements.statusText.textContent = message;
        }
    }
    
    function showError(message) {
        log(`❌ ${message}`, 'error');
        alert(message);
    }
    
    // ============================================
    // MONITOR DE CONEXIÓN
    // ============================================
    function startConnectionMonitor() {
        if (state.connectionMonitor) {
            clearInterval(state.connectionMonitor);
        }
        
        state.connectionMonitor = setInterval(() => {
            // Verificar conexión WebRTC
            if (state.peerConnection) {
                const connectionState = state.peerConnection.connectionState;
                const iceState = state.peerConnection.iceConnectionState;
                
                log(`📊 Estado: WebRTC=${connectionState}, ICE=${iceState}`);
                
                // Si la conexión se cayó, limpiar
                if (connectionState === 'failed' || connectionState === 'closed' || 
                    iceState === 'failed' || iceState === 'closed' || iceState === 'disconnected') {
                    
                    log('⚠️ Conexión WebRTC perdida - Limpiando...');
                    handleConnectionFailure();
                }
            }
            
            // Verificar conexión Socket
            if (state.socket && !state.socket.connected) {
                log('⚠️ Socket desconectado - Intentando reconectar...');
                state.socket.connect();
            }
        }, 3000);
    }
    
    function handleConnectionFailure() {
        // Limpiar peer connection vieja
        if (state.peerConnection) {
            state.peerConnection.close();
            state.peerConnection = null;
        }
        
        // Limpiar video remoto
        if (elements.remoteVideo) {
            elements.remoteVideo.srcObject = null;
        }
        if (elements.remoteOverlay) {
            elements.remoteOverlay.style.display = 'flex';
        }
        
        // Si somos broadcaster, notificar
        if (state.isBroadcaster && state.currentRoom) {
            log('📡 Re-iniciando transmisión...');
            state.socket.emit('broadcaster-join', state.currentRoom);
        }
        
        // Actualizar UI
        updateUIForDisconnect();
    }
    
    function updateUIForDisconnect() {
        if (!state.isBroadcaster) {
            if (elements.joinBtn) elements.joinBtn.disabled = false;
            if (elements.leaveBtn) elements.leaveBtn.disabled = true;
        }
    }
    
    // ============================================
    // RESET COMPLETO
    // ============================================
    function fullReset() {
        log('🔄 Reiniciando aplicación...');
        
        // Limpiar streams
        if (state.localStream) {
            state.localStream.getTracks().forEach(track => {
                track.stop();
            });
            state.localStream = null;
        }
        
        // Limpiar peer connection
        if (state.peerConnection) {
            state.peerConnection.close();
            state.peerConnection = null;
        }
        
        // Limpiar videos
        if (elements.localVideo) elements.localVideo.srcObject = null;
        if (elements.remoteVideo) elements.remoteVideo.srcObject = null;
        
        // Mostrar overlays
        if (elements.localOverlay) elements.localOverlay.style.display = 'flex';
        if (elements.remoteOverlay) elements.remoteOverlay.style.display = 'flex';
        
        // Resetear estado
        state.isBroadcaster = false;
        state.currentRoom = null;
        
        // Habilitar botones
        if (elements.startBtn) elements.startBtn.disabled = false;
        if (elements.stopBtn) elements.stopBtn.disabled = true;
        if (elements.joinBtn) elements.joinBtn.disabled = false;
        if (elements.leaveBtn) elements.leaveBtn.disabled = true;
        
        log('✅ Reinicio completo');
    }
    
    // ============================================
    // CONEXIÓN AL SERVIDOR
    // ============================================
    function connectToServer() {
        log('Conectando al servidor...');
        
        state.socket = io({
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            timeout: 20000
        });
        
        state.socket.on('connect', () => {
            log(`✅ Conectado - ID: ${state.socket.id}`);
            startConnectionMonitor();
        });
        
        state.socket.on('disconnect', (reason) => {
            log(`❌ Desconectado: ${reason}`);
        });
        
        state.socket.on('connect_error', (error) => {
            log(`❌ Error conexión: ${error.message}`);
        });
        
        // Eventos de sala
        state.socket.on('broadcaster-ready', () => {
            log('📡 Modo transmisor listo');
        });
        
        state.socket.on('room-joined', (data) => {
            state.currentRoom = data.roomId;
            log(`✅ Unido a sala: ${data.roomId}`);
            
            if (elements.remoteOverlay) {
                elements.remoteOverlay.style.display = 'none';
            }
            if (elements.viewerCount) {
                elements.viewerCount.textContent = '👥 1 espectador';
            }
        });
        
        state.socket.on('room-error', (error) => {
            const msg = error.message || String(error);
            log(`❌ Error sala: ${msg}`);
            showError(msg);
            fullReset();
        });
        
        state.socket.on('broadcaster-disconnected', () => {
            log('📡 Transmisor desconectado');
            if (elements.remoteVideo) {
                elements.remoteVideo.srcObject = null;
            }
            if (elements.remoteOverlay) {
                elements.remoteOverlay.style.display = 'flex';
            }
            fullReset();
        });
        
        // WebRTC signaling
        state.socket.on('offer', handleOffer);
        state.socket.on('answer', handleAnswer);
        state.socket.on('ice-candidate', handleIceCandidate);
    }
    
    // ============================================
    // WEBRTC HANDLERS
    // ============================================
    async function handleOffer(data) {
        log('📤 Oferta recibida');
        
        try {
            if (!state.peerConnection) {
                state.peerConnection = new RTCPeerConnection(configuration);
                setupPeerConnectionListeners(data.from);
            }
            
            await state.peerConnection.setRemoteDescription(
                new RTCSessionDescription(data.offer)
            );
            
            const answer = await state.peerConnection.createAnswer();
            await state.peerConnection.setLocalDescription(answer);
            
            state.socket.emit('answer', {
                target: data.from,
                answer: answer
            });
            
            log('📥 Respuesta enviada');
            
        } catch (error) {
            log(`❌ Error en offer: ${error.message}`);
        }
    }
    
    async function handleAnswer(data) {
        log('📥 Respuesta recibida');
        
        try {
            if (state.peerConnection) {
                await state.peerConnection.setRemoteDescription(
                    new RTCSessionDescription(data.answer)
                );
                log('✅ Conexión establecida');
            }
        } catch (error) {
            log(`❌ Error en answer: ${error.message}`);
        }
    }
    
    async function handleIceCandidate(data) {
        try {
            if (state.peerConnection) {
                await state.peerConnection.addIceCandidate(
                    new RTCIceCandidate(data.candidate)
                );
                log('🧊 ICE candidate agregado');
            }
        } catch (error) {
            log(`❌ Error ICE: ${error.message}`);
        }
    }
    
    function setupPeerConnectionListeners(targetId) {
        if (!state.peerConnection) return;
        
        state.peerConnection.ontrack = (event) => {
            log('📥 Track remoto recibido');
            if (elements.remoteVideo) {
                elements.remoteVideo.srcObject = event.streams[0];
            }
        };
        
        state.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                state.socket.emit('ice-candidate', {
                    target: targetId,
                    candidate: event.candidate
                });
            }
        };
        
        state.peerConnection.oniceconnectionstatechange = () => {
            const state_ = state.peerConnection.iceConnectionState;
            log(`🧊 ICE state: ${state_}`);
            
            if (state_ === 'failed' || state_ === 'disconnected') {
                log('⚠️ ICE failed - intentando recuperar...');
            }
        };
        
        state.peerConnection.onconnectionstatechange = () => {
            const state_ = state.peerConnection.connectionState;
            log(`🔌 Connection state: ${state_}`);
            
            if (state_ === 'failed') {
                handleConnectionFailure();
            }
        };
    }
    
    // ============================================
    // FUNCIONES DE TRANSMISIÓN
    // ============================================
    async function startBroadcast() {
        try {
            const roomName = elements.roomId?.value.trim();
            if (!roomName) {
                showError('Ingresa un nombre para la sala');
                return;
            }
            
            log('Solicitando captura de pantalla...');
            
            state.localStream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    frameRate: 30,
                    width: 1280,
                    height: 720
                },
                audio: true
            });
            
            if (elements.localVideo) {
                elements.localVideo.srcObject = state.localStream;
            }
            if (elements.localOverlay) {
                elements.localOverlay.style.display = 'none';
            }
            
            state.isBroadcaster = true;
            state.currentRoom = roomName;
            
            // UI update
            if (elements.startBtn) elements.startBtn.disabled = true;
            if (elements.stopBtn) elements.stopBtn.disabled = false;
            if (elements.joinBtn) elements.joinBtn.disabled = true;
            
            // Notificar al servidor
            state.socket.emit('broadcaster-join', roomName);
            
            // Crear peer connection
            state.peerConnection = new RTCPeerConnection(configuration);
            
            // Añadir tracks
            state.localStream.getTracks().forEach(track => {
                state.peerConnection.addTrack(track, state.localStream);
            });
            
            // Configurar listeners
            state.peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    state.socket.emit('ice-candidate', {
                        target: 'broadcast',
                        candidate: event.candidate
                    });
                }
            };
            
            state.peerConnection.oniceconnectionstatechange = () => {
                log(`🧊 ICE: ${state.peerConnection.iceConnectionState}`);
            };
            
            state.peerConnection.onconnectionstatechange = () => {
                log(`🔌 Conexión: ${state.peerConnection.connectionState}`);
            };
            
            // Manejar cierre de captura
            state.localStream.getVideoTracks()[0].onended = () => {
                log('⏹️ Captura finalizada por el usuario');
                stopBroadcast();
            };
            
            log(`📡 Transmitiendo en: ${roomName}`);
            
        } catch (error) {
            log(`❌ Error al transmitir: ${error.message}`);
            showError('Error al iniciar transmisión: ' + error.message);
            fullReset();
        }
    }
    
    function stopBroadcast() {
        log('⏹️ Deteniendo transmisión...');
        
        // Limpiar stream local
        if (state.localStream) {
            state.localStream.getTracks().forEach(track => {
                track.stop();
            });
            state.localStream = null;
        }
        
        // Cerrar peer connection
        if (state.peerConnection) {
            state.peerConnection.close();
            state.peerConnection = null;
        }
        
        // Notificar al servidor
        if (state.currentRoom && state.isBroadcaster) {
            state.socket.emit('stop-broadcast', state.currentRoom);
        }
        
        // Limpiar video
        if (elements.localVideo) {
            elements.localVideo.srcObject = null;
        }
        if (elements.localOverlay) {
            elements.localOverlay.style.display = 'flex';
        }
        
        // Resetear estado
        state.isBroadcaster = false;
        state.currentRoom = null;
        
        // UI
        if (elements.startBtn) elements.startBtn.disabled = false;
        if (elements.stopBtn) elements.stopBtn.disabled = true;
        if (elements.joinBtn) elements.joinBtn.disabled = false;
        
        log('✅ Transmisión detenida');
    }
    
    // ============================================
    // FUNCIONES DE VISUALIZACIÓN
    // ============================================
    function joinAsViewer() {
        const roomName = elements.viewRoomId?.value.trim();
        if (!roomName) {
            showError('Ingresa un nombre para la sala');
            return;
        }
        
        state.currentRoom = roomName;
        
        // UI
        if (elements.joinBtn) elements.joinBtn.disabled = true;
        if (elements.leaveBtn) elements.leaveBtn.disabled = false;
        if (elements.startBtn) elements.startBtn.disabled = true;
        
        if (elements.remoteOverlay) {
            elements.remoteOverlay.innerHTML = '<span>⏳ Conectando...</span>';
        }
        
        state.socket.emit('viewer-join', roomName);
        log(`👁️ Uniéndose a: ${roomName}`);
    }
    
    function leaveAsViewer() {
        log('👋 Saliendo...');
        
        if (state.peerConnection) {
            state.peerConnection.close();
            state.peerConnection = null;
        }
        
        if (elements.remoteVideo) {
            elements.remoteVideo.srcObject = null;
        }
        if (elements.remoteOverlay) {
            elements.remoteOverlay.style.display = 'flex';
            elements.remoteOverlay.innerHTML = '<span>📺 Esperando transmisión...</span>';
        }
        
        // Resetear UI de viewer
        if (elements.joinBtn) elements.joinBtn.disabled = false;
        if (elements.leaveBtn) elements.leaveBtn.disabled = true;
        if (elements.startBtn) elements.startBtn.disabled = false;
        
        state.currentRoom = null;
        
        log('✅ Desconectado');
    }
    
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