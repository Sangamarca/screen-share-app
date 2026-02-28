// ============================================
// VERSIÓN DEFINITIVA - CON ELEMENTS GLOBAL
// ============================================

console.log('🚀 Iniciando cliente...');

// ============================================
// 1. PRIMERO: DEFINIR ELEMENTS (LO MÁS IMPORTANTE)
// ============================================
const elements = {};

// Función para inicializar elements después del DOM
function initializeElements() {
    console.log('📦 Inicializando elementos del DOM...');
    
    elements.localVideo = document.getElementById('localVideo');
    elements.remoteVideo = document.getElementById('remoteVideo');
    elements.statusText = document.getElementById('statusText');
    elements.connectionStatus = document.getElementById('connectionStatus');
    elements.deviceInfo = document.getElementById('deviceInfo');
    elements.localDeviceBadge = document.getElementById('localDeviceBadge');
    elements.remoteDeviceBadge = document.getElementById('remoteDeviceBadge');
    elements.viewerCount = document.getElementById('viewerCount');
    elements.startBtn = document.getElementById('startBtn');
    elements.stopBtn = document.getElementById('stopBtn');
    elements.joinBtn = document.getElementById('joinBtn');
    elements.leaveBtn = document.getElementById('leaveBtn');
    elements.roomId = document.getElementById('roomId');
    elements.viewRoomId = document.getElementById('viewRoomId');
    elements.localOverlay = document.getElementById('localOverlay');
    elements.remoteOverlay = document.getElementById('remoteOverlay');
    elements.connectionLog = document.getElementById('connectionLog');
    elements.debugContent = document.getElementById('debugContent');
    
    // Verificar elementos críticos
    const required = ['startBtn', 'stopBtn', 'joinBtn', 'leaveBtn'];
    const missing = required.filter(id => !elements[id]);
    
    if (missing.length > 0) {
        console.warn('⚠️ Elementos faltantes:', missing);
    } else {
        console.log('✅ Todos los elementos cargados');
    }
}

// ============================================
// 2. ESTADO DE LA APLICACIÓN
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
// 3. CONFIGURACIÓN WEBRTC
// ============================================
const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// ============================================
// 4. FUNCIONES DE UTILIDAD
// ============================================
function log(message) {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`[${timestamp}] ${message}`);
    
    if (elements.connectionLog) {
        const entry = document.createElement('div');
        entry.textContent = `[${timestamp}] ${message}`;
        elements.connectionLog.appendChild(entry);
        elements.connectionLog.scrollTop = elements.connectionLog.scrollHeight;
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
    
    if (elements.statusText) {
        elements.statusText.textContent = message || (connected ? 'Conectado' : 'Desconectado');
    }
}

function showNotification(message, type = 'info') {
    console.log(`🔔 [${type}] ${message}`);
    
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
// 5. DETECCIÓN DE DISPOSITIVO (AHORA USA ELEMENTS)
// ============================================
function detectDevice() {
    const ua = navigator.userAgent.toLowerCase();
    let type = 'pc';
    
    if (ua.includes('tv') || ua.includes('smart-tv')) type = 'tv';
    else if (ua.includes('tablet') || ua.includes('ipad')) type = 'tablet';
    else if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) type = 'mobile';
    
    // AHORA elements YA EXISTE cuando se llama esta función
    if (elements.deviceInfo) {
        elements.deviceInfo.innerHTML = `<span>📱 ${type.toUpperCase()}</span>`;
    }
    
    return type;
}

// ============================================
// 6. FUNCIONES WEBRTC
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
        log(`❌ Error en handleOffer: ${error.message}`);
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
        log(`❌ Error en handleAnswer: ${error.message}`);
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
        log(`❌ Error en handleIceCandidate: ${error.message}`);
    }
}

// ============================================
// 7. FUNCIONES DE TRANSMISIÓN
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
        
        state.localStream.getVideoTracks()[0].onended = () => {
            stopBroadcast();
        };
        
        log(`📡 Transmitiendo en sala: ${roomName}`);
        showNotification('Transmisión iniciada', 'success');
        
    } catch (error) {
        log(`❌ Error en startBroadcast: ${error.message}`);
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
// 8. CONEXIÓN AL SERVIDOR
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
        log(`❌ Error de sala: ${error.message || error}`);
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
    
    state.socket.on('offer', handleOffer);
    state.socket.on('answer', handleAnswer);
    state.socket.on('ice-candidate', handleIceCandidate);
}

// ============================================
// 9. FUNCIÓN TOGGLE DEBUG
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
// 10. INICIALIZACIÓN (ORDEN CORRECTO)
// ============================================
function init() {
    console.log('🚀 Inicializando aplicación...');
    
    // PASO 1: Inicializar elements
    initializeElements();
    
    // PASO 2: Detectar dispositivo (AHORA elements existe)
    const deviceType = detectDevice();
    log(`📱 Dispositivo detectado: ${deviceType}`);
    
    // PASO 3: Conectar al servidor
    connectToServer();
    
    // PASO 4: Configurar event listeners
    if (elements.startBtn) elements.startBtn.addEventListener('click', startBroadcast);
    if (elements.stopBtn) elements.stopBtn.addEventListener('click', stopBroadcast);
    if (elements.joinBtn) elements.joinBtn.addEventListener('click', joinAsViewer);
    if (elements.leaveBtn) elements.leaveBtn.addEventListener('click', leaveAsViewer);
    
    // PASO 5: Generar nombre de sala aleatorio
    if (elements.roomId) {
        const randomSuffix = Math.random().toString(36).substring(7);
        elements.roomId.value = `sala-${randomSuffix}`;
    }
    
    log('✅ Aplicación lista');
}

// ============================================
// 11. INICIAR CUANDO EL DOM ESTÉ LISTO
// ============================================
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    // DOM ya está cargado
    init();
}