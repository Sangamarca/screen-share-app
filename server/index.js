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
    origin: "*", // Permite cualquier origen
    methods: ["GET", "POST"],
    credentials: true
  },
  // Configuración para conexiones lentas (móvil)
  pingTimeout: 60000,
  pingInterval: 25000
});

// Middleware mejorado
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));

// Servir archivos estáticos con caché
app.use(express.static(path.join(__dirname, '../public'), {
  maxAge: '1d',
  etag: true,
  lastModified: true,
  setHeaders: (res, path) => {
    if (path.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  }
}));

// Detectar dispositivo del usuario
app.use((req, res, next) => {
  const userAgent = req.headers['user-agent'];
  req.device = {
    isMobile: /mobile|android|iphone|ipad|ipod/i.test(userAgent),
    isTV: /tv|smart-tv|googletv|appletv|roku/i.test(userAgent),
    isTablet: /tablet|ipad|playbook|silk/i.test(userAgent),
    isPC: !/mobile|android|iphone|ipad|ipod|tv|smart-tv/i.test(userAgent)
  };
  next();
});

// Ruta principal con detección de dispositivo
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// API para obtener configuración según dispositivo
app.get('/api/config', (req, res) => {
  res.json({
    device: req.device,
    serverTime: new Date().toISOString(),
    recommendedQuality: req.device.isMobile ? '480p' : (req.device.isTV ? '1080p' : '720p'),
    socketUrl: getServerUrl()
  });
});

// Almacenar información de las salas (mejorado)
const rooms = new Map();

// Función para obtener IP del servidor
function getServerUrl() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return `http://${iface.address}:${PORT}`;
      }
    }
  }
  return `http://localhost:${PORT}`;
}

// Configuración de Socket.IO mejorada
io.on('connection', (socket) => {
  console.log(`🟢 Nuevo cliente conectado: ${socket.id} - IP: ${socket.handshake.address}`);

  // Detectar tipo de dispositivo del cliente
  const userAgent = socket.handshake.headers['user-agent'];
  const deviceType = detectDeviceType(userAgent);
  console.log(`📱 Tipo de dispositivo: ${deviceType}`);

  // Unirse como broadcaster
  socket.on('broadcaster-join', (roomId) => {
    console.log(`📡 Broadcaster ${socket.id} unido a sala: ${roomId} [${deviceType}]`);
    
    // Dejar salas anteriores
    socket.rooms.forEach(room => {
      if (room !== socket.id) socket.leave(room);
    });
    
    socket.join(roomId);
    
    if (!rooms.has(roomId)) {
      rooms.set(roomId, {
        broadcaster: socket.id,
        viewers: new Map(), // Ahora guardamos información de cada viewer
        createdAt: new Date(),
        deviceType: deviceType
      });
    } else {
      const room = rooms.get(roomId);
      if (room.broadcaster) {
        io.to(room.broadcaster).emit('broadcaster-disconnected');
      }
      room.broadcaster = socket.id;
      room.deviceType = deviceType;
    }
    
    socket.emit('broadcaster-ready', {
      roomId,
      serverUrl: getServerUrl()
    });
    
    // Emitir lista actualizada de viewers
    updateViewerList(roomId);
  });

  // Unirse como viewer (mejorado)
  socket.on('viewer-join', (data) => {
    const { roomId, deviceInfo = {} } = data;
    console.log(`👁️ Viewer ${socket.id} intentando unirse a sala: ${roomId} [${deviceType}]`);
    
    const room = rooms.get(roomId);
    
    if (room && room.broadcaster) {
      socket.join(roomId);
      
      // Guardar información del viewer
      room.viewers.set(socket.id, {
        id: socket.id,
        deviceType: deviceType,
        joinedAt: new Date(),
        userAgent: userAgent
      });
      
      console.log(`✅ Viewer ${socket.id} unido a sala ${roomId}. Total viewers: ${room.viewers.size}`);
      
      // Notificar al broadcaster
      io.to(room.broadcaster).emit('viewer-joined', {
        viewerId: socket.id,
        deviceType: deviceType,
        totalViewers: room.viewers.size
      });
      
      // Enviar configuración adaptada al dispositivo
      socket.emit('room-joined', {
        roomId,
        broadcasterId: room.broadcaster,
        deviceType: deviceType,
        recommendedQuality: getQualityForDevice(deviceType),
        totalViewers: room.viewers.size
      });
      
      // Actualizar lista de viewers para todos
      updateViewerList(roomId);
    } else {
      socket.emit('room-error', {
        message: 'La sala no existe o no hay transmisión activa',
        code: 'ROOM_NOT_FOUND'
      });
    }
  });

  // Ofrecer diferentes calidades según dispositivo
  socket.on('request-quality', (data) => {
    const { roomId, quality } = data;
    const room = rooms.get(roomId);
    
    if (room && room.broadcaster === socket.id) {
      // El broadcaster ajusta la calidad según la petición
      io.to(roomId).emit('quality-adjusted', {
        quality,
        by: socket.id
      });
    }
  });

  // Manejar oferta WebRTC
  socket.on('offer', (data) => {
    console.log(`📤 Oferta de ${socket.id} para ${data.target}`);
    io.to(data.target).emit('offer', {
      offer: data.offer,
      from: socket.id,
      deviceType: deviceType
    });
  });

  // Manejar respuesta WebRTC
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
      io.to(roomId).emit('broadcast-ended', {
        reason: 'broadcaster_stopped',
        message: 'La transmisión ha finalizado'
      });
      
      rooms.delete(roomId);
    }
  });

  // Solicitar lista de salas activas
  socket.on('get-active-rooms', () => {
    const activeRooms = Array.from(rooms.entries()).map(([id, room]) => ({
      id,
      viewers: room.viewers.size,
      broadcaster: room.broadcaster,
      createdAt: room.createdAt,
      deviceType: room.deviceType
    }));
    
    socket.emit('active-rooms', activeRooms);
  });

  // Manejar desconexión (mejorado)
  socket.on('disconnect', () => {
    console.log(`🔴 Cliente desconectado: ${socket.id}`);
    
    // Buscar en todas las salas
    for (const [roomId, room] of rooms.entries()) {
      if (room.broadcaster === socket.id) {
        console.log(`📡 Broadcaster ${socket.id} desconectado de sala ${roomId}`);
        io.to(roomId).emit('broadcaster-disconnected', {
          reason: 'broadcaster_left',
          message: 'El transmisor se ha desconectado'
        });
        rooms.delete(roomId);
        break;
      }
      
      if (room.viewers.has(socket.id)) {
        room.viewers.delete(socket.id);
        console.log(`👁️ Viewer ${socket.id} removido de sala ${roomId}. Viewers restantes: ${room.viewers.size}`);
        
        // Notificar al broadcaster
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
});

// Funciones auxiliares
function detectDeviceType(userAgent) {
  if (!userAgent) return 'unknown';
  userAgent = userAgent.toLowerCase();
  
  if (userAgent.includes('tv') || userAgent.includes('smart-tv') || 
      userAgent.includes('googletv') || userAgent.includes('appletv') || 
      userAgent.includes('roku')) {
    return 'tv';
  }
  if (userAgent.includes('tablet') || userAgent.includes('ipad') || 
      userAgent.includes('playbook') || userAgent.includes('silk')) {
    return 'tablet';
  }
  if (userAgent.includes('mobile') || userAgent.includes('android') || 
      userAgent.includes('iphone') || userAgent.includes('ipod')) {
    return 'mobile';
  }
  return 'pc';
}

function getQualityForDevice(deviceType) {
  const qualities = {
    tv: { width: 1920, height: 1080, bitrate: 2500000 },
    pc: { width: 1280, height: 720, bitrate: 1500000 },
    tablet: { width: 854, height: 480, bitrate: 1000000 },
    mobile: { width: 640, height: 360, bitrate: 500000 },
    unknown: { width: 854, height: 480, bitrate: 1000000 }
  };
  return qualities[deviceType] || qualities.unknown;
}

function updateViewerList(roomId) {
  const room = rooms.get(roomId);
  if (room && room.broadcaster) {
    const viewersList = Array.from(room.viewers.values()).map(v => ({
      id: v.id,
      deviceType: v.deviceType,
      joinedAt: v.joinedAt
    }));
    
    io.to(roomId).emit('viewers-update', {
      total: room.viewers.size,
      viewers: viewersList
    });
  }
}

// Configuración del puerto
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

server.listen(PORT, HOST, () => {
  console.log(`
  🚀 SERVIDOR DE TRANSMISIÓN GLOBAL
  ════════════════════════════════
  📡 Puerto: ${PORT}
  🌐 Acceso local: http://localhost:${PORT}
  📱 Red local: http://${getLocalIP()}:${PORT}
  
  📢 IMPORTANTE: Para acceso desde INTERNET:
  ${getPublicAccessInstructions()}
  `);
});

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

function getPublicAccessInstructions() {
  return `
  🔧 OPCIONES DE ACCESO PÚBLICO:
  
  1️⃣ LOCAL TUNNEL (Recomendado):
     $ npm install -g localtunnel
     $ lt --port ${PORT} --subdomain tunombre
  
  2️⃣ NGROK:
     $ ngrok http ${PORT}
  
  3️⃣ SERVIDOR EN LA NUBE:
     • Desplegar en Railway.app, Heroku, o DigitalOcean
     • Configurar dominio propio
  
  4️⃣ COMPARTIR RED LOCAL:
     • Misma WiFi: http://${getLocalIP()}:${PORT}
     • Crear hotspot desde el celular
  `;
}