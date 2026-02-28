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
  // CONFIGURACIÓN MEJORADA PARA EVITAR DESCONEXIONES
  pingTimeout: 120000,        // 2 minutos sin ping = desconexión
  pingInterval: 50000,        // Ping cada 50 segundos
  transports: ['websocket'],   // FORZAR WEBSOCKET PURO
  allowEIO3: true,
  connectTimeout: 45000,
  maxHttpBufferSize: 1e8,
  cookie: false
});

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type'],
  credentials: true
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Headers para mantener conexión
app.use((req, res, next) => {
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Keep-Alive', 'timeout=120');
  next();
});

// Mapas para seguimiento
const connections = new Map();
const rooms = new Map();

// Ruta de salud
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Servidor funcionando',
    time: new Date().toISOString(),
    activeRooms: rooms.size,
    activeConnections: connections.size,
    uptime: process.uptime()
  });
});

// Ruta principal
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Configuración de Socket.IO
io.on('connection', (socket) => {
  const clientAddress = socket.handshake.address;
  console.log(`🟢 Nuevo cliente conectado: ${socket.id} - IP: ${clientAddress}`);
  
  // Guardar conexión
  connections.set(socket.id, {
    id: socket.id,
    connectedAt: new Date(),
    lastPing: new Date(),
    ip: clientAddress
  });

  // Detectar dispositivo
  const userAgent = socket.handshake.headers['user-agent'];
  const deviceType = detectDeviceType(userAgent);
  console.log(`📱 Dispositivo: ${deviceType}`);

  // PING mejorado - responder inmediatamente
  socket.on('ping', () => {
    socket.emit('pong');
    const conn = connections.get(socket.id);
    if (conn) {
      conn.lastPing = new Date();
    }
  });

  // Unirse como broadcaster
  socket.on('broadcaster-join', (roomId) => {
    console.log(`📡 Broadcaster ${socket.id} unido a sala: ${roomId} [${deviceType}]`);
    
    socket.rooms.forEach(room => {
      if (room !== socket.id) socket.leave(room);
    });
    
    socket.join(roomId);
    
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
    
    socket.emit('broadcaster-ready', {
      roomId,
      message: 'Listo para transmitir'
    });
    
    updateViewerList(roomId);
    
    const conn = connections.get(socket.id);
    if (conn) {
      conn.room = roomId;
      conn.role = 'broadcaster';
    }
  });

  // Unirse como viewer
  socket.on('viewer-join', (roomId) => {
    console.log(`👁️ Viewer ${socket.id} intentando unirse a sala: ${roomId} [${deviceType}]`);
    
    const room = rooms.get(roomId);
    
    if (room && room.broadcaster) {
      socket.join(roomId);
      room.viewers.add(socket.id);
      room.lastActivity = new Date();
      
      console.log(`✅ Viewer ${socket.id} unido. Total: ${room.viewers.size}`);
      
      io.to(room.broadcaster).emit('viewer-joined', {
        viewerId: socket.id,
        deviceType: deviceType,
        totalViewers: room.viewers.size
      });
      
      socket.emit('room-joined', {
        roomId,
        broadcasterId: room.broadcaster,
        deviceType: deviceType,
        totalViewers: room.viewers.size
      });
      
      updateViewerList(roomId);
      
      const conn = connections.get(socket.id);
      if (conn) {
        conn.room = roomId;
        conn.role = 'viewer';
      }
    } else {
      socket.emit('room-error', {
        message: 'La sala no existe o no hay transmisión activa',
        code: 'ROOM_NOT_FOUND'
      });
    }
  });

  // WebRTC signaling
  socket.on('offer', (data) => {
    io.to(data.target).emit('offer', {
      offer: data.offer,
      from: socket.id,
      deviceType: deviceType
    });
  });

  socket.on('answer', (data) => {
    io.to(data.target).emit('answer', {
      answer: data.answer,
      from: socket.id,
      deviceType: deviceType
    });
  });

  socket.on('ice-candidate', (data) => {
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
      io.to(roomId).emit('broadcast-ended', {
        reason: 'broadcaster_stopped',
        message: 'La transmisión ha finalizado'
      });
      rooms.delete(roomId);
    }
  });

  // Desconexión
  socket.on('disconnect', (reason) => {
    console.log(`🔴 Cliente desconectado: ${socket.id} - Razón: ${reason}`);
    
    connections.delete(socket.id);
    
    for (const [roomId, room] of rooms.entries()) {
      if (room.broadcaster === socket.id) {
        io.to(roomId).emit('broadcaster-disconnected', {
          reason: 'broadcaster_left',
          message: 'El transmisor se ha desconectado'
        });
        rooms.delete(roomId);
        break;
      }
      
      if (room.viewers && room.viewers.has(socket.id)) {
        room.viewers.delete(socket.id);
        room.lastActivity = new Date();
        
        if (room.broadcaster) {
          io.to(room.broadcaster).emit('viewer-left', {
            viewerId: socket.id,
            totalViewers: room.viewers.size
          });
        }
        
        updateViewerList(roomId);
        break;
      }
    }
  });

  socket.on('error', (error) => {
    console.error(`❌ Error en socket ${socket.id}:`, error);
  });
});

// Función para actualizar lista de viewers
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

// Detectar tipo de dispositivo
function detectDeviceType(userAgent) {
  if (!userAgent) return 'unknown';
  userAgent = userAgent.toLowerCase();
  
  if (userAgent.includes('tv') || userAgent.includes('smart-tv')) return 'tv';
  if (userAgent.includes('tablet') || userAgent.includes('ipad')) return 'tablet';
  if (userAgent.includes('mobile') || userAgent.includes('android') || userAgent.includes('iphone')) return 'mobile';
  return 'pc';
}

// Limpieza periódica
setInterval(() => {
  const now = new Date();
  
  // Limpiar salas inactivas (1 hora)
  for (const [roomId, room] of rooms.entries()) {
    if (now - room.lastActivity > 3600000) {
      console.log(`🧹 Limpiando sala inactiva: ${roomId}`);
      io.to(roomId).emit('broadcast-ended', {
        reason: 'timeout',
        message: 'Sala cerrada por inactividad'
      });
      rooms.delete(roomId);
    }
  }
  
  // Limpiar conexiones sin actividad (2 horas)
  for (const [id, conn] of connections.entries()) {
    if (now - conn.lastPing > 7200000) {
      console.log(`🧹 Limpiando conexión inactiva: ${id}`);
      connections.delete(id);
    }
  }
}, 300000);

// Estadísticas
app.get('/api/stats', (req, res) => {
  res.json({
    activeConnections: connections.size,
    activeRooms: rooms.size,
    uptime: process.uptime()
  });
});

// Puerto
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

server.listen(PORT, HOST, () => {
  console.log(`
  🚀 SERVIDOR DE TRANSMISIÓN INICIADO
  ═══════════════════════════════════
  📡 Puerto: ${PORT}
  🌐 Host: ${HOST}
  ⏰ ${new Date().toLocaleString()}
  
  ⚙️ Configuración:
  - pingTimeout: 120000ms (2 minutos)
  - pingInterval: 50000ms (50 segundos)
  - Transporte: WebSocket puro
  
  ✅ Servidor listo
  `);
});

// Cierre graceful
process.on('SIGTERM', () => {
  console.log('👋 Cerrando servidor...');
  server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  console.log('👋 Cerrando servidor...');
  server.close(() => process.exit(0));
});