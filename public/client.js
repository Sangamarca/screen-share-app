// ============================================
// VERSIÓN MÍNIMA - SOLO PARA PROBAR "UNIRSE"
// ============================================

console.log('🚀 Versión mínima iniciada');

document.addEventListener('DOMContentLoaded', function() {
    console.log('✅ DOM listo');
    
    // ============================================
    // ELEMENTOS (SOLO LOS NECESARIOS)
    // ============================================
    const joinBtn = document.getElementById('joinBtn');
    const viewRoomId = document.getElementById('viewRoomId');
    const remoteVideo = document.getElementById('remoteVideo');
    const remoteOverlay = document.getElementById('remoteOverlay');
    const statusText = document.getElementById('statusText');
    
    console.log('🔍 Botón Unirse:', joinBtn ? 'SÍ' : 'NO');
    console.log('🔍 Input sala:', viewRoomId ? 'SÍ' : 'NO');
    
    // ============================================
    // CONEXIÓN AL SERVIDOR
    // ============================================
    const socket = io({
        reconnection: true
    });
    
    socket.on('connect', () => {
        console.log('✅ Conectado al servidor');
        if (statusText) statusText.textContent = 'Conectado';
    });
    
    socket.on('room-joined', (data) => {
        console.log('✅ UNIDO A SALA:', data.roomId);
        if (statusText) statusText.textContent = `Unido a ${data.roomId}`;
        if (remoteOverlay) remoteOverlay.style.display = 'none';
        if (joinBtn) {
            joinBtn.disabled = false;
            joinBtn.textContent = 'Unirse';
        }
    });
    
    socket.on('room-error', (error) => {
        console.log('❌ Error:', error);
        if (statusText) statusText.textContent = `Error: ${error.message || error}`;
        if (joinBtn) {
            joinBtn.disabled = false;
            joinBtn.textContent = 'Unirse';
        }
    });
    
    socket.on('broadcaster-disconnected', () => {
        console.log('📡 Transmisor desconectado');
        if (remoteVideo) remoteVideo.srcObject = null;
        if (remoteOverlay) remoteOverlay.style.display = 'flex';
        if (statusText) statusText.textContent = 'Transmisor desconectado';
    });
    
    // ============================================
    // FUNCIÓN UNIRSE (SIMPLIFICADA)
    // ============================================
    function joinRoom() {
        console.log('👆 Función joinRoom ejecutada');
        
        // Verificar input
        if (!viewRoomId) {
            alert('Error: Input no encontrado');
            return;
        }
        
        const roomName = viewRoomId.value.trim();
        console.log('📝 Sala:', roomName);
        
        if (!roomName) {
            alert('Ingresa un nombre de sala');
            return;
        }
        
        // Deshabilitar botón
        if (joinBtn) {
            joinBtn.disabled = true;
            joinBtn.textContent = 'Conectando...';
        }
        
        // Mostrar estado
        if (statusText) statusText.textContent = `Conectando a ${roomName}...`;
        if (remoteOverlay) remoteOverlay.innerHTML = '<span>⏳ Conectando...</span>';
        
        // Enviar al servidor
        console.log('📡 Emitiendo viewer-join a sala:', roomName);
        socket.emit('viewer-join', roomName);
        console.log('✅ Evento emitido');
    }
    
    // ============================================
    // ASIGNAR EVENTO (MÚLTIPLES FORMAS PARA SEGURO)
    // ============================================
    
    // Forma 1: addEventListener
    if (joinBtn) {
        joinBtn.addEventListener('click', function(event) {
            console.log('🎯 Click detectado por addEventListener');
            event.preventDefault();
            joinRoom();
        });
        console.log('✅ Event listener añadido');
    }
    
    // Forma 2: onclick directo (respaldo)
    if (joinBtn) {
        joinBtn.onclick = function(event) {
            console.log('🎯 Click detectado por onclick');
            event.preventDefault();
            joinRoom();
            return false;
        };
        console.log('✅ onclick directo añadido');
    }
    
    // Valores por defecto
    if (viewRoomId) {
        viewRoomId.value = 'sala1';
        console.log('✅ Valor por defecto: sala1');
    }
    
    console.log('✅ Inicialización completa');
});