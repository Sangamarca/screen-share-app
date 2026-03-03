// ============================================
// CLIENTE CON SELECCIÓN DE ROL - VERSIÓN CORREGIDA
// ============================================

console.log('🚀 Cliente iniciando...');

// Panel de diagnóstico (siempre visible)
const diagnosticPanel = document.createElement('div');
diagnosticPanel.id = 'diagnosticPanel';
diagnosticPanel.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    background: black;
    color: #00ff00;
    font-family: monospace;
    font-size: 12px;
    padding: 10px;
    z-index: 20001;
    max-height: 200px;
    overflow-y: auto;
    border-bottom: 3px solid #ff0000;
`;
document.body.appendChild(diagnosticPanel);

function log(msg, type = 'INFO') {
    const time = new Date().toLocaleTimeString();
    const logMsg = `[${time}] [${type}] ${msg}`;
    console.log(logMsg);
    
    const line = document.createElement('div');
    line.textContent = logMsg;
    diagnosticPanel.appendChild(line);
    diagnosticPanel.scrollTop = diagnosticPanel.scrollHeight;
    while (diagnosticPanel.children.length > 15) {
        diagnosticPanel.removeChild(diagnosticPanel.firstChild);
    }
}

log('🔧 Panel de diagnóstico activado');

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

// Verificar elementos
for (const [key, el] of Object.entries(elements)) {
    if (!el) log(`⚠️ Elemento no encontrado: ${key}`, 'WARN');
}

// ============================================
// DETECCIÓN DE DISPOSITIVO
// ============================================
function detectDevice() {
    const ua = navigator.userAgent.toLowerCase();
    const isMobile = /mobile|android|iphone|ipad|ipod|blackberry|windows phone/i.test(ua);
    const isTablet = /tablet|ipad/i.test(ua);
    const isPC = !isMobile && !isTablet;
    
    log(`📱 Dispositivo: ${isMobile ? 'MÓVIL' : isTablet ? 'TABLET' : 'PC'}`, 'INFO');
    
    return { isMobile, isTablet, isPC };
}

const device = detectDevice();

// ============================================
// ESTADO
// ============================================
let socket = null;
let localStream = null;
let peerConnections = new Map(); // Para broadcaster: viewerId -> RTCPeerConnection
let peerConnectionViewer = null;  // Para viewer: única conexión al broadcaster
let currentRoom = null;
let isBroadcaster = false;
let isViewer = false;
let selectedRole = null;
let isAuthenticated = false;

// ============================================
// CONFIGURACIÓN SOLO STUN (SIN TURN PARA EVITAR ERRORES)
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
        { urls: 'stun:stun.schlund.de' }
    ],
    iceCandidatePoolSize: 10,
    iceTransportPolicy: 'all'
};

// ============================================
// FUNCIONES DE UTILIDAD
// ============================================
function updateStatus(msg) {
    log(msg, 'STATUS');
    if (elements.statusText) {
        elements.statusText.textContent = msg;
    }
}

// ============================================
// SELECCIÓN DE ROL
// ============================================
window.selectRole = function(role) {
    log(`🎯 Rol seleccionado: ${role}`, 'INFO');
    selectedRole = role;
    
    if (role === 'admin') {
        elements.loginModal.style.display = 'flex';
        setTimeout(() => elements.loginUsername.focus(), 100);
    } else {
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
    
    log('🔐 Intentando login...', 'INFO');
    
    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (data.success) {
            log('✅ Login exitoso', 'SUCCESS');
            isAuthenticated = true;
            elements.loginModal.style.display = 'none';
            elements.roleSelector.style.display = 'none';
            elements.mainContent.style.display = 'block';
            
            elements.broadcastPanel.style.display = 'block';
            elements.localVideoCard.style.display = 'block';
            elements.sessionInfo.style.display = 'flex';
            
            elements.startBtn.disabled = false;
            
            initBroadcasterMode();
        } else {
            log('❌ Login fallido', 'ERROR');
            showLoginError(data.error || 'Credenciales inválidas');
        }
    } catch (err) {
        log(`❌ Error de conexión: ${err.message}`, 'ERROR');
        showLoginError('Error de conexión');
    }
};

function showLoginError(msg) {
    elements.loginError.textContent = msg;
    elements.loginError.style.display = 'block';
}

window.logout = async function() {
    log('👋 Cerrando sesión...', 'INFO');
    try {
        await fetch('/api/auth/logout', { method: 'POST' });
        isAuthenticated = false;
        
        if (isBroadcaster) {
            stopBroadcast();
        }
        
        for (const [id, pc] of peerConnections.entries()) {
            pc.close();
        }
        peerConnections.clear();
        
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
        
        log('✅ Sesión cerrada', 'INFO');
    } catch (err) {
        console.error('Error en logout:', err);
    }
};

// ============================================
// MODO BROADCASTER (ADMIN)
// ============================================
function initBroadcasterMode() {
    log('🎥 Modo administrador activado', 'SUCCESS');
    connectToServer();
}

async function startBroadcast() {
    try {
        const roomName = elements.roomId?.value.trim() || 'sala1';
        
        log('📤 Solicitando captura de pantalla...', 'BROADCASTER');
        
        localStream = await navigator.mediaDevices.getDisplayMedia({
            video: { 
                width: { ideal: 854, max: 1024 },
                height: { ideal: 480, max: 576 },
                frameRate: { ideal: 30, max: 30 }
            },
            audio: true
        });
        
        log('✅ Captura obtenida', 'SUCCESS');
        
        elements.localVideo.srcObject = localStream;
        elements.localOverlay.style.display = 'none';
        
        isBroadcaster = true;
        currentRoom = roomName;
        
        elements.startBtn.disabled = true;
        elements.stopBtn.disabled = false;
        
        socket.emit('broadcaster-join', roomName);
        log(`📡 Transmitiendo en ${roomName}`, 'BROADCASTER');
        
        localStream.getVideoTracks()[0].onended = () => {
            log('⏹️ Captura cerrada por el usuario', 'WARN');
            stopBroadcast();
        };
        
        updateStatus(`📡 Transmitiendo`);
        
    } catch (err) {
        log(`❌ Error: ${err.message}`, 'ERROR');
    }
}

function stopBroadcast() {
    log('⏹️ Deteniendo transmisión...', 'BROADCASTER');
    
    for (const [id, pc] of peerConnections.entries()) {
        pc.close();
        log(`🧹 Conexión con viewer ${id} cerrada`, 'INFO');
    }
    peerConnections.clear();
    
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
    updateStatus('⏹️ Transmisión detenida');
}

// ============================================
// MODO VIEWER (ESPECTADOR)
// ============================================
function initViewerMode() {
    log('👁️ Modo espectador activado', 'SUCCESS');
    connectToServer();
}

function joinRoom() {
    const roomName = elements.viewRoomId?.value.trim() || 'sala1';
    
    log(`👋 Uniéndose a sala: ${roomName}`, 'VIEWER');
    log(`💻 Dispositivo: ${device.isPC ? 'PC' : 'MÓVIL'}`, 'INFO');
    
    elements.joinBtn.disabled = true;
    elements.leaveBtn.disabled = false;
    elements.remoteOverlay.innerHTML = '<span>⏳ Conectando al transmisor...</span>';
    
    currentRoom = roomName;
    
    if (!socket || !socket.connected) {
        log('⚠️ Socket no conectado, reconectando...', 'WARN');
        connectToServer();
        setTimeout(() => {
            log('📡 Emitiendo viewer-join después de reconexión', 'INFO');
            socket.emit('viewer-join', roomName);
        }, 1500);
    } else {
        log('📡 Emitiendo viewer-join directamente', 'INFO');
        socket.emit('viewer-join', roomName);
    }
    
    updateStatus(`Uniéndose a ${roomName}...`);
}

function leaveRoom() {
    log('👋 Saliendo de la sala...', 'VIEWER');
    
    if (peerConnectionViewer) {
        peerConnectionViewer.close();
        peerConnectionViewer = null;
    }
    
    if (elements.remoteVideo) {
        elements.remoteVideo.srcObject = null;
    }
    if (elements.remoteOverlay) {
        elements.remoteOverlay.style.display = 'flex';
        elements.remoteOverlay.innerHTML = '<span>📺 Esperando transmisión...</span>';
    }
    
    elements.joinBtn.disabled = false;
    elements.leaveBtn.disabled = true;
    
    currentRoom = null;
    updateStatus('Desconectado');
}

// ============================================
// CONEXIÓN AL SERVIDOR
// ============================================
function connectToServer() {
    if (socket) {
        log('🔄 Socket ya existente, reconectando...', 'INFO');
        socket.disconnect();
    }
    
    log('📡 Conectando al servidor...', 'INFO');
    
    socket = io({
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000
    });
    
    socket.on('connect', () => {
        log('✅ Conectado al servidor', 'SUCCESS');
        updateStatus('Conectado');
        
        if (selectedRole === 'viewer' && currentRoom) {
            log(`🔄 Reintentando unirse a ${currentRoom}...`, 'INFO');
            socket.emit('viewer-join', currentRoom);
        }
        
        if (selectedRole === 'admin' && isBroadcaster && currentRoom) {
            log(`🔄 Reanunciando como broadcaster en ${currentRoom}...`, 'INFO');
            socket.emit('broadcaster-join', currentRoom);
        }
    });
    
    socket.on('disconnect', (reason) => {
        log(`❌ Desconectado: ${reason}`, 'ERROR');
        updateStatus('Desconectado');
    });
    
    socket.on('connect_error', (err) => {
        log(`❌ Error conexión: ${err.message}`, 'ERROR');
    });
    
    socket.on('broadcaster-ready', () => {
        log('📡 Modo transmisor listo', 'SUCCESS');
    });
    
    socket.on('room-joined', (data) => {
        log(`✅ UNIDO A SALA: ${data.roomId}`, 'SUCCESS');
        updateStatus(`Unido a ${data.roomId}`);
        
        if (selectedRole === 'viewer') {
            elements.remoteOverlay.style.display = 'none';
            log('⏳ Esperando oferta del broadcaster...', 'INFO');
        }
    });
    
    socket.on('room-error', (error) => {
        log(`❌ Error de sala: ${error}`, 'ERROR');
        updateStatus(`Error: ${error}`);
        
        if (selectedRole === 'viewer') {
            elements.joinBtn.disabled = false;
            elements.leaveBtn.disabled = true;
            elements.remoteOverlay.innerHTML = '<span>❌ Sala no encontrada</span>';
        }
    });
    
    socket.on('broadcaster-disconnected', () => {
        log('📡 Transmisor desconectado', 'WARN');
        updateStatus('Transmisor desconectado');
        
        if (elements.remoteVideo) {
            elements.remoteVideo.srcObject = null;
        }
        if (elements.remoteOverlay) {
            elements.remoteOverlay.style.display = 'flex';
            elements.remoteOverlay.innerHTML = '<span>📡 Transmisor desconectado</span>';
        }
        
        if (selectedRole === 'viewer') {
            elements.joinBtn.disabled = false;
            elements.leaveBtn.disabled = true;
        }
    });
    
    socket.on('viewers-update', (data) => {
        log(`👥 Viewers: ${data.total}`, 'INFO');
        if (elements.viewerCount) {
            elements.viewerCount.textContent = `${data.total} espectadores`;
        }
    });
    
    // ============================================
    // EVENTO PARA BROADCASTER - CORREGIDO CON MÁS LOGS
    // ============================================
    socket.on('viewer-joined', (data) => {
        const viewerId = data.viewerId;
        log(`🔥 NUEVO VIEWER CONECTADO: ${viewerId}`, 'CRITICAL');
        log(`👥 Total viewers: ${data.totalViewers}`, 'INFO');
        
        if (!isBroadcaster) {
            log('❌ No soy broadcaster, ignorando', 'ERROR');
            return;
        }
        
        if (!localStream) {
            log('❌ No hay stream local, no puedo crear oferta', 'ERROR');
            return;
        }
        
        log(`🆕 Creando PeerConnection para viewer ${viewerId}`, 'INFO');
        
        try {
            const pc = new RTCPeerConnection(configuration);
            
            // Añadir tracks locales
            localStream.getTracks().forEach(track => {
                pc.addTrack(track, localStream);
                log(`➕ Track ${track.kind} añadido para ${viewerId}`, 'INFO');
            });
            
            // Manejar ICE candidates
            pc.onicecandidate = (event) => {
                if (event.candidate) {
                    log(`🧊 Enviando ICE candidate a ${viewerId}`, 'INFO');
                    socket.emit('ice-candidate', {
                        target: viewerId,
                        candidate: event.candidate
                    });
                }
            };
            
            pc.oniceconnectionstatechange = () => {
                log(`🧊 ICE state (${viewerId}): ${pc.iceConnectionState}`, 'INFO');
                if (pc.iceConnectionState === 'connected') {
                    log(`✅ Viewer ${viewerId} conectado vía ICE`, 'SUCCESS');
                }
                if (pc.iceConnectionState === 'failed') {
                    log(`❌ ICE failed para viewer ${viewerId}`, 'ERROR');
                }
            };
            
            // Guardar en el Map
            peerConnections.set(viewerId, pc);
            
            // Crear oferta para este viewer - CON MÁS LOGS
            log(`📤 Iniciando createOffer() para ${viewerId}...`, 'INFO');
            
            pc.createOffer()
                .then(offer => {
                    log(`✅ createOffer() exitoso para ${viewerId}`, 'SUCCESS');
                    log(`📄 Offer tipo: ${offer.type}, SDP length: ${offer.sdp.length}`, 'INFO');
                    return pc.setLocalDescription(offer);
                })
                .then(() => {
                    log(`✅ setLocalDescription() exitoso para ${viewerId}`, 'SUCCESS');
                    log(`📤 Enviando oferta a ${viewerId}...`, 'INFO');
                    
                    socket.emit('offer', {
                        target: viewerId,
                        offer: pc.localDescription
                    });
                    
                    log(`✅ Oferta enviada a ${viewerId}`, 'SUCCESS');
                })
                .catch(err => {
                    log(`❌ ERROR en createOffer/setLocalDescription para ${viewerId}: ${err.message}`, 'ERROR');
                    console.error('Error detallado:', err);
                    
                    peerConnections.delete(viewerId);
                    pc.close();
                });
                
        } catch (err) {
            log(`❌ ERROR al crear PeerConnection para ${viewerId}: ${err.message}`, 'ERROR');
        }
    });
    
    socket.on('viewer-left', (data) => {
        const viewerId = data.viewerId;
        log(`👋 Viewer ${viewerId} desconectado`, 'INFO');
        log(`👥 Viewers restantes: ${data.totalViewers}`, 'INFO');
        
        const pc = peerConnections.get(viewerId);
        if (pc) {
            pc.close();
            peerConnections.delete(viewerId);
            log(`🧹 Conexión de ${viewerId} eliminada`, 'INFO');
        }
    });
    
    // ============================================
    // EVENTOS WEBRTC PARA VIEWER
    // ============================================
    socket.on('offer', handleOffer);
    socket.on('answer', handleAnswer);
    socket.on('ice-candidate', handleIceCandidate);
}

// ============================================
// WEBRTC HANDLERS (PARA VIEWER)
// ============================================
async function handleOffer(data) {
    log(`📥 OFERTA RECIBIDA del broadcaster ${data.from}`, 'SUCCESS');
    
    if (selectedRole !== 'viewer') {
        log('⚠️ Ignorando oferta (no soy viewer)', 'WARN');
        return;
    }
    
    try {
        if (!peerConnectionViewer) {
            log('🆕 Creando nueva PeerConnection como viewer', 'INFO');
            peerConnectionViewer = new RTCPeerConnection(configuration);
            
            peerConnectionViewer.ontrack = (event) => {
                log('🎥 TRACK DE VIDEO RECIBIDO 🎥', 'SUCCESS');
                
                if (elements.remoteVideo) {
                    elements.remoteVideo.srcObject = event.streams[0];
                    
                    const playPromise = elements.remoteVideo.play();
                    if (playPromise !== undefined) {
                        playPromise
                            .then(() => log('✅ Video reproduciéndose', 'SUCCESS'))
                            .catch(e => {
                                log(`⚠️ Error al reproducir: ${e.message}`, 'WARN');
                                if (device.isPC) {
                                    elements.remoteOverlay.innerHTML = '<span>👉 Haz clic en el video para reproducir</span>';
                                    elements.remoteOverlay.style.display = 'flex';
                                }
                            });
                    }
                    
                    if (elements.remoteOverlay) {
                        elements.remoteOverlay.style.display = 'none';
                    }
                    
                    updateStatus('✅ Video recibido');
                }
            };
            
            peerConnectionViewer.onicecandidate = (event) => {
                if (event.candidate) {
                    log(`🧊 Enviando ICE candidate al broadcaster`, 'INFO');
                    socket.emit('ice-candidate', {
                        target: data.from,
                        candidate: event.candidate
                    });
                }
            };
            
            peerConnectionViewer.oniceconnectionstatechange = () => {
                log(`🧊 ICE state: ${peerConnectionViewer.iceConnectionState}`, 'INFO');
                if (peerConnectionViewer.iceConnectionState === 'connected') {
                    updateStatus('✅ Conexión establecida');
                }
            };
        }
        
        await peerConnectionViewer.setRemoteDescription(new RTCSessionDescription(data.offer));
        log('✅ Remote description set', 'SUCCESS');
        
        const answer = await peerConnectionViewer.createAnswer();
        await peerConnectionViewer.setLocalDescription(answer);
        log('✅ Answer creada', 'SUCCESS');
        
        socket.emit('answer', { 
            target: data.from, 
            answer: answer 
        });
        log('📤 Respuesta enviada', 'SUCCESS');
        
    } catch (err) {
        log(`❌ Error en handleOffer: ${err.message}`, 'ERROR');
    }
}

async function handleAnswer(data) {
    log(`📥 Respuesta recibida de ${data.from} (broadcaster)`, 'INFO');
    
    if (selectedRole === 'admin') {
        const pc = peerConnections.get(data.from);
        if (pc) {
            try {
                await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
                log(`✅ Remote description set para viewer ${data.from}`, 'SUCCESS');
            } catch (err) {
                log(`❌ Error en answer: ${err.message}`, 'ERROR');
            }
        }
    }
}

async function handleIceCandidate(data) {
    log(`🧊 ICE candidate recibido de ${data.from}`, 'INFO');
    
    try {
        if (selectedRole === 'viewer' && peerConnectionViewer) {
            await peerConnectionViewer.addIceCandidate(new RTCIceCandidate(data.candidate));
            log('✅ ICE candidate agregado al viewer', 'SUCCESS');
            
            setTimeout(() => {
                if (peerConnectionViewer) {
                    log(`🧊 Estado ICE actual: ${peerConnectionViewer.iceConnectionState}`, 'INFO');
                }
            }, 500);
            
        } else if (selectedRole === 'admin') {
            const pc = peerConnections.get(data.from);
            if (pc) {
                await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
                log(`✅ ICE agregado para viewer ${data.from}`, 'SUCCESS');
                
                setTimeout(() => {
                    if (pc) {
                        log(`🧊 Estado ICE viewer ${data.from}: ${pc.iceConnectionState}`, 'INFO');
                    }
                }, 500);
            }
        }
    } catch (err) {
        log(`❌ Error agregando ICE: ${err.message}`, 'ERROR');
    }
}

// ============================================
// PANTALLA COMPLETA
// ============================================
window.toggleFullscreen = function() {
    const video = elements.remoteVideo;
    
    if (!video) return;
    
    if (!document.fullscreenElement) {
        if (video.requestFullscreen) {
            video.requestFullscreen();
        } else if (video.webkitRequestFullscreen) {
            video.webkitRequestFullscreen();
        } else if (video.msRequestFullscreen) {
            video.msRequestFullscreen();
        }
        log('⛶ Pantalla completa activada', 'INFO');
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        } else if (document.msExitFullscreen) {
            document.msExitFullscreen();
        }
        log('⛶ Saliendo de pantalla completa', 'INFO');
    }
};

// ============================================
// EVENT LISTENERS
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    log('✅ DOM cargado, configurando eventos...', 'INFO');
    
    elements.startBtn.addEventListener('click', startBroadcast);
    elements.stopBtn.addEventListener('click', stopBroadcast);
    elements.joinBtn.addEventListener('click', joinRoom);
    elements.leaveBtn.addEventListener('click', leaveRoom);
    
    if (elements.remoteVideo) {
        elements.remoteVideo.addEventListener('click', () => {
            elements.remoteVideo.play();
            if (elements.remoteOverlay) {
                elements.remoteOverlay.style.display = 'none';
            }
        });
    }
    
    elements.loginUsername.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') login();
    });
    
    elements.loginPassword.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') login();
    });
    
    log('✅ Eventos configurados', 'SUCCESS');
});