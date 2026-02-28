// ============================================
// CLIENTE UNIVERSAL - Funciona en todos los dispositivos
// ============================================

// Configuración adaptativa según dispositivo
const CONFIG = {
    // Servidores STUN para NAT traversal
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' }
    ]
};

// Detectar tipo de dispositivo
const deviceInfo = detectDevice();
console.log('📱 Dispositivo detectado:', deviceInfo);

// Elementos del DOM
const elements = {
    localVideo: document.getElementById('localVideo'),
    remoteVideo: document.getElementById('remoteVideo'),
    statusText: document.getElementById('statusText'),
    connectionStatus: document.getElementById('connectionStatus'),
    deviceInfo: document.getElementById('deviceInfo'),
    localDeviceBadge: document.getElementById('localDeviceBadge'),
    remoteDeviceBadge: document.getElementById('remoteDeviceBadge'),
    viewerCount: document.getElementById('viewerCount'),
    
    // Botones
    startBtn: document.getElementById('startBtn'),
    stopBtn: document.getElementById('stopBtn'),
    joinBtn: document.getElementById('joinBtn'),
    leaveBtn: document.getElementById('leaveBtn'),
    
    // Inputs
    roomId: document.getElementById('roomId'),
    viewRoomId: document.getElementById('viewRoomId'),
    
    // Paneles
    roomsPanel: document.getElementById('roomsPanel'),
    activeRooms: document.getElementById('activeRooms'),
    viewersPanel: document.getElementById('viewersPanel'),
    viewersList: document.getElementById('viewersList'),
    qualitySelector: document.getElementById('qualitySelector'),
    viewerOptions: document.getElementById('viewerOptions'),
    qualitySelect: document.getElementById('qualitySelect'),
    
    // Overlays
    localOverlay: document.getElementById('localOverlay'),
    remoteOverlay: document.getElementById('remoteOverlay'),
    
    // Stats
    localStats: document.getElementById('localStats'),
    remoteStats: document.getElementById('remoteStats'),
    
    // Debug
    connectionLog: document.getElementById('connectionLog'),
    debugContent: document.getElementById('debugContent')
};

// Estado de la aplicación
const state = {
    socket: null,
    localStream: null,
    peerConnection: null,
    currentRoom: null,
    isBroadcaster: false,
    deviceType: deviceInfo.type,
    viewers: new Map(),
    connectionQuality: 'auto',
    statsInterval: null
};

// ============================================
// FUNCIONES DE DETECCIÓN DE DISPOSITIVO
// ============================================

function detectDevice() {
    const ua = navigator.userAgent.toLowerCase();
    const platform = navigator.platform?.toLowerCase() || '';
    
    let type = 'pc';
    let os = 'unknown';
    let browser = 'unknown';
    
    // Detectar tipo de dispositivo
    if (ua.includes('tv') || ua.includes('smart-tv') || 
        ua.includes('googletv') || ua.includes('appletv') || 
        ua.includes('roku') || ua.includes('vizio')) {
        type = 'tv';
    } else if (ua.includes('tablet') || ua.includes('ipad') || 
               ua.includes('playbook') || ua.includes('silk')) {
        type = 'tablet';
    } else if (ua.includes('mobile') || ua.includes('android') || 
               ua.includes('iphone') || ua.includes('ipod') || 
               ua.includes('blackberry')) {
        type = 'mobile';
    }
    
    // Detectar SO
    if (ua.includes('windows')) os = 'windows';
    else if (ua.includes('mac')) os = 'mac';
    else if (ua.includes('linux')) os = 'linux';
    else if (ua.includes('android')) os = 'android';
    else if (ua.includes('ios') || ua.includes('iphone') || ua.includes('ipad')) os = 'ios';
    
    // Detectar navegador
    if (ua.includes('chrome')) browser = 'chrome';
    else if (ua.includes('firefox')) browser = 'firefox';
    else if (ua.includes('safari')) browser = 'safari';
    else if (ua.includes('edge')) browser = 'edge';
    else if (ua.includes('opera')) browser = 'opera';
    
    // Características del dispositivo
    const features = {
        touch: 'ontouchstart' in window,
        webRTC: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
        screenShare: !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia),
        orientation: screen.orientation?.type || 'unknown',
        pixelRatio: window.devicePixelRatio || 1,
        screenSize: `${window.screen.width}x${window.screen.height}`,
        viewport: `${window.innerWidth}x${window.innerHeight}`
    };
    
    // Calidad recomendada
    let recommendedQuality = '720p';
    if (type === 'mobile') recommendedQuality = '480p';
    else if (type === 'tv') recommendedQuality = '1080p';
    
    // Mostrar información en UI
    if (elements.deviceInfo) {
        elements.deviceInfo.innerHTML = `
            <span class="device-${type}">${type.toUpperCase()}</span> • 
            ${os} • ${browser} • 
            ${features.touch ? '📱 Touch' : '🖱️ Mouse'}
        `;
    }
    
    return {
        type,
        os,
        browser,
        features,
        recommendedQuality,
        ua: ua.substring(0, 100)
    };
}

// ============================================
// CONEXIÓN AL SERVIDOR
// ============================================

function connectToServer() {
    // Determinar URL del servidor
    const serverUrl = getServerUrl();
    log(`Conectando a servidor: ${serverUrl}`);
    
    state.socket = io(serverUrl, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 20000
    });
    
    state.socket.on('connect', () => {
        updateConnectionStatus(true);
        log(`🟢 Conectado al servidor - ID: ${state.socket.id}`);
        
        // Solicitar salas activas
        state.socket.emit('get-active-rooms');
        
        // Enviar información del dispositivo
        state.socket.emit('device-info', {
            type: state.deviceType,
            features: deviceInfo.features
        });
    });
    
    state.socket.on('disconnect', (reason) => {
        updateConnectionStatus(false);
        log(`🔴 Desconectado: ${reason}`);
        
        if (reason === 'io server disconnect') {
            // El servidor cerró la conexión, reconectar manualmente
            setTimeout(() => {
                state.socket.connect();
            }, 1000);
        }
    });
    
    state.socket.on('connect_error', (error) => {
        log(`❌ Error de conexión: ${error.message}`);
        updateConnectionStatus(false, 'Error de conexión');
    });
    
    state.socket.on('active-rooms', (rooms) => {
        updateRoomsList(rooms);
    });
    
    state.socket.on('broadcaster-ready', (data) => {
        log(`📡 Modo transmisor activado - Sala: ${data.roomId}`);
        showNotification('Transmisión iniciada', 'success');
        elements.qualitySelector.style.display = 'block';
    });
    
    state.socket.on('room-joined', (data) => {
        state.currentRoom = data.roomId;
        log(`✅ Unido a sala: ${data.roomId} como ${data.deviceType}`);
        showNotification(`Unido a sala ${data.roomId}`, 'success');
        
        elements.remoteOverlay.style.display = 'none';
        elements.viewerOptions.style.display = 'block';
        
        if (elements.remoteDeviceBadge) {
            elements.remoteDeviceBadge.textContent = data.deviceType.toUpperCase();
        }
        
        // Actualizar contador de viewers
        if (elements.viewerCount) {
            elements.viewerCount.textContent = `${data.totalViewers} espectadores`;
        }
    });
    
    state.socket.on('room-error', (error) => {
        log(`❌ Error: ${error.message} (${error.code})`);
        showNotification(error.message, 'error');
        resetUI();
    });
    
    state.socket.on('viewers-update', (data) => {
        if (elements.viewerCount) {
            elements.viewerCount.textContent = `${data.total} espectadores`;
        }
        updateViewersList(data.viewers);
    });
    
    state.socket.on('broadcaster-disconnected', (data) => {
        log(`📡 Transmisor desconectado: ${data.reason}`);
        showNotification('El transmisor se ha desconectado', 'warning');
        handleBroadcasterDisconnect();
    });
    
    state.socket.on('broadcast-ended', (data) => {
        log(`🛑 Transmisión finalizada: ${data.message}`);
        showNotification(data.message, 'info');
        resetUI();
    });
    
    // Eventos WebRTC
    state.socket.on('offer', handleOffer);
    state.socket.on('answer', handleAnswer);
    state.socket.on('ice-candidate', handleIceCandidate);
}

function getServerUrl() {
    // Intentar obtener URL del servidor actual
    const currentUrl = window.location.origin;
    log(`URL actual: ${currentUrl}`);
    return currentUrl;
}

// ============================================
// FUNCIONES DE TRANSMISIÓN
// ============================================

async function startBroadcast() {
    try {
        const roomName = elements.roomId.value.trim();
        if (!roomName) {
            alert('Por favor, ingresa un nombre para la sala');
            return;
        }
        
        log('Solicitando captura de pantalla...');
        
        // Opciones según dispositivo
        const videoConstraints = {
            cursor: 'always',
            displaySurface: 'monitor'
        };
        
        // En móvil, opciones más simples
        if (state.deviceType === 'mobile') {
            videoConstraints.displaySurface = 'browser';
        }
        
        state.localStream = await navigator.mediaDevices.getDisplayMedia({
            video: videoConstraints,
            audio: true
        });
        
        elements.localVideo.srcObject = state.localStream;
        elements.localOverlay.style.display = 'none';
        
        // Actualizar UI
        state.isBroadcaster = true;
        state.currentRoom = roomName;
        elements.startBtn.disabled = true;
        elements.stopBtn.disabled = false;
        elements.joinBtn.disabled = true;
        
        // Notificar al servidor
        state.socket.emit('broadcaster-join', roomName);
        
        // Crear peer connection
        createPeerConnectionAsBroadcaster();
        
        // Mostrar badge local
        if (elements.localDeviceBadge) {
            elements.localDeviceBadge.textContent = state.deviceType.toUpperCase();
        }
        
        // Iniciar estadísticas
        startStatsMonitoring();
        
        // Manejar cierre de captura
        state.localStream.getVideoTracks()[0].onended = () => {
            stopBroadcast();
        };
        
        log(`📡 Transmitiendo en sala: ${roomName}`);
        showNotification('Transmisión iniciada', 'success');
        
    } catch (error) {
        log(`❌ Error al iniciar transmisión: ${error.message}`);
        showNotification('Error al acceder a la pantalla', 'error');
        resetUI();
    }
}

function stopBroadcast() {
    if (state.localStream) {
        state.localStream.getTracks().forEach(track => track.stop());
        state.localStream = null;
    }
    
    if (state.peerConnection) {
        state.peerConnection.close();
        state.peerConnection = null;
    }
    
    if (state.currentRoom && state.isBroadcaster) {
        state.socket.emit('stop-broadcast', state.currentRoom);
    }
    
    elements.localVideo.srcObject = null;
    elements.localOverlay.style.display = 'flex';
    
    state.isBroadcaster = false;
    state.currentRoom = null;
    
    elements.startBtn.disabled = false;
    elements.stopBtn.disabled = true;
    elements.joinBtn.disabled = false;
    elements.qualitySelector.style.display = 'none';
    
    stopStatsMonitoring();
    
    log('⏹️ Transmisión detenida');
    showNotification('Transmisión detenida', 'info');
}

// ============================================
// FUNCIONES DE VISUALIZACIÓN
// ============================================

async function joinAsViewer() {
    const roomName = elements.viewRoomId.value.trim();
    if (!roomName) {
        alert('Por favor, ingresa un nombre para la sala');
        return;
    }
    
    state.currentRoom = roomName;
    elements.joinBtn.disabled = true;
    elements.leaveBtn.disabled = false;
    elements.startBtn.disabled = true;
    
    // Enviar solicitud con info del dispositivo
    state.socket.emit('viewer-join', {
        roomId: roomName,
        deviceInfo: {
            type: state.deviceType,
            screenSize: `${window.innerWidth}x${window.innerHeight}`
        }
    });
    
    elements.remoteOverlay.innerHTML = '<span>Conectando...</span>';
    log(`👁️ Uniéndose a sala: ${roomName}`);
}

function leaveAsViewer() {
    if (state.peerConnection) {
        state.peerConnection.close();
        state.peerConnection = null;
    }
    
    elements.remoteVideo.srcObject = null;
    elements.remoteOverlay.style.display = 'flex';
    elements.remoteOverlay.innerHTML = '<span>Esperando transmisión...</span>';
    
    state.currentRoom = null;
    
    elements.joinBtn.disabled = false;
    elements.leaveBtn.disabled = true;
    elements.startBtn.disabled = false;
    elements.viewerOptions.style.display = 'none';
    
    log('👋 Desconectado de la transmisión');
}

// ============================================
// FUNCIONES WEBRTC
// ============================================

function createPeerConnectionAsBroadcaster() {
    state.peerConnection = new RTCPeerConnection({ iceServers: CONFIG.iceServers });
    
    // Añadir tracks
    state.localStream.getTracks().forEach(track => {
        state.peerConnection.addTrack(track, state.localStream);
    });
    
    state.peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            log(`🧊 Nuevo ICE candidate local`);
            state.socket.emit('ice-candidate', {
                target: 'broadcast',
                candidate: event.candidate
            });
        }
    };
    
    state.peerConnection.onconnectionstatechange = () => {
        log(`🔌 Estado conexión: ${state.peerConnection.connectionState}`);
        
        if (state.peerConnection.connectionState === 'connected') {
            log('✅ Conexión WebRTC establecida');
            showNotification('Viewer conectado', 'success');
        }
    };
    
    state.peerConnection.oniceconnectionstatechange = () => {
        log(`🧊 Estado ICE: ${state.peerConnection.iceConnectionState}`);
    };
    
    log('🎥 Peer connection creada como transmisor');
}

function createPeerConnectionAsViewer(broadcasterId) {
    state.peerConnection = new RTCPeerConnection({ iceServers: CONFIG.iceServers });
    
    state.peerConnection.ontrack = (event) => {
        log(`📥 Track remoto recibido`);
        elements.remoteVideo.srcObject = event.streams[0];
        elements.remoteOverlay.style.display = 'none';
    };
    
    state.peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            state.socket.emit('ice-candidate', {
                target: broadcasterId,
                candidate: event.candidate
            });
        }
    };
    
    state.peerConnection.onconnectionstatechange = () => {
        log(`🔌 Estado conexión viewer: ${state.peerConnection.connectionState}`);
    };
    
    log('👁️ Peer connection creada como viewer');
}

async function handleOffer(data) {
    log(`📤 Oferta recibida de ${data.from}`);
    
    if (!state.peerConnection) {
        createPeerConnectionAsViewer(data.from);
    }
    
    try {
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
        log(`❌ Error al manejar oferta: ${error.message}`);
    }
}

async function handleAnswer(data) {
    log(`📥 Respuesta recibida de ${data.from}`);
    
    try {
        await state.peerConnection.setRemoteDescription(
            new RTCSessionDescription(data.answer)
        );
        log('✅ Descripción remota establecida');
    } catch (error) {
        log(`❌ Error al manejar respuesta: ${error.message}`);
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
        log(`❌ Error al agregar ICE candidate: ${error.message}`);
    }
}

// ============================================
// FUNCIONES DE UI
// ============================================

function updateConnectionStatus(connected, message = '') {
    const indicator = document.querySelector('.status-indicator');
    const statusText = elements.statusText;
    
    if (connected) {
        indicator.classList.add('connected');
        statusText.textContent = message || 'Conectado';
    } else {
        indicator.classList.remove('connected');
        statusText.textContent = message || 'Desconectado';
    }
}

function updateRoomsList(rooms) {
    if (!elements.activeRooms) return;
    
    if (rooms.length === 0) {
        elements.activeRooms.innerHTML = '<div class="loading-rooms">No hay salas activas</div>';
        return;
    }
    
    elements.activeRooms.innerHTML = rooms.map(room => `
        <div class="room-item" onclick="quickJoin('${room.id}')">
            <span class="room-name">📡 ${room.id}</span>
            <span class="viewers">👥 ${room.viewers}</span>
            <span class="device-badge">${room.deviceType}</span>
        </div>
    `).join('');
}

function updateViewersList(viewers) {
    if (!elements.viewersList) return;
    
    if (viewers.length === 0) {
        elements.viewersPanel.style.display = 'none';
        return;
    }
    
    elements.viewersPanel.style.display = 'block';
    elements.viewersList.innerHTML = viewers.map(viewer => `
        <div class="viewer-item">
            <span class="viewer-id">👤 ${viewer.id.substring(0, 6)}...</span>
            <span class="viewer-device">${viewer.deviceType}</span>
        </div>
    `).join('');
}

function showNotification(message, type = 'info') {
    // Crear elemento de notificación
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    
    // Estilos para la notificación
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
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// ============================================
// FUNCIONES DE MONITOREO
// ============================================

function startStatsMonitoring() {
    if (state.statsInterval) clearInterval(state.statsInterval);
    
    state.statsInterval = setInterval(() => {
        if (state.localStream && elements.localStats) {
            const videoTrack = state.localStream.getVideoTracks()[0];
            if (videoTrack) {
                const settings = videoTrack.getSettings();
                elements.localStats.innerHTML = `
                    📊 ${settings.width}x${settings.height} | 
                    ⚡ ${Math.round(videoTrack.getConstraints().frameRate || 30)}fps
                `;
            }
        }
        
        if (state.peerConnection && elements.remoteStats) {
            // Obtener estadísticas de WebRTC si es posible
            state.peerConnection.getStats().then(stats => {
                stats.forEach(report => {
                    if (report.type === 'inbound-rtp' && report.kind === 'video') {
                        elements.remoteStats.innerHTML = `
                            📥 ${Math.round(report.bytesReceived / 1024 / 1024)} MB | 
                            📊 ${report.frameWidth}x${report.frameHeight} | 
                            ⚡ ${report.framesPerSecond || 0}fps
                        `;
                    }
                });
            }).catch(() => {});
        }
    }, 1000);
}

function stopStatsMonitoring() {
    if (state.statsInterval) {
        clearInterval(state.statsInterval);
        state.statsInterval = null;
    }
}

// ============================================
// UTILIDADES
// ============================================

function log(message) {
    console.log(`[${new Date().toLocaleTimeString()}] ${message}`);
    
    if (elements.connectionLog) {
        const entry = document.createElement('div');
        entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
        elements.connectionLog.appendChild(entry);
        elements.connectionLog.scrollTop = elements.connectionLog.scrollHeight;
    }
}

function handleBroadcasterDisconnect() {
    if (state.peerConnection) {
        state.peerConnection.close();
        state.peerConnection = null;
    }
    
    elements.remoteVideo.srcObject = null;
    elements.remoteOverlay.style.display = 'flex';
    elements.remoteOverlay.innerHTML = '<span>Transmisor desconectado</span>';
    
    if (!state.isBroadcaster) {
        elements.joinBtn.disabled = false;
        elements.leaveBtn.disabled = true;
    }
}

function resetUI() {
    if (state.localStream) {
        state.localStream.getTracks().forEach(track => track.stop());
        state.localStream = null;
    }
    
    if (state.peerConnection) {
        state.peerConnection.close();
        state.peerConnection = null;
    }
    
    elements.localVideo.srcObject = null;
    elements.remoteVideo.srcObject = null;
    elements.localOverlay.style.display = 'flex';
    elements.remoteOverlay.style.display = 'flex';
    
    state.isBroadcaster = false;
    state.currentRoom = null;
    
    elements.startBtn.disabled = false;
    elements.stopBtn.disabled = true;
    elements.joinBtn.disabled = false;
    elements.leaveBtn.disabled = true;
    elements.qualitySelector.style.display = 'none';
    elements.viewerOptions.style.display = 'none';
    
    stopStatsMonitoring();
}

function quickJoin(roomId) {
    elements.viewRoomId.value = roomId;
    joinAsViewer();
}

function toggleDebug() {
    elements.debugContent.classList.toggle('collapsed');
    const icon = document.querySelector('.toggle-icon');
    if (icon) {
        icon.textContent = elements.debugContent.classList.contains('collapsed') ? '▶' : '▼';
    }
}

// ============================================
// EVENT LISTENERS
// ============================================

// Botones principales
elements.startBtn.addEventListener('click', startBroadcast);
elements.stopBtn.addEventListener('click', stopBroadcast);
elements.joinBtn.addEventListener('click', joinAsViewer);
elements.leaveBtn.addEventListener('click', leaveAsViewer);

// Calidad de video
if (elements.qualitySelect) {
    elements.qualitySelect.addEventListener('change', (e) => {
        state.connectionQuality = e.target.value;
        if (state.isBroadcaster && state.currentRoom) {
            state.socket.emit('request-quality', {
                roomId: state.currentRoom,
                quality: e.target.value
            });
        }
    });
}

// Botones de calidad para viewer
document.querySelectorAll('.quality-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.quality-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        
        // Aquí se podría ajustar la calidad solicitada
        const quality = e.target.dataset.quality;
        log(`Calidad seleccionada: ${quality}`);
    });
});

// Generar nombre de sala aleatorio
if (elements.roomId) {
    const randomSuffix = Math.random().toString(36).substring(7);
    elements.roomId.value = `sala-${randomSuffix}`;
}

// Tecla Enter en inputs
elements.roomId.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') startBroadcast();
});

elements.viewRoomId.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') joinAsViewer();
});

// ============================================
// INICIALIZACIÓN
// ============================================

// Exponer funciones globales necesarias
window.quickJoin = quickJoin;
window.toggleDebug = toggleDebug;

// Conectar al servidor
connectToServer();

// Prevenir cierre accidental
window.addEventListener('beforeunload', (e) => {
    if (state.isBroadcaster || state.currentRoom) {
        e.preventDefault();
        e.returnValue = '¿Salir de la transmisión?';
    }
});

log('🚀 Aplicación inicializada');
log(`📱 Dispositivo: ${state.deviceType}`);