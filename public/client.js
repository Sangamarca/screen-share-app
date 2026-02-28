// ============================================
// VERSIÓN SIMPLIFICADA - FUNCIONA EN RAILWAY
// ============================================

console.log('🚀 Cliente iniciado - Versión simplificada');

// ============================================
// ELEMENTOS DEL DOM (Definidos al inicio)
// ============================================
const elements = {
    localVideo: document.getElementById('localVideo'),
    remoteVideo: document.getElementById('remoteVideo'),
    statusText: document.getElementById('statusText'),
    connectionStatus: document.getElementById('connectionStatus'),
    deviceInfo: document.getElementById('deviceInfo'),
    localDeviceBadge: document.getElementById('localDeviceBadge'),
    remoteDeviceBadge: document.getElementById('remoteDeviceBadge'),
    viewerCount: document.getElementById('viewerCount'),
    
    startBtn: document.getElementById('startBtn'),
    stopBtn: document.getElementById('stopBtn'),
    joinBtn: document.getElementById('joinBtn'),
    leaveBtn: document.getElementById('leaveBtn'),
    
    roomId: document.getElementById('roomId'),
    viewRoomId: document.getElementById('viewRoomId'),
    
    localOverlay: document.getElementById('localOverlay'),
    remoteOverlay: document.getElementById('remoteOverlay'),
    
    connectionLog: document.getElementById('connectionLog'),
    debugContent: document.getElementById('debugContent')
};

// Verificar que todos los elementos existen
console.log('✅ Elementos del DOM cargados');

// ============================================
// ESTADO DE LA APLICACIÓN
// ============================================
const state = {
    socket: null,
    localStream: null,
    peerConnection: null,
    currentRoom: null,
    isBroadcaster: false,
    viewers: new Map()
};

// ============================================
// CONFIGURACIÓN WEBRTC
// ============================================
const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// ============================================
// FUNCIONES DE UTILIDAD
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

function updateConnectionStatus(connected, message = '') {
    const indicator = document.querySelector('.status-indicator');
    const statusText = elements.statusText;
    
    if (connected) {
        indicator?.classList.add('connected');
        if (statusText) statusText.textContent = message || 'Conectado';
    } else {
        indicator?.classList.remove('connected');
        if (statusText) statusText.textContent = message || 'Desconectado';
    }
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
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
    setTimeout(() => notification.remove(), 3000);
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
    
    if (elements.localVideo) elements.localVideo.srcObject = null;
    if (elements.remoteVideo) elements.remoteVideo.srcObject = null;
    if (elements.localOverlay) elements.localOverlay.style.display = 'flex';
    if (elements.remoteOverlay) elements.remoteOverlay.style.display = 'flex';
    
    state.isBroadcaster = false;
    state.currentRoom = null;
    
    if (elements.startBtn) elements.startBtn.disabled = false;
    if (elements.stopBtn) elements.stopBtn.disabled = true;
    if (elements.joinBtn) elements.joinBtn.disabled = false;
    if (elements.leaveBtn) elements.leaveBtn.disabled = true;
}

// ============================================
// DETECCIÓN DE DISPOSITIVO (SIMPLIFICADA)
// ============================================
function detectDevice() {
    const ua = navigator.userAgent.toLowerCase();
    let type = 'pc';
    
    if (ua.includes('tv') || ua.includes('smart-tv')) type = 'tv';
    else if (ua.includes('tablet') || ua.includes('ipad')) type = 'tablet';
    else if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) type = 'mobile';
    
    if (elements.deviceInfo) {
        elements.deviceInfo.innerHTML = `<span>📱 ${type.toUpperCase()}</span>`;
    }
    
    return type;
}

// ============================================
// CONEXIÓN AL SERVIDOR
// ============================================
function connectToServer() {
    log('Conectando al servidor...');
    
    state.socket = io({
        reconnection: true,
        reconnectionAttempts: Infinity
    });
    
    state.socket.on('connect', () => {
        log(`✅ Conectado al servidor - ID: ${state.socket.id}`);
        updateConnectionStatus(true, 'Conectado');
        showNotification('Conectado al servidor', 'success');
    });
    
    state.socket.on('disconnect', (reason) => {
        log(`❌ Desconectado: ${reason}`);
        updateConnectionStatus(false, 'Desconectado');
    });
    
    state.socket.on('connect_error', (error) => {
        log(`❌ Error de conexión: ${error.message}`);
        updateConnectionStatus(false, 'Error de conexión');
    });
    
    state.socket.on('broadcaster-ready', () => {
        log('📡 Modo transmisor listo');
        showNotification('Transmisión iniciada', 'success');
    });
    
    state.socket.on('room-joined', (data) => {
        state.currentRoom = data.roomId;
        log(`✅ Unido a sala: ${data.roomId}`);
        showNotification(`Unido a sala ${data.roomId}`, 'success');
        if (elements.remoteOverlay) elements.remoteOverlay.style.display = 'none';
        if (elements.viewerCount) elements.viewerCount.textContent = '1 espectador';
    });
    
    state.socket.on('room-error', (error) => {
        log(`❌ Error: ${error.message || error}`);
        showNotification(error.message || 'Error en la sala', 'error');
        resetUI();
    });
    
    state.socket.on('broadcaster-disconnected', () => {
        log('📡 Transmisor desconectado');
        showNotification('El transmisor se ha desconectado', 'warning');
        if (elements.remoteVideo) elements.remoteVideo.srcObject = null;
        if (elements.remoteOverlay) elements.remoteOverlay.style.display = 'flex';
        resetUI();
    });
    
    // Eventos WebRTC
    state.socket.on('offer', handleOffer);
    state.socket.on('answer', handleAnswer);
    state.socket.on('ice-candidate', handleIceCandidate);
}

// ============================================
// FUNCIONES DE TRANSMISIÓN
// ============================================
async function startBroadcast() {
    try {
        const roomName = elements.roomId?.value.trim();
        if (!roomName) {
            alert('Por favor, ingresa un nombre para la sala');
            return;
        }
        
        log('Solicitando captura de pantalla...');
        
        state.localStream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: true
        });
        
        if (elements.localVideo) {
            elements.localVideo.srcObject = state.localStream;
        }
        if (elements.localOverlay) elements.localOverlay.style.display = 'none';
        
        state.isBroadcaster = true;
        state.currentRoom = roomName;
        
        if (elements.startBtn) elements.startBtn.disabled = true;
        if (elements.stopBtn) elements.stopBtn.disabled = false;
        if (elements.joinBtn) elements.joinBtn.disabled = true;
        
        state.socket.emit('broadcaster-join', roomName);
        
        // Crear peer connection
        state.peerConnection = new RTCPeerConnection(configuration);
        state.localStream.getTracks().forEach(track => {
            state.peerConnection.addTrack(track, state.localStream);
        });
        
        state.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                state.socket.emit('ice-candidate', {
                    target: 'broadcast',
                    candidate: event.candidate
                });
            }
        };
        
        // Manejar cierre de captura
        state.localStream.getVideoTracks()[0].onended = () => {
            stopBroadcast();
        };
        
        log(`📡 Transmitiendo en sala: ${roomName}`);
        showNotification('Transmisión iniciada', 'success');
        
    } catch (error) {
        log(`❌ Error: ${error.message}`);
        showNotification('Error al iniciar transmisión', 'error');
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
    
    if (elements.localVideo) elements.localVideo.srcObject = null;
    if (elements.localOverlay) elements.localOverlay.style.display = 'flex';
    
    resetUI();
    log('⏹️ Transmisión detenida');
    showNotification('Transmisión detenida', 'info');
}

// ============================================
// FUNCIONES DE VISUALIZACIÓN
// ============================================
function joinAsViewer() {
    const roomName = elements.viewRoomId?.value.trim();
    if (!roomName) {
        alert('Por favor, ingresa un nombre para la sala');
        return;
    }
    
    state.currentRoom = roomName;
    
    if (elements.joinBtn) elements.joinBtn.disabled = true;
    if (elements.leaveBtn) elements.leaveBtn.disabled = false;
    if (elements.startBtn) elements.startBtn.disabled = true;
    
    if (elements.remoteOverlay) {
        elements.remoteOverlay.innerHTML = '<span>Conectando...</span>';
    }
    
    state.socket.emit('viewer-join', roomName);
    log(`👁️ Uniéndose a sala: ${roomName}`);
}

function leaveAsViewer() {
    if (state.peerConnection) {
        state.peerConnection.close();
        state.peerConnection = null;
    }
    
    if (elements.remoteVideo) elements.remoteVideo.srcObject = null;
    if (elements.remoteOverlay) {
        elements.remoteOverlay.style.display = 'flex';
        elements.remoteOverlay.innerHTML = '<span>Esperando transmisión...</span>';
    }
    
    resetUI();
    log('👋 Desconectado de la transmisión');
}

// ============================================
// FUNCIONES WEBRTC
// ============================================
async function handleOffer(data) {
    log(`📤 Oferta recibida de ${data.from}`);
    
    if (!state.peerConnection) {
        state.peerConnection = new RTCPeerConnection(configuration);
        
        state.peerConnection.ontrack = (event) => {
            log('📥 Track remoto recibido');
            if (elements.remoteVideo) {
                elements.remoteVideo.srcObject = event.streams[0];
            }
        };
        
        state.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                state.socket.emit('ice-candidate', {
                    target: data.from,
                    candidate: event.candidate
                });
            }
        };
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
        log(`❌ Error: ${error.message}`);
    }
}

async function handleAnswer(data) {
    log(`📥 Respuesta recibida de ${data.from}`);
    
    try {
        await state.peerConnection.setRemoteDescription(
            new RTCSessionDescription(data.answer)
        );
        log('✅ Conexión establecida');
    } catch (error) {
        log(`❌ Error: ${error.message}`);
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
        log(`❌ Error: ${error.message}`);
    }
}

// ============================================
// FUNCIÓN TOGGLE DEBUG (para el botón)
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
    log('🚀 Inicializando aplicación...');
    
    // Detectar dispositivo
    const deviceType = detectDevice();
    log(`📱 Dispositivo: ${deviceType}`);
    
    // Conectar al servidor
    connectToServer();
    
    // Event listeners
    if (elements.startBtn) elements.startBtn.addEventListener('click', startBroadcast);
    if (elements.stopBtn) elements.stopBtn.addEventListener('click', stopBroadcast);
    if (elements.joinBtn) elements.joinBtn.addEventListener('click', joinAsViewer);
    if (elements.leaveBtn) elements.leaveBtn.addEventListener('click', leaveAsViewer);
    
    // Generar nombre de sala aleatorio
    if (elements.roomId) {
        const randomSuffix = Math.random().toString(36).substring(7);
        elements.roomId.value = `sala-${randomSuffix}`;
    }
    
    log('✅ Aplicación lista');
}

// Iniciar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', init);