const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');
const os = require('os');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true
  },
  // Configuración para conexiones inestables
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ['websocket', 'polling']
});

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Mapa de conexiones para la solución adicional
const connections = new Map();

// Mapa de salas con información mejorada
const rooms = new Map(); // roomId -> { broadcaster: socketId, viewers: Set, createdAt, lastActivity }

// Ruta de salud para verificar que el servidor funciona
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Servidor funcionando',
    time: new Date().toISOString(),
    activeRooms: rooms.size,
    activeConnections: connections.size
  });
});

// Ruta principal
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// API para obtener salas activas
app.get('/api/rooms', (req, res) => {
  const activeRooms = Array.from(rooms.entries()).map(([id, room]) => ({
    id,
    viewers: room.viewers.size,
    broadcaster: room.broadcaster ? true : false,
    createdAt: room.createdAt,
    lastActivity: room.lastActivity,
    deviceType: room.deviceType
  }));
  res.json(activeRooms);
});

// Configuración de Socket.IO mejorada
io.on('connection', (socket) => {
  const clientAddress = socket.handshake.address;
  console.log(`🟢 Nuevo cliente conectado: ${socket.id} - IP: ${clientAddress}`);

  // Guardar en el mapa de conexiones (solución adicional)
  connections.set(socket.id, {
    id: socket.id,
    connectedAt: new Date(),
    lastActivity: new Date(),
    ip: clientAddress
  });

  // Detectar tipo de dispositivo (opcional)
  const userAgent = socket.handshake.headers['user-agent'];
  const deviceType = detectDeviceType(userAgent);
  console.log(`📱 Dispositivo: ${deviceType}`);

  // PING/PONG para mantener conexión
  socket.on('ping', () => {
    socket.emit('pong');
    // Actualizar última actividad
    const conn = connections.get(socket.id);
    if (conn) {
      conn.lastActivity = new Date();
    }
  });

  // Unirse como broadcaster (transmisor)
  socket.on('broadcaster-join', (roomId) => {
    console.log(`📡 Broadcaster ${socket.id} unido a sala: ${roomId} [${deviceType}]`);
    
    // Dejar cualquier sala anterior
    socket.rooms.forEach(room => {
      if (room !== socket.id) socket.leave(room);
    });
    
    // Unirse a la nueva sala
    socket.join(roomId);
    
    // Guardar información del broadcaster
    if (!rooms.has(roomId)) {
      rooms.set(roomId, {
        broadcaster: socket.id,
        viewers: new Set(),
        createdAt: new Date(),
        lastActivity: new Date(),
        deviceType: deviceType
      });
    } else {
      const room = rooms.get(roomId);
      // Si ya hay un broadcaster, lo reemplazamos y notificamos
      if (room.broadcaster && room.broadcaster !== socket.id) {
        io.to(room.broadcaster).emit('broadcaster-disconnected', {
          reason: 'replaced',
          message: 'Otro transmisor inició en esta sala'
        });
      }
      room.broadcaster = socket.id;
      room.lastActivity = new Date();
      room.deviceType = deviceType;
    }
    
    // Notificar que el broadcaster está listo
    socket.emit('broadcaster-ready', {
      roomId,
      message: 'Listo para transmitir'
    });
    
    // Emitir lista actualizada de viewers al broadcaster
    updateViewerList(roomId);
    
    // Actualizar última actividad
    const conn = connections.get(socket.id);
    if (conn) {
      conn.lastActivity = new Date();
      conn.room = roomId;
      conn.role = 'broadcaster';
    }
  });

  // Unirse como viewer (espectador)
  socket.on('viewer-join', (roomId) => {
    console.log(`👁️ Viewer ${socket.id} intentando unirse a sala: ${roomId} [${deviceType}]`);
    
    const room = rooms.get(roomId);
    
    if (room && room.broadcaster) {
      // Unir al viewer a la sala
      socket.join(roomId);
      room.viewers.add(socket.id);
      room.lastActivity = new Date();
      
      console.log(`✅ Viewer ${socket.id} unido a sala ${roomId}. Total viewers: ${room.viewers.size}`);
      
      // Notificar al broadcaster que hay un nuevo viewer
      io.to(room.broadcaster).emit('viewer-joined', {
        viewerId: socket.id,
        deviceType: deviceType,
        totalViewers: room.viewers.size
      });
      
      // Confirmar al viewer que se unió
      socket.emit('room-joined', {
        roomId,
        broadcasterId: room.broadcaster,
        deviceType: deviceType,
        totalViewers: room.viewers.size
      });
      
      // Actualizar lista de viewers para todos
      updateViewerList(roomId);
      
      // Actualizar última actividad
      const conn = connections.get(socket.id);
      if (conn) {
        conn.lastActivity = new Date();
        conn.room = roomId;
        conn.role = 'viewer';
      }
    } else {
      console.log(`❌ Sala ${roomId} no encontrada o sin broadcaster`);
      socket.emit('room-error', {
        message: 'La sala no existe o no hay transmisión activa',
        code: 'ROOM_NOT_FOUND'
      });
    }
  });

  // Manejar oferta WebRTC (del broadcaster al viewer)
  socket.on('offer', (data) => {
    console.log(`📤 Oferta de ${socket.id} para ${data.target}`);
    io.to(data.target).emit('offer', {
      offer: data.offer,
      from: socket.id,
      deviceType: deviceType
    });
  });

  // Manejar respuesta WebRTC (del viewer al broadcaster)
  socket.on('answer', (data) => {
    console.log(`📥 Respuesta de ${socket.id} para ${data.target}`);
    io.to(data.target).emit('answer', {
      answer: data.answer,
      from: socket.id,
      deviceType: deviceType
    });
  });

  // Manejar candidatos ICE
  socket.on('ice-candidate', (data) => {
    console.log(`🧊 ICE candidate de ${socket.id} para ${data.target}`);
    io.to(data.target).emit('ice-candidate', {
      candidate: data.candidate,
      from: socket.id
    });
  });

  // Detener transmisión
  socket.on('stop-broadcast', (roomId) => {
    console.log(`🛑 Broadcast detenido en sala ${roomId} por ${socket.id}`);
    
    const room = rooms.get(roomId);
    if (room && room.broadcaster === socket.id) {
      // Notificar a todos los viewers
      io.to(roomId).emit('broadcast-ended', {
        reason: 'broadcaster_stopped',
        message: 'La transmisión ha finalizado'
      });
      
      // Limpiar la sala
      rooms.delete(roomId);
      console.log(`🗑️ Sala ${roomId} eliminada`);
    }
  });

  // Solicitar lista de salas activas
  socket.on('get-active-rooms', () => {
    const activeRooms = Array.from(rooms.entries()).map(([id, room]) => ({
      id,
      viewers: room.viewers.size,
      broadcaster: room.broadcaster ? true : false,
      createdAt: room.createdAt,
      deviceType: room.deviceType
    }));
    
    socket.emit('active-rooms', activeRooms);
  });

  // Manejar desconexión (mejorado con la solución adicional)
  socket.on('disconnect', (reason) => {
    console.log(`🔴 Cliente desconectado: ${socket.id} - Razón: ${reason}`);
    
    // Eliminar del mapa de conexiones (solución adicional)
    connections.delete(socket.id);
    
    // Buscar si el socket desconectado era un broadcaster
    for (const [roomId, room] of rooms.entries()) {
      if (room.broadcaster === socket.id) {
        console.log(`📡 Broadcaster ${socket.id} desconectado de sala ${roomId}`);
        
        // Notificar a todos los viewers
        io.to(roomId).emit('broadcaster-disconnected', {
          reason: 'broadcaster_left',
          message: 'El transmisor se ha desconectado'
        });
        
        // Eliminar la sala
        rooms.delete(roomId);
        console.log(`🗑️ Sala ${roomId} eliminada por desconexión del broadcaster`);
        break;
      }
      
      // Si era un viewer, quitarlo de la sala
      if (room.viewers && room.viewers.has(socket.id)) {
        room.viewers.delete(socket.id);
        room.lastActivity = new Date();
        console.log(`👁️ Viewer ${socket.id} removido de sala ${roomId}. Viewers restantes: ${room.viewers.size}`);
        
        // Notificar al broadcaster
        if (room.broadcaster) {
          io.to(room.broadcaster).emit('viewer-left', {
            viewerId: socket.id,
            totalViewers: room.viewers.size
          });
        }
        
        // Actualizar lista de viewers
        updateViewerList(roomId);
        break;
      }
    }
  });

  // Manejar errores
  socket.on('error', (error) => {
    console.error(`❌ Error en socket ${socket.id}:`, error);
  });
});

// Función para actualizar la lista de viewers en una sala
function updateViewerList(roomId) {
  const room = rooms.get(roomId);
  if (room && room.broadcaster) {
    const viewersList = Array.from(room.viewers).map(viewerId => ({
      id: viewerId
    }));
    
    io.to(roomId).emit('viewers-update', {
      total: room.viewers.size,
      viewers: viewersList
    });
  }
}

// Función para detectar tipo de dispositivo (simplificada)
function detectDeviceType(userAgent) {
  if (!userAgent) return 'unknown';
  userAgent = userAgent.toLowerCase();
  
  if (userAgent.includes('tv') || userAgent.includes('smart-tv') || 
      userAgent.includes('googletv') || userAgent.includes('appletv')) {
    return 'tv';
  }
  if (userAgent.includes('tablet') || userAgent.includes('ipad')) {
    return 'tablet';
  }
  if (userAgent.includes('mobile') || userAgent.includes('android') || 
      userAgent.includes('iphone') || userAgent.includes('ipod')) {
    return 'mobile';
  }
  return 'pc';
}

// Limpieza periódica de salas inactivas (cada 5 minutos)
setInterval(() => {
  const now = new Date();
  
  // Limpiar salas inactivas
  for (const [roomId, room] of rooms.entries()) {
    // Si la sala tiene más de 1 hora sin actividad, eliminarla
    if (now - room.lastActivity > 3600000) {
      console.log(`🧹 Limpiando sala inactiva: ${roomId}`);
      io.to(roomId).emit('broadcast-ended', {
        reason: 'timeout',
        message: 'Sala cerrada por inactividad'
      });
      rooms.delete(roomId);
    }
  }
  
  // Limpiar conexiones antiguas (solución adicional)
  for (const [id, conn] of connections.entries()) {
    // Si la conexión tiene más de 2 horas sin actividad, eliminarla del mapa
    if (now - conn.lastActivity > 7200000) {
      console.log(`🧹 Limpiando conexión antigua: ${id}`);
      connections.delete(id);
    }
  }
}, 300000); // 5 minutos

// Endpoint para ver estadísticas de conexiones (solución adicional)
app.get('/api/stats', (req, res) => {
  res.json({
    activeConnections: connections.size,
    activeRooms: rooms.size,
    connections: Array.from(connections.values()).map(c => ({
      id: c.id,
      connectedAt: c.connectedAt,
      lastActivity: c.lastActivity,
      role: c.role || 'unknown',
      room: c.room || 'none'
    })),
    rooms: Array.from(rooms.entries()).map(([id, room]) => ({
      id,
      broadcaster: room.broadcaster,
      viewers: room.viewers.size,
      createdAt: room.createdAt,
      lastActivity: room.lastActivity,
      deviceType: room.deviceType
    }))
  });
});

// Obtener IP local para mostrar
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

// Puerto - CRÍTICO: Usar process.env.PORT para Railway
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

server.listen(PORT, HOST, () => {
  console.log(`
  🚀 SERVIDOR DE TRANSMISIÓN INICIADO
  ═══════════════════════════════════
  📡 Puerto: ${PORT}
  🌐 Host: ${HOST}
  💻 Local: http://localhost:${PORT}
  🌍 Red local: http://${getLocalIP()}:${PORT}
  
  📊 Salas activas: 0
  🔌 Conexiones: 0
  ⏰ ${new Date().toLocaleString()}
  
  ✅ Servidor listo para recibir conexiones
  ✅ Solución adicional de reconexión activada
  `);
});

// Manejar cierre graceful
process.on('SIGTERM', () => {
  console.log('👋 Recibida señal SIGTERM, cerrando servidor...');
  server.close(() => {
    console.log('✅ Servidor cerrado');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('👋 Recibida señal SIGINT, cerrando servidor...');
  server.close(() => {
    console.log('✅ Servidor cerrado');
    process.exit(0);
  });
});