// ============================================
// VERSIÓN CON DIAGNÓSTICO PARA MÓVIL
// ============================================
console.log('🚀 Cliente iniciando...');

document.addEventListener('DOMContentLoaded', function() {
    console.log('✅ DOM completamente cargado');
    
    // ============================================
    // DIAGNÓSTICO VISUAL PARA MÓVIL
    // ============================================
    const diagnosticDiv = document.createElement('div');
    diagnosticDiv.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        background: rgba(0,0,0,0.95);
        color: #00ff00;
        padding: 10px;
        font-family: monospace;
        font-size: 12px;
        z-index: 10000;
        max-height: 250px;
        overflow-y: auto;
        border-bottom: 3px solid #00ff00;
        box-shadow: 0 2px 10px rgba(0,0,0,0.5);
        pointer-events: none;
    `;
    document.body.appendChild(diagnosticDiv);
    
    function diag(msg) {
        const time = new Date().toLocaleTimeString();
        console.log(`[${time}] ${msg}`);
        
        const line = document.createElement('div');
        line.textContent = `[${time}] ${msg}`;
        diagnosticDiv.appendChild(line);
        diagnosticDiv.scrollTop = diagnosticDiv.scrollHeight;
        
        // Limitar a 15 líneas
        while (diagnosticDiv.children.length > 15) {
            diagnosticDiv.removeChild(diagnosticDiv.firstChild);
        }
    }
    
    // Detectar dispositivo
    const ua = navigator.userAgent.toLowerCase();
    const isMobile = /mobile|android|iphone|ipad|ipod|blackberry|windows phone/i.test(ua);
    const isTablet = /tablet|ipad/i.test(ua);
    const isTV = /tv|smart-tv|googletv|appletv|roku/i.test(ua);
    
    diag('🔧 DIAGNÓSTICO ACTIVADO');
    diag(`📱 Dispositivo: ${isMobile ? 'MÓVIL' : isTablet ? 'TABLET' : isTV ? 'TV' : 'PC'}`);
    diag(`🌐 URL: ${window.location.href}`);
    diag(`🖥️ User Agent: ${ua.substring(0, 50)}...`);
    diag(`🔌 WebRTC soportado: ${!!navigator.mediaDevices?.getUserMedia}`);
    diag(`📺 ScreenShare soportado: ${!!navigator.mediaDevices?.getDisplayMedia}`);
    
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
        deviceInfo: document.getElementById('deviceInfo'),
        localDeviceBadge: document.getElementById('localDeviceBadge'),
        remoteDeviceBadge: document.getElementById('remoteDeviceBadge'),
        viewerCount: document.getElementById('viewerCount'),
        connectionLog: document.getElementById('connectionLog'),
        debugContent: document.getElementById('debugContent')
    };
    
    // Verificar elementos
    const missingElements = [];
    for (const [key, value] of Object.entries(elements)) {
        if (!value) missingElements.push(key);
    }
    
    if (missingElements.length > 0) {
        diag(`❌ Elementos faltantes: ${missingElements.join(', ')}`);
    } else {
        diag('✅ Todos los elementos del DOM encontrados');
    }
    
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
            { urls: 'stun:stun.schlund.de' },
            { urls: 'stun:stun.stunprotocol.org:3478' }
        ],
        iceCandidatePoolSize: 10,
        iceTransportPolicy: 'all',
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require'
    };
    
    diag(`🧊 STUN servers: ${configuration.iceServers.length}`);
    
    // ============================================
    // ESTADO
    // ============================================
    let socket = null;
    let localStream = null;
    let peerConnection = null;
    let currentRoom = null;
    let isBroadcaster = false;
    let heartbeatInterval = null;
    
    // ============================================
    // FUNCIONES DE UTILIDAD
    // ============================================
    function log(message) {
        const timestamp = new Date().toLocaleTimeString();
        console.log(`[${timestamp}] ${message}`);
        diag(message); // También al diagnóstico
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
        diag(`${type}: ${message}`);
        
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
            animation: slideIn 0.3s ease;
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
    // CONEXIÓN AL SERVIDOR
    // ============================================
    function connectToServer() {
        log('Conectando al servidor...');
        
        socket = io({
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            timeout: 20000
        });
        
        socket.on('connect', () => {
            log(`✅ Conectado al servidor - ID: ${socket.id}`);
            updateConnectionStatus(true, 'Conectado');
            showNotification('Conectado al servidor', 'success');
            
            // Heartbeat cada 15 segundos
            if (heartbeatInterval) {
                clearInterval(heartbeatInterval);
            }
            
            heartbeatInterval = setInterval(() => {
                if (socket && socket.connected) {
                    socket.emit('ping');
                    log('💓 Heartbeat enviado');
                }
            }, 15000);
        });
        
        socket.on('pong', () => {
            log('💓 Heartbeat recibido');
        });
        
        socket.on('disconnect', (reason) => {
            log(`❌ Desconectado: ${reason}`);
            updateConnectionStatus(false, 'Desconectado');
            showNotification('Desconectado del servidor', 'error');
            
            if (heartbeatInterval) {
                clearInterval(heartbeatInterval);
                heartbeatInterval = null;
            }
            
            if (isBroadcaster) {
                resetUI();
            }
        });
        
        socket.on('connect_error', (err) => {
            log(`❌ Error de conexión: ${err.message}`);
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
            if (elements.viewerCount) elements.viewerCount.textContent = '👥 1 espectador';
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
    // WEBRTC HANDLERS CON DIAGNÓSTICO
    // ============================================
    async function handleOffer(data) {
        log('📤 Oferta recibida');
        
        if (!peerConnection) {
            log('🆕 Creando nueva PeerConnection');
            
            peerConnection = new RTCPeerConnection(configuration);
            
            peerConnection.ontrack = (event) => {
                log(`📥 Track remoto recibido - streams: ${event.streams.length}`);
                if (elements.remoteVideo) {
                    elements.remoteVideo.srcObject = event.streams[0];
                    elements.remoteOverlay.style.display = 'none';
                    log('✅ Video mostrado en elemento remoto');
                    showNotification('Video recibido', 'success');
                } else {
                    log('❌ Elemento remoteVideo no encontrado');
                }
            };
            
            peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    log(`🧊 ICE candidate: ${event.candidate.candidate.substring(0, 30)}...`);
                    socket.emit('ice-candidate', {
                        target: data.from,
                        candidate: event.candidate
                    });
                }
            };
            
            peerConnection.oniceconnectionstatechange = () => {
                log(`🧊 ICE state: ${peerConnection.iceConnectionState}`);
                if (peerConnection.iceConnectionState === 'connected') {
                    showNotification('Conexión establecida', 'success');
                }
                if (peerConnection.iceConnectionState === 'failed') {
                    log('❌ ICE failed - problema de conectividad');
                    showNotification('Error de conexión', 'error');
                }
            };
            
            peerConnection.onconnectionstatechange = () => {
                log(`🔌 Connection state: ${peerConnection.connectionState}`);
            };
            
            peerConnection.onsignalingstatechange = () => {
                log(`🚦 Signaling state: ${peerConnection.signalingState}`);
            };
        }
        
        try {
            log('📥 Estableciendo descripción remota...');
            await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
            log('✅ Descripción remota establecida');
            
            log('📤 Creando respuesta...');
            const answer = await peerConnection.createAnswer();
            log('✅ Respuesta creada');
            
            log('📤 Estableciendo descripción local...');
            await peerConnection.setLocalDescription(answer);
            log('✅ Descripción local establecida');
            
            socket.emit('answer', {
                target: data.from,
                answer: answer
            });
            log('📤 Respuesta enviada al broadcaster');
            
        } catch (err) {
            log(`❌ Error en handleOffer: ${err.message}`);
            showNotification('Error en conexión: ' + err.message, 'error');
        }
    }
    
    async function handleAnswer(data) {
        log('📥 Respuesta recibida');
        try {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
            log('✅ Descripción remota establecida');
            log('✅ Conexión WebRTC establecida');
        } catch (err) {
            log(`❌ Error en handleAnswer: ${err.message}`);
        }
    }
    
    async function handleIceCandidate(data) {
        try {
            if (peerConnection) {
                await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
                log('🧊 ICE candidate agregado al peer');
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
            
            log('📤 Solicitando captura de pantalla...');
            
            const constraints = {
                video: {
                    cursor: "always",
                    displaySurface: "window",
                    frameRate: isMobile ? 15 : 30,
                    width: isMobile ? 640 : 1280,
                    height: isMobile ? 360 : 720
                },
                audio: true
            };
            
            localStream = await navigator.mediaDevices.getDisplayMedia(constraints);
            log('✅ Captura obtenida');
            log(`📊 Track de video: ${localStream.getVideoTracks()[0].label}`);
            
            if (elements.localVideo) {
                elements.localVideo.srcObject = localStream;
                log('✅ Video local mostrado');
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
            log('📡 Notificando al servidor como broadcaster');
            
            // Crear peer connection
            peerConnection = new RTCPeerConnection(configuration);
            localStream.getTracks().forEach(track => {
                peerConnection.addTrack(track, localStream);
                log(`➕ Track añadido: ${track.kind}`);
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
                log(`🧊 ICE (broadcaster): ${peerConnection.iceConnectionState}`);
            };
            
            peerConnection.onconnectionstatechange = () => {
                log(`🔌 Connection (broadcaster): ${peerConnection.connectionState}`);
            };
            
            // Manejar cierre de captura
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
                log(`⏹️ Track ${track.kind} detenido`);
            });
            localStream = null;
        }
        
        if (peerConnection) {
            peerConnection.close();
            peerConnection = null;
            log('🔌 PeerConnection cerrada');
        }
        
        if (currentRoom && isBroadcaster) {
            socket.emit('stop-broadcast', currentRoom);
            log('📡 Notificando fin de transmisión');
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
        log(`👁️ Uniéndose a sala: ${roomName}`);
        showNotification(`Conectando a ${roomName}...`, 'info');
    }
    
    function leaveAsViewer() {
        log('👋 Saliendo de la sala...');
        
        if (peerConnection) {
            peerConnection.close();
            peerConnection = null;
            log('🔌 PeerConnection cerrada');
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
        showNotification('Desconectado', 'info');
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
        
        // También ocultar/mostrar diagnóstico
        diagnosticDiv.style.display = diagnosticDiv.style.display === 'none' ? 'block' : 'none';
    };
    
    // ============================================
    // INICIALIZACIÓN
    // ============================================
    function init() {
        log('🚀 Inicializando aplicación...');
        
        // Mostrar info de dispositivo en UI
        if (elements.deviceInfo) {
            let deviceText = 'PC';
            if (isMobile) deviceText = '📱 MÓVIL';
            else if (isTablet) deviceText = '📱 TABLET';
            else if (isTV) deviceText = '📺 TV';
            elements.deviceInfo.textContent = deviceText;
        }
        
        // Conectar al servidor
        connectToServer();
        
        // Event listeners
        if (elements.startBtn) {
            elements.startBtn.addEventListener('click', startBroadcast);
            log('✅ Event listener startBtn añadido');
        }
        if (elements.stopBtn) {
            elements.stopBtn.addEventListener('click', stopBroadcast);
            log('✅ Event listener stopBtn añadido');
        }
        if (elements.joinBtn) {
            elements.joinBtn.addEventListener('click', joinAsViewer);
            log('✅ Event listener joinBtn añadido');
        }
        if (elements.leaveBtn) {
            elements.leaveBtn.addEventListener('click', leaveAsViewer);
            log('✅ Event listener leaveBtn añadido');
        }
        
        // Generar nombre de sala aleatorio
        if (elements.roomId) {
            const randomSuffix = Math.random().toString(36).substring(7);
            elements.roomId.value = `sala-${randomSuffix}`;
            log(`📝 Nombre de sala generado: ${elements.roomId.value}`);
        }
        
        if (elements.viewRoomId) {
            elements.viewRoomId.value = '';
        }
        
        log('✅ Aplicación lista');
        diag('✅ DIAGNÓSTICO LISTO - Esperando eventos...');
    }
    
    // Iniciar
    init();
});