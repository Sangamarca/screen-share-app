// ============================================
// CLIENTE FINAL - CON MENSAJE VISIBLE EN VIEWER
// ============================================

console.log('🚀 Cliente final iniciando...');

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

log('🔧 Panel de diagnóstico activado');

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
    roleSelector: document.getElementById('roleSelector'),
    mainContent: document.getElementById('mainContent'),
    loginModal: document.getElementById('loginModal'),
    sessionInfo: document.getElementById('sessionInfo'),
    broadcastPanel: document.getElementById('broadcastPanel'),
    localVideoCard: document.getElementById('localVideoCard'),
    loginUsername: document.getElementById('loginUsername'),
    loginPassword: document.getElementById('loginPassword'),
    loginError: document.getElementById('loginError'),
    viewerCount: document.getElementById('viewerCount'),
    statusText: document.getElementById('statusText')
};

// Verificar elementos
for (const [key, el] of Object.entries(elements)) {
    if (!el) log(`⚠️ Elemento no encontrado: ${key}`);
}

// ============================================
// ESTADO
// ============================================
let socket = null;
let localStream = null;
let pc = null;
let isBroadcaster = false;
let currentRoom = null;
let isAuthenticated = false;
let selectedRole = null;

// ============================================
// CONFIGURACIÓN STUN
// ============================================
const servers = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// ============================================
// FUNCIONES DE UTILIDAD
// ============================================
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
// BROADCASTER (ADMIN)
// ============================================
function initBroadcaster() {
    log('🎥 Modo broadcaster activado');
    socket = io();
    
    socket.on('connect', () => {
        log('✅ Conectado al servidor');
        updateStatus('Conectado');
    });
    
    socket.on('viewer-joined', handleViewerJoined);
    socket.on('answer', handleAnswer);
    socket.on('ice-candidate', handleIceCandidate);
    socket.on('viewers-update', (data) => {
        if (elements.viewerCount) {
            elements.viewerCount.textContent = `${data.total} espectadores`;
        }
    });
}

async function startBroadcast() {
    try {
        const roomName = elements.roomId.value.trim() || 'sala1';
        log('📤 Solicitando captura de pantalla...');
        
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
        updateStatus(`📡 Transmitiendo`);
        
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
    updateStatus('⏹️ Transmisión detenida');
}

function handleViewerJoined(data) {
    const viewerId = data.viewerId;
    log(`👁️ Nuevo viewer conectado: ${viewerId}`);
    updateStatus(`👁️ Viewer conectado`);
    
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
            log('📤 Oferta enviada al viewer');
        })
        .catch(err => log(`❌ Error: ${err.message}`));
}

function handleAnswer(data) {
    log(`📥 Respuesta recibida de viewer ${data.from}`);
}

function handleIceCandidate(data) {
    log(`🧊 ICE candidate de ${data.from}`);
}

// ============================================
// VIEWER (ESPECTADOR) - CON MENSAJE VISIBLE
// ============================================
function initViewer() {
    log('👁️ Modo espectador activado');
    socket = io();
    
    socket.on('connect', () => {
        log('✅ Conectado al servidor');
        updateStatus('Conectado');
    });
    
    socket.on('room-joined', (data) => {
        log(`✅ Unido a sala: ${data.roomId}`);
        updateStatus(`Unido a ${data.roomId}`);
        
        // Mensaje visible de espera
        if (elements.remoteOverlay) {
            elements.remoteOverlay.innerHTML = '<span style="font-size:16px;">⏳ Esperando señal del transmisor...</span>';
            elements.remoteOverlay.style.display = 'flex';
            elements.remoteOverlay.style.backgroundColor = 'rgba(0,0,0,0.8)';
            elements.remoteOverlay.style.color = 'white';
            elements.remoteOverlay.style.fontSize = '16px';
            elements.remoteOverlay.style.cursor = 'default';
        }
    });
    
    socket.on('offer', handleOffer);
    socket.on('ice-candidate', handleIceCandidateViewer);
    socket.on('viewers-update', (data) => {
        if (elements.viewerCount) {
            elements.viewerCount.textContent = `${data.total} espectadores`;
        }
    });
}

function joinRoom() {
    const room = elements.viewRoomId.value.trim() || 'sala1';
    log(`👋 Uniéndose a sala: ${room}`);
    
    elements.joinBtn.disabled = true;
    elements.leaveBtn.disabled = false;
    
    if (elements.remoteOverlay) {
        elements.remoteOverlay.innerHTML = '<span style="font-size:16px;">⏳ Conectando al transmisor...</span>';
        elements.remoteOverlay.style.display = 'flex';
    }
    
    currentRoom = room;
    socket.emit('viewer-join', room);
    updateStatus(`Uniéndose a ${room}...`);
}

function leaveRoom() {
    if (pc) {
        pc.close();
        pc = null;
    }
    elements.remoteVideo.srcObject = null;
    if (elements.remoteOverlay) {
        elements.remoteOverlay.innerHTML = '<span style="font-size:16px;">📺 Esperando transmisión...</span>';
        elements.remoteOverlay.style.display = 'flex';
    }
    elements.joinBtn.disabled = false;
    elements.leaveBtn.disabled = true;
    log('👋 Desconectado');
    updateStatus('Desconectado');
}

async function handleOffer(data) {
    log('📥 OFERTA RECIBIDA!');
    
    pc = new RTCPeerConnection(servers);
    
    pc.ontrack = (event) => {
        log('🎥 VIDEO RECIBIDO!');
        elements.remoteVideo.srcObject = event.streams[0];
        
        // MOSTRAR MENSAJE CLARAMENTE
        if (elements.remoteOverlay) {
            elements.remoteOverlay.innerHTML = '<span style="font-size:20px; font-weight:bold; color:#00ff00;">👉 TOCA AQUÍ PARA VER EL VIDEO 👈</span>';
            elements.remoteOverlay.style.display = 'flex';
            elements.remoteOverlay.style.backgroundColor = 'rgba(0,0,0,0.9)';
            elements.remoteOverlay.style.color = '#00ff00';
            elements.remoteOverlay.style.fontSize = '20px';
            elements.remoteOverlay.style.cursor = 'pointer';
            elements.remoteOverlay.style.zIndex = '1000';
        }
        
        updateStatus('✅ Video listo - toca la pantalla');
        
        // REPRODUCIR AL HACER CLIC EN EL OVERLAY
        const playVideo = () => {
            elements.remoteVideo.play()
                .then(() => {
                    if (elements.remoteOverlay) {
                        elements.remoteOverlay.style.display = 'none';
                    }
                    log('✅ Video reproduciéndose');
                    updateStatus('✅ Video reproduciéndose');
                })
                .catch(e => {
                    log(`❌ Error: ${e.message}`);
                    updateStatus('❌ Error al reproducir');
                });
        };
        
        // Click en overlay
        if (elements.remoteOverlay) {
            elements.remoteOverlay.addEventListener('click', playVideo, { once: true });
        }
        
        // Click en video (por si acaso)
        elements.remoteVideo.addEventListener('click', playVideo, { once: true });
        
        // Auto-intento después de 1 segundo (por si el navegador lo permite)
        setTimeout(() => {
            elements.remoteVideo.play()
                .then(() => {
                    if (elements.remoteOverlay) {
                        elements.remoteOverlay.style.display = 'none';
                    }
                    log('✅ Auto-play exitoso');
                })
                .catch(() => {
                    // Ignorar, ya tenemos el mensaje
                });
        }, 1000);
    };
    
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('ice-candidate', {
                target: data.from,
                candidate: event.candidate
            });
        }
    };
    
    pc.oniceconnectionstatechange = () => {
        log(`🧊 ICE state: ${pc.iceConnectionState}`);
        if (pc.iceConnectionState === 'connected') {
            updateStatus('✅ Conexión establecida');
        }
    };
    
    try {
        await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
        log('✅ Remote description set');
        
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        log('✅ Answer creada');
        
        socket.emit('answer', {
            target: data.from,
            answer: answer
        });
        log('📤 Respuesta enviada');
        
    } catch (err) {
        log(`❌ Error: ${err.message}`);
    }
}

function handleIceCandidateViewer(data) {
    if (pc) {
        pc.addIceCandidate(new RTCIceCandidate(data.candidate))
            .then(() => log('🧊 ICE agregado'))
            .catch(err => log(`❌ Error ICE: ${err.message}`));
    }
}

// ============================================
// PANTALLA COMPLETA
// ============================================
window.toggleFullscreen = function() {
    if (!elements.remoteVideo) return;
    
    if (!document.fullscreenElement) {
        if (elements.remoteVideo.requestFullscreen) {
            elements.remoteVideo.requestFullscreen();
        } else if (elements.remoteVideo.webkitRequestFullscreen) {
            elements.remoteVideo.webkitRequestFullscreen();
        }
        log('⛶ Pantalla completa activada');
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        }
        log('⛶ Saliendo de pantalla completa');
    }
};

// ============================================
// EVENT LISTENERS
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    log('✅ DOM cargado, configurando eventos...');
    
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