// ============================================
// VERSIÓN MÍNIMA - SIN HEARTBEAT COMPLEJO
// ============================================
console.log('🚀 Cliente iniciando...');

document.addEventListener('DOMContentLoaded', function() {
    console.log('✅ DOM listo');
    
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
        statusText: document.getElementById('statusText')
    };
    
    let socket = null;
    let localStream = null;
    let peerConnection = null;
    let currentRoom = null;
    let isBroadcaster = false;
    
    function log(msg) {
        console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);
        if (elements.statusText) elements.statusText.textContent = msg;
    }
    
    // CONEXIÓN SIMPLE
    function connectToServer() {
        log('Conectando...');
        
        socket = io({
            reconnection: true,
            reconnectionAttempts: Infinity
        });
        
        socket.on('connect', () => {
            log('✅ Conectado');
        });
        
        socket.on('disconnect', () => {
            log('❌ Desconectado');
            resetUI();
        });
        
        socket.on('broadcaster-ready', () => {
            log('📡 Listo');
        });
        
        socket.on('room-joined', (data) => {
            currentRoom = data.roomId;
            log(`✅ Unido a: ${data.roomId}`);
            if (elements.remoteOverlay) elements.remoteOverlay.style.display = 'none';
        });
        
        socket.on('broadcaster-disconnected', () => {
            log('📡 Transmisor desconectado');
            if (elements.remoteVideo) elements.remoteVideo.srcObject = null;
            if (elements.remoteOverlay) elements.remoteOverlay.style.display = 'flex';
            resetUI();
        });
        
        socket.on('offer', handleOffer);
        socket.on('answer', handleAnswer);
        socket.on('ice-candidate', handleIceCandidate);
    }
    
    const configuration = {
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    };
    
    async function handleOffer(data) {
        if (!peerConnection) {
            peerConnection = new RTCPeerConnection(configuration);
            peerConnection.ontrack = (event) => {
                if (elements.remoteVideo) {
                    elements.remoteVideo.srcObject = event.streams[0];
                    elements.remoteOverlay.style.display = 'none';
                }
            };
            peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    socket.emit('ice-candidate', {
                        target: data.from,
                        candidate: event.candidate
                    });
                }
            };
        }
        
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.emit('answer', { target: data.from, answer });
    }
    
    async function handleAnswer(data) {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
    }
    
    async function handleIceCandidate(data) {
        if (peerConnection) {
            await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
    }
    
    async function startBroadcast() {
        try {
            const room = elements.roomId?.value.trim() || 'sala1';
            localStream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: true
            });
            
            if (elements.localVideo) elements.localVideo.srcObject = localStream;
            if (elements.localOverlay) elements.localOverlay.style.display = 'none';
            
            isBroadcaster = true;
            currentRoom = room;
            
            if (elements.startBtn) elements.startBtn.disabled = true;
            if (elements.stopBtn) elements.stopBtn.disabled = false;
            if (elements.joinBtn) elements.joinBtn.disabled = true;
            
            socket.emit('broadcaster-join', room);
            
            peerConnection = new RTCPeerConnection(configuration);
            localStream.getTracks().forEach(track => {
                peerConnection.addTrack(track, localStream);
            });
            
            peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    socket.emit('ice-candidate', {
                        target: 'broadcast',
                        candidate: event.candidate
                    });
                }
            };
            
            localStream.getVideoTracks()[0].onended = () => stopBroadcast();
            
            log('📡 Transmitiendo');
            
        } catch (err) {
            log(`❌ Error: ${err.message}`);
            resetUI();
        }
    }
    
    function stopBroadcast() {
        if (localStream) {
            localStream.getTracks().forEach(t => t.stop());
            localStream = null;
        }
        if (peerConnection) {
            peerConnection.close();
            peerConnection = null;
        }
        if (currentRoom && isBroadcaster) {
            socket.emit('stop-broadcast', currentRoom);
        }
        if (elements.localVideo) elements.localVideo.srcObject = null;
        if (elements.localOverlay) elements.localOverlay.style.display = 'flex';
        resetUI();
        log('⏹️ Detenido');
    }
    
    function joinAsViewer() {
        const room = elements.viewRoomId?.value.trim() || 'sala1';
        currentRoom = room;
        
        if (elements.joinBtn) elements.joinBtn.disabled = true;
        if (elements.leaveBtn) elements.leaveBtn.disabled = false;
        if (elements.startBtn) elements.startBtn.disabled = true;
        
        if (elements.remoteOverlay) {
            elements.remoteOverlay.innerHTML = '<span>Conectando...</span>';
        }
        
        socket.emit('viewer-join', room);
        log('👁️ Uniéndose');
    }
    
    function leaveAsViewer() {
        if (peerConnection) {
            peerConnection.close();
            peerConnection = null;
        }
        if (elements.remoteVideo) elements.remoteVideo.srcObject = null;
        if (elements.remoteOverlay) {
            elements.remoteOverlay.style.display = 'flex';
            elements.remoteOverlay.innerHTML = '<span>Esperando...</span>';
        }
        resetUI();
    }
    
    function resetUI() {
        isBroadcaster = false;
        currentRoom = null;
        if (elements.startBtn) elements.startBtn.disabled = false;
        if (elements.stopBtn) elements.stopBtn.disabled = true;
        if (elements.joinBtn) elements.joinBtn.disabled = false;
        if (elements.leaveBtn) elements.leaveBtn.disabled = true;
    }
    
    // Inicializar
    log('Inicializando...');
    connectToServer();
    
    if (elements.startBtn) elements.startBtn.addEventListener('click', startBroadcast);
    if (elements.stopBtn) elements.stopBtn.addEventListener('click', stopBroadcast);
    if (elements.joinBtn) elements.joinBtn.addEventListener('click', joinAsViewer);
    if (elements.leaveBtn) elements.leaveBtn.addEventListener('click', leaveAsViewer);
    
    if (elements.roomId) elements.roomId.value = 'sala1';
    if (elements.viewRoomId) elements.viewRoomId.value = 'sala1';
});