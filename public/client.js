// ============================================
// VERSIÓN DE DIAGNÓSTICO - MUESTRA TODO EN PANTALLA
// ============================================

// Crear panel de diagnóstico visible SIEMPRE
const diagnosticPanel = document.createElement('div');
diagnosticPanel.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    background: black;
    color: lime;
    font-family: monospace;
    font-size: 14px;
    padding: 10px;
    z-index: 10000;
    max-height: 200px;
    overflow-y: auto;
    border-bottom: 3px solid red;
`;
document.body.appendChild(diagnosticPanel);

function diag(msg) {
    const time = new Date().toLocaleTimeString();
    console.log(msg);
    const line = document.createElement('div');
    line.textContent = `[${time}] ${msg}`;
    diagnosticPanel.appendChild(line);
    diagnosticPanel.scrollTop = diagnosticPanel.scrollHeight;
    
    // Limitar líneas
    while (diagnosticPanel.children.length > 8) {
        diagnosticPanel.removeChild(diagnosticPanel.firstChild);
    }
}

diag('🚀 DIAGNÓSTICO INICIADO');
diag('📱 Esperando DOM...');

document.addEventListener('DOMContentLoaded', function() {
    diag('✅ DOM listo');
    
    // ============================================
    // ELEMENTOS
    // ============================================
    const joinBtn = document.getElementById('joinBtn');
    const viewRoomId = document.getElementById('viewRoomId');
    const remoteOverlay = document.getElementById('remoteOverlay');
    const statusText = document.getElementById('statusText');
    
    diag(`🔍 Botón Unirse: ${joinBtn ? 'ENCONTRADO' : 'NO ENCONTRADO'}`);
    diag(`🔍 Input sala: ${viewRoomId ? 'ENCONTRADO' : 'NO ENCONTRADO'}`);
    
    // ============================================
    // CONEXIÓN SIMPLE
    // ============================================
    diag('📡 Conectando al servidor...');
    
    const socket = io({
        reconnection: true,
        reconnectionAttempts: Infinity
    });
    
    socket.on('connect', () => {
        diag('✅ Conectado al servidor');
        if (statusText) statusText.textContent = 'Conectado';
    });
    
    socket.on('disconnect', () => {
        diag('❌ Desconectado del servidor');
        if (statusText) statusText.textContent = 'Desconectado';
    });
    
    socket.on('room-joined', (data) => {
        diag(`✅ UNIDO A SALA: ${data.roomId}`);
        if (remoteOverlay) {
            remoteOverlay.style.display = 'none';
            diag('✅ Overlay ocultado');
        }
        if (statusText) statusText.textContent = `Unido a ${data.roomId}`;
    });
    
    socket.on('room-error', (error) => {
        diag(`❌ ERROR: ${error.message || error}`);
        if (statusText) statusText.textContent = 'Error: ' + (error.message || error);
    });
    
    // ============================================
    // FUNCIÓN UNIRSE (CON DIAGNÓSTICO)
    // ============================================
    function joinRoom() {
        diag('👆 CLIC EN UNIRSE DETECTADO');
        
        if (!viewRoomId) {
            diag('❌ ERROR: Input no encontrado');
            return;
        }
        
        const roomName = viewRoomId.value.trim();
        diag(`📝 Nombre de sala: "${roomName}"`);
        
        if (!roomName) {
            diag('❌ ERROR: Sala vacía');
            alert('Ingresa un nombre de sala');
            return;
        }
        
        diag(`📡 Enviando solicitud para sala: ${roomName}`);
        
        if (remoteOverlay) {
            remoteOverlay.innerHTML = '<span style="color:yellow">⏳ Conectando...</span>';
            diag('✅ Overlay actualizado');
        }
        
        if (joinBtn) {
            joinBtn.disabled = true;
            joinBtn.textContent = 'Conectando...';
            diag('✅ Botón deshabilitado');
        }
        
        socket.emit('viewer-join', roomName);
        diag('✅ Evento emitido al servidor');
    }
    
    // ============================================
    // ASIGNAR EVENTO
    // ============================================
    if (joinBtn) {
        joinBtn.addEventListener('click', function() {
            diag('🎯 EVENTO CLICK CAPTURADO');
            joinRoom();
        });
        diag('✅ Event listener añadido al botón');
    } else {
        diag('❌ NO SE PUDO AÑADIR EVENTO - botón no existe');
    }
    
    // Valores por defecto
    if (viewRoomId) {
        viewRoomId.value = 'sala1';
        diag('✅ Valor por defecto: sala1');
    }
    
    diag('✅ Inicialización completa');
});