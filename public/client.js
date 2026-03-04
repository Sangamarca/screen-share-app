// ============================================
// CLIENTE SIMPLIFICADO - FUNCIONA CON MÚLTIPLES VIEWERS
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
    remoteOverlay: document.getElementById('remoteOverlay')
};

// Estado
let socket = null;
let localStream = null;
let pc = null;
let isBroadcaster = false;
let currentRoom = null;
let isAuthenticated = false;

// Configuración STUN
const servers = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// Login (simplificado - solo para pruebas)
window.login = function() {
    isAuthenticated = true;
    document.getElementById('loginModal').style.display = 'none';
    document.getElementById('roleSelector').style.display = 'none';
    document.getElementById('mainContent').style.display = 'block';
    document.getElementById('broadcastPanel').style.display = 'block';
    document.getElementById('localVideoCard').style.display = 'block';
    initBroadcaster();
    log('✅ Login exitoso');
};

window.selectRole = function(role) {
    if (role === 'admin') {
        document.getElementById('loginModal').style.display = 'flex';
    } else {
        document.getElementById('roleSelector').style.display = 'none';
        document.getElementById('mainContent').style.display = 'block';
        initViewer();
    }
};

// Iniciar broadcaster
function initBroadcaster() {
    log('🎥 Modo broadcaster');
    socket = io();
    
    socket.on('connect', () => log('✅ Conectado'));
    socket.on('viewer-joined', handleViewerJoined);
}

async function startBroadcast() {
    try {
        log('📤 Solicitando pantalla...');
        localStream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: true
        });
        
        elements.localVideo.srcObject = localStream;
        elements.localOverlay.style.display = 'none';
        
        isBroadcaster = true;
        currentRoom = elements.roomId.value || 'sala1';
        
        elements.startBtn.disabled = true;
        elements.stopBtn.disabled = false;
        
        socket.emit('broadcaster-join', currentRoom);
        log(`📡 Transmitiendo en ${currentRoom}`);
        
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

// Manejar nuevos viewers
function handleViewerJoined(data) {
    const viewerId = data.viewerId;
    log(`👁️ Nuevo viewer: ${viewerId}`);
    
    if (!localStream) {
        log('❌ No hay stream');
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
        });
}

// Iniciar viewer
function initViewer() {
    log('👁️ Modo viewer');
    socket = io();
    
    socket.on('connect', () => log('✅ Conectado'));
    socket.on('room-joined', (data) => {
        log(`✅ Unido a sala: ${data.roomId}`);
        elements.remoteOverlay.style.display = 'none';
    });
    socket.on('offer', handleOffer);
    socket.on('ice-candidate', handleIceCandidate);
}

function joinRoom() {
    const room = elements.viewRoomId.value || 'sala1';
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
        elements.remoteVideo.play();
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

function handleIceCandidate(data) {
    if (pc) {
        pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        log('🧊 ICE agregado');
    }
}

// Eventos
document.addEventListener('DOMContentLoaded', () => {
    elements.startBtn.addEventListener('click', startBroadcast);
    elements.stopBtn.addEventListener('click', stopBroadcast);
    elements.joinBtn.addEventListener('click', joinRoom);
    elements.leaveBtn.addEventListener('click', leaveRoom);
    
    log('✅ Listo');
});