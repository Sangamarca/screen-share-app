const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// CONFIGURACIÓN EXTREMA PARA EVITAR TIMEOUTS
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true
  },
  // TIMEOUTS MUY LARGOS
  pingTimeout: 300000,        // 5 MINUTOS (300 segundos)
  pingInterval: 25000,         // 25 segundos
  connectTimeout: 60000,
  maxHttpBufferSize: 1e8,
  transports: ['websocket', 'polling'], // Permitir ambos
  allowUpgrades: true,
  cookie: false,
  // OPCIONES DE MANTENIMIENTO
  perMessageDeflate: false,
  httpCompression: false
});

// Headers keep-alive
app.use((req, res, next) => {
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Keep-Alive', 'timeout=300, max=1000'); // 5 minutos
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Ruta de salud para mantener activo
app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

const rooms = new Map();

io.on('connection', (socket) => {
  console.log('🟢 Conectado:', socket.id);

  // PING automático cada 20 segundos
  const pingInterval = setInterval(() => {
    if (socket.connected) {
      socket.emit('ping-from-server');
      console.log(`📡 Ping a ${socket.id}`);
    }
  }, 20000);

  socket.on('pong-from-client', () => {
    console.log(`📡 Pong de ${socket.id}`);
  });

  socket.on('broadcaster-join', (roomId) => {
    console.log(`📡 Broadcaster ${socket.id} en sala ${roomId}`);
    socket.join(roomId);
    rooms.set(roomId, { broadcaster: socket.id, viewers: new Set() });
    socket.emit('broadcaster-ready');
  });

  socket.on('viewer-join', (roomId) => {
    const room = rooms.get(roomId);
    if (room) {
      socket.join(roomId);
      room.viewers.add(socket.id);
      io.to(room.broadcaster).emit('viewer-joined', socket.id);
      socket.emit('room-joined', { roomId, broadcasterId: room.broadcaster });
      console.log(`👁️ Viewer ${socket.id} unido a ${roomId}`);
    }
  });

  socket.on('offer', (data) => {
    io.to(data.target).emit('offer', { offer: data.offer, from: socket.id });
  });

  socket.on('answer', (data) => {
    io.to(data.target).emit('answer', { answer: data.answer, from: socket.id });
  });

  socket.on('ice-candidate', (data) => {
    io.to(data.target).emit('ice-candidate', { candidate: data.candidate, from: socket.id });
  });

  socket.on('stop-broadcast', (roomId) => {
    console.log(`🛑 Broadcast detenido en ${roomId}`);
    rooms.delete(roomId);
  });

  socket.on('disconnect', () => {
    console.log('🔴 Desconectado:', socket.id);
    clearInterval(pingInterval);
    
    for (const [roomId, room] of rooms.entries()) {
      if (room.broadcaster === socket.id) {
        rooms.delete(roomId);
        break;
      }
      if (room.viewers.has(socket.id)) {
        room.viewers.delete(socket.id);
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`
  🚀 SERVIDOR INICIADO
  ════════════════════
  📡 Puerto: ${PORT}
  ⏱️ Timeout: 5 minutos
  💓 Ping cada: 20 segundos
  
  ✅ Servidor listo
  `);
});