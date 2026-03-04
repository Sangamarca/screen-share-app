// ============================================
// CLIENTE SIMPLIFICADO - CON LOGIN FUNCIONAL
// ============================================

console.log('🚀 Cliente simplificado iniciando...');

// Panel de diagnóstico simple
const panel = document.createElement('div');
panel.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    background: black;
    color: lime;
    padding: 5px;
    font-family: monospace;
    font-size: 11px;
    z-index: 10000;
    max-height: 150px;
    overflow-y: auto;
`;
document.body.appendChild(panel);

function log(msg) {
    const time = new Date().toLocaleTimeString();
    console.log(msg);
    panel.innerHTML += `<div>[${time}] ${msg}</div>`;
    panel.scrollTop = panel.scrollHeight;
    if (panel.children.length > 10) {
        panel.removeChild(panel.firstChild);
    }
}

log('🔧 Iniciando...');

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
    roleSelector: document.getElementById('roleSelector'),
    mainContent: document.getElementById('mainContent'),
    loginModal: document.getElementById('loginModal'),
    sessionInfo: document.getElementById('sessionInfo'),
    broadcastPanel: document.getElementById('broadcastPanel'),
    localVideoCard: document.getElementById('localVideoCard'),
    loginUsername: document.getElementById('loginUsername'),
    loginPassword: document.getElementById('loginPassword'),
    loginError: document.getElementById('loginError')
};

// Estado
let socket = null;
let localStream = null;
let pc = null;
let isBroadcaster = false;
let currentRoom = null;
let isAuthenticated = false;
let selectedRole = null;

// Configuración STUN
const servers = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// ============================================
// SELECCIÓN DE ROL
// ============================================
window.selectRole = function(role) {
    log(`🎯 Rol seleccionado: ${role}`);
    selectedRole = role;
    
    if (role === 'admin') {
        elements.loginModal.style.display = 'flex';
        setTimeout(() => elements.loginUsername.focus(), 100);
    } else {
        elements.roleSelector.style.display = 'none';
        elements.mainContent.style.display = 'block';
        initViewer();
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
    
    log('🔐 Intentando login...');
    
    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (data.success) {
            log('✅ Login exitoso');
            isAuthenticated = true;
            elements.loginModal.style.display = 'none';
            elements.roleSelector.style.display = 'none';
            elements.mainContent.style.display = 'block';
            
            elements.broadcastPanel.style.display = 'block';
            elements.localVideoCard.style.display = 'block';
            elements.sessionInfo.style.display = 'flex';
            
            elements.startBtn.disabled = false;
            
            initBroadcaster();
        } else {
            log('❌ Login fallido');
            showLoginError(data.error || 'Credenciales inválidas');
        }
    } catch (err) {
        log(`❌ Error: ${err.message}`);
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
        
        if (isBroadcaster) {
            stopBroadcast();
        }
        
        elements.sessionInfo.style.display = 'none';
        elements.broadcastPanel.style.display = 'none';
        elements.localVideoCard.style.display = 'none';
        elements.mainContent.style.display = 'none';
        elements.roleSelector.style.display = 'block';
        
        elements.loginUsername.value = '';
        elements.loginPassword.value = '';
        
        if (socket) {
            socket.disconnect();
            socket = null;
        }
        
        log('👋 Sesión cerrada');
    } catch (err) {
        console.error(err);
    }
};

// ============================================
// BROADCASTER
// ============================================
function initBroadcaster() {
    log('🎥 Modo broadcaster');
    socket = io();
    
    socket.on('connect', () => log('✅ Conectado al servidor'));
    socket.on('viewer-joined', handleViewerJoined);
    socket.on('answer', handleAnswer);
    socket.on('ice-candidate', handleIceCandidate);
}

async function startBroadcast() {
    try {
        const roomName = elements.roomId.value.trim() || 'sala1';
        log('📤 Solicitando pantalla...');
        
        localStream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
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
        
    } catch (err) {
        log(`❌ Error: ${err.message}`);
    }
}

function stopBroadcast() {
    if (localStream) {
        localStream.getTracks().forEach(t => t.stop());
        localStream = null;
    }
    if (pc) {
        pc.close();
        pc = null;
    }
    elements.localVideo.srcObject = null;
    elements.localOverlay.style.display = 'flex';
    elements.startBtn.disabled = false;
    elements.stopBtn.disabled = true;
    isBroadcaster = false;
    log('⏹️ Transmisión detenida');
}

function handleViewerJoined(data) {
    const viewerId = data.viewerId;
    log(`👁️ Nuevo viewer: ${viewerId}`);
    
    if (!localStream) {
        log('❌ No hay stream local');
        return;
    }
    
    log('🔄 Creando conexión para viewer');
    const pc = new RTCPeerConnection(servers);
    
    localStream.getTracks().forEach(track => {
        pc.addTrack(track, localStream);
        log(`➕ Track ${track.kind} añadido`);
    });
    
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('ice-candidate', {
                target: viewerId,
                candidate: event.candidate
            });
        }
    };
    
    pc.createOffer()
        .then(offer => pc.setLocalDescription(offer))
        .then(() => {
            socket.emit('offer', {
                target: viewerId,
                offer: pc.localDescription
            });
            log('📤 Oferta enviada');
        })
        .catch(err => log(`❌ Error: ${err.message}`));
}

function handleAnswer(data) {
    log(`📥 Respuesta recibida de ${data.from}`);
    // Aquí iría la lógica para manejar la respuesta
}

function handleIceCandidate(data) {
    log(`🧊 ICE candidate de ${data.from}`);
    // Aquí iría la lógica para manejar ICE
}

// ============================================
// VIEWER
// ============================================
function initViewer() {
    log('👁️ Modo viewer');
    socket = io();
    
    socket.on('connect', () => log('✅ Conectado al servidor'));
    socket.on('room-joined', (data) => {
        log(`✅ Unido a sala: ${data.roomId}`);
        elements.remoteOverlay.style.display = 'none';
    });
    socket.on('offer', handleOffer);
    socket.on('ice-candidate', handleIceCandidateViewer);
}

function joinRoom() {
    const room = elements.viewRoomId.value.trim() || 'sala1';
    log(`👋 Uniéndose a ${room}`);
    elements.joinBtn.disabled = true;
    elements.leaveBtn.disabled = false;
    currentRoom = room;
    socket.emit('viewer-join', room);
}

function leaveRoom() {
    if (pc) {
        pc.close();
        pc = null;
    }
    elements.remoteVideo.srcObject = null;
    elements.remoteOverlay.style.display = 'flex';
    elements.joinBtn.disabled = false;
    elements.leaveBtn.disabled = true;
    log('👋 Desconectado');
}

async function handleOffer(data) {
    log('📥 Oferta recibida');
    
    pc = new RTCPeerConnection(servers);
    
    pc.ontrack = (event) => {
        log('🎥 VIDEO RECIBIDO!');
        elements.remoteVideo.srcObject = event.streams[0];
        elements.remoteVideo.play()
            .then(() => log('✅ Video reproduciéndose'))
            .catch(e => log(`❌ Error play: ${e.message}`));
        elements.remoteOverlay.style.display = 'none';
    };
    
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('ice-candidate', {
                target: data.from,
                candidate: event.candidate
            });
        }
    };
    
    await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    
    socket.emit('answer', {
        target: data.from,
        answer: answer
    });
    log('📤 Respuesta enviada');
}

function handleIceCandidateViewer(data) {
    if (pc) {
        pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        log('🧊 ICE agregado');
    }
}

// ============================================
// EVENT LISTENERS
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    elements.startBtn.addEventListener('click', startBroadcast);
    elements.stopBtn.addEventListener('click', stopBroadcast);
    elements.joinBtn.addEventListener('click', joinRoom);
    elements.leaveBtn.addEventListener('click', leaveRoom);
    
    elements.loginUsername.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') login();
    });
    
    elements.loginPassword.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') login();
    });
    
    log('✅ Eventos configurados');
});