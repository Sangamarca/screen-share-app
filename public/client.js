// ============================================
// CLIENTE CON SELECCIÓN DE ROL
// ============================================

console.log('🚀 Cliente iniciando...');

// ============================================
// ELEMENTOS DEL DOM
// ============================================
const elements = {
    roleSelector: document.getElementById('roleSelector'),
    mainContent: document.getElementById('mainContent'),
    loginModal: document.getElementById('loginModal'),
    sessionInfo: document.getElementById('sessionInfo'),
    broadcastPanel: document.getElementById('broadcastPanel'),
    localVideoCard: document.getElementById('localVideoCard'),
    
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
    viewerCount: document.getElementById('viewerCount'),
    loginError: document.getElementById('loginError'),
    loginUsername: document.getElementById('loginUsername'),
    loginPassword: document.getElementById('loginPassword')
};

// ============================================
// ESTADO
// ============================================
let socket = null;
let localStream = null;
let peerConnections = new Map();
let peerConnectionViewer = null;
let currentRoom = null;
let isBroadcaster = false;
let isViewer = false;
let selectedRole = null;
let isAuthenticated = false;

// ============================================
// CONFIGURACIÓN STUN
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
function log(msg) {
    console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);
}

function updateStatus(msg) {
    log(msg);
    if (elements.statusText) {
        elements.statusText.textContent = msg;
    }
}

// ============================================
// SELECCIÓN DE ROL
// ============================================
window.selectRole = function(role) {
    selectedRole = role;
    
    if (role === 'admin') {
        // Mostrar modal de login
        elements.loginModal.style.display = 'flex';
        setTimeout(() => elements.loginUsername.focus(), 100);
    } else {
        // Viewer: mostrar contenido directamente
        elements.roleSelector.style.display = 'none';
        elements.mainContent.style.display = 'block';
        initViewerMode();
    }
};

window.cancelLogin = function() {
    elements.loginModal.style.display = 'none';
    elements.loginUsername.value = '';
    elements.loginPassword.value = '';
    elements.loginError.style.display = 'none';
};

// ============================================
// LOGIN
// ============================================
window.login = async function() {
    const username = elements.loginUsername.value.trim();
    const password = elements.loginPassword.value.trim();
    
    if (!username || !password) {
        showLoginError('Ingresa usuario y contraseña');
        return;
    }
    
    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (data.success) {
            isAuthenticated = true;
            elements.loginModal.style.display = 'none';
            elements.roleSelector.style.display = 'none';
            elements.mainContent.style.display = 'block';
            
            // Mostrar panel de admin
            elements.broadcastPanel.style.display = 'block';
            elements.localVideoCard.style.display = 'block';
            elements.sessionInfo.style.display = 'flex';
            
            elements.startBtn.disabled = false;
            
            initBroadcasterMode();
        } else {
            showLoginError(data.error || 'Credenciales inválidas');
        }
    } catch (err) {
        showLoginError('Error de conexión');
    }
};

function showLoginError(msg) {
    elements.loginError.textContent = msg;
    elements.loginError.style.display = 'block';
}

window.logout = async function() {
    try {
        await fetch('/api/auth/logout', { method: 'POST' });
        isAuthenticated = false;
        
        // Detener transmisión si está activa
        if (isBroadcaster) {
            stopBroadcast();
        }
        
        // Volver al selector de rol
        elements.sessionInfo.style.display = 'none';
        elements.broadcastPanel.style.display = 'none';
        elements.localVideoCard.style.display = 'none';
        elements.mainContent.style.display = 'none';
        elements.roleSelector.style.display = 'block';
        
        elements.loginUsername.value = '';
        elements.loginPassword.value = '';
    } catch (err) {
        console.error('Error en logout:', err);
    }
};

// ============================================
// MODO BROADCASTER
// ============================================
function initBroadcasterMode() {
    log('🎥 Modo administrador activado');
    connectToServer();
}

async function startBroadcast() {
    try {
        const roomName = elements.roomId?.value.trim() || 'sala1';
        
        log('📤 Solicitando pantalla...');
        
        localStream = await navigator.mediaDevices.getDisplayMedia({
            video: { width: 854, height: 480, frameRate: 30 },
            audio: true
        });
        
        elements.localVideo.srcObject = localStream;
        elements.localOverlay.style.display = 'none';
        
        isBroadcaster = true;
        currentRoom = roomName;
        
        elements.startBtn.disabled = true;
        elements.stopBtn.disabled = false;
        
        socket.emit('broadcaster-join', roomName);
        log(`📡 Transmitiendo en ${roomName}`);
        
        localStream.getVideoTracks()[0].onended = () => stopBroadcast();
        
        updateStatus(`📡 Transmitiendo`);
        
    } catch (err) {
        log(`❌ Error: ${err.message}`);
    }
}

function stopBroadcast() {
    log('⏹️ Deteniendo...');
    
    if (localStream) {
        localStream.getTracks().forEach(t => t.stop());
        localStream = null;
    }
    
    if (currentRoom && isBroadcaster) {
        socket.emit('stop-broadcast', currentRoom);
    }
    
    elements.localVideo.srcObject = null;
    elements.localOverlay.style.display = 'flex';
    
    elements.startBtn.disabled = false;
    elements.stopBtn.disabled = true;
    
    isBroadcaster = false;
    updateStatus('Transmisión detenida');
}

// ============================================
// MODO VIEWER
// ============================================
function initViewerMode() {
    log('👁️ Modo espectador activado');
    connectToServer();
}

function joinRoom() {
    const roomName = elements.viewRoomId?.value.trim() || 'sala1';
    
    log(`👋 Uniéndose a ${roomName}...`);
    
    elements.joinBtn.disabled = true;
    elements.leaveBtn.disabled = false;
    elements.remoteOverlay.innerHTML = '<span>⏳ Conectando...</span>';
    
    currentRoom = roomName;
    socket.emit('viewer-join', roomName);
    updateStatus(`Uniéndose a ${roomName}...`);
}

function leaveRoom() {
    log('👋 Saliendo...');
    
    if (peerConnectionViewer) {
        peerConnectionViewer.close();
        peerConnectionViewer = null;
    }
    
    elements.remoteVideo.srcObject = null;
    elements.remoteOverlay.style.display = 'flex';
    elements.remoteOverlay.innerHTML = '<span>Esperando transmisión...</span>';
    
    elements.joinBtn.disabled = false;
    elements.leaveBtn.disabled = true;
    
    currentRoom = null;
    updateStatus('Desconectado');
}

// ============================================
// CONEXIÓN AL SERVIDOR
// ============================================
function connectToServer() {
    log('Conectando al servidor...');
    
    socket = io();
    
    socket.on('connect', () => {
        log('✅ Conectado al servidor');
        updateStatus('Conectado');
    });
    
    socket.on('disconnect', () => {
        log('❌ Desconectado');
        updateStatus('Desconectado');
    });
    
    socket.on('broadcaster-ready', () => {
        log('📡 Listo para transmitir');
    });
    
    socket.on('room-joined', (data) => {
        log(`✅ Unido a sala: ${data.roomId}`);
        elements.remoteOverlay.style.display = 'none';
        updateStatus(`Unido a ${data.roomId}`);
    });
    
    socket.on('room-error', (error) => {
        log(`❌ Error: ${error}`);
        if (selectedRole === 'viewer') {
            elements.joinBtn.disabled = false;
            elements.leaveBtn.disabled = true;
        }
    });
    
    socket.on('broadcaster-disconnected', () => {
        log('📡 Transmisor desconectado');
        elements.remoteVideo.srcObject = null;
        elements.remoteOverlay.style.display = 'flex';
        if (selectedRole === 'viewer') {
            elements.joinBtn.disabled = false;
            elements.leaveBtn.disabled = true;
        }
    });
    
    socket.on('viewers-update', (data) => {
        log(`👥 Viewers: ${data.total}`);
        if (elements.viewerCount) {
            elements.viewerCount.textContent = `${data.total} espectadores`;
        }
    });
    
    socket.on('offer', handleOffer);
    socket.on('answer', handleAnswer);
    socket.on('ice-candidate', handleIceCandidate);
}

// ============================================
// WEBRTC HANDLERS
// ============================================
async function handleOffer(data) {
    log('📥 Oferta recibida');
    
    if (selectedRole !== 'viewer') return;
    
    try {
        if (!peerConnectionViewer) {
            peerConnectionViewer = new RTCPeerConnection(configuration);
            
            peerConnectionViewer.ontrack = (event) => {
                log('🎥 Video recibido');
                elements.remoteVideo.srcObject = event.streams[0];
                elements.remoteOverlay.style.display = 'none';
                elements.remoteVideo.play();
                updateStatus('✅ Video recibido');
            };
            
            peerConnectionViewer.onicecandidate = (event) => {
                if (event.candidate) {
                    socket.emit('ice-candidate', {
                        target: data.from,
                        candidate: event.candidate
                    });
                }
            };
        }
        
        await peerConnectionViewer.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await peerConnectionViewer.createAnswer();
        await peerConnectionViewer.setLocalDescription(answer);
        
        socket.emit('answer', { target: data.from, answer });
        
    } catch (err) {
        log(`❌ Error: ${err.message}`);
    }
}

async function handleAnswer(data) {
    // Solo broadcaster maneja esto
}

async function handleIceCandidate(data) {
    try {
        if (selectedRole === 'viewer' && peerConnectionViewer) {
            await peerConnectionViewer.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
    } catch (err) {
        log(`❌ Error ICE: ${err.message}`);
    }
}

// ============================================
// PANTALLA COMPLETA
// ============================================
window.toggleFullscreen = function() {
    const video = elements.remoteVideo;
    
    if (!document.fullscreenElement) {
        if (video.requestFullscreen) {
            video.requestFullscreen();
        } else if (video.webkitRequestFullscreen) {
            video.webkitRequestFullscreen();
        } else if (video.msRequestFullscreen) {
            video.msRequestFullscreen();
        }
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        } else if (document.msExitFullscreen) {
            document.msExitFullscreen();
        }
    }
};

// ============================================
// EVENT LISTENERS
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    elements.startBtn.addEventListener('click', startBroadcast);
    elements.stopBtn.addEventListener('click', stopBroadcast);
    elements.joinBtn.addEventListener('click', joinRoom);
    elements.leaveBtn.addEventListener('click', leaveRoom);
    
    // Enter en inputs de login
    elements.loginUsername.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') login();
    });
    
    elements.loginPassword.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') login();
    });
    
    log('✅ Inicialización completa');
});