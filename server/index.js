const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  pingTimeout: 120000,
  pingInterval: 30000
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

const rooms = new Map();

io.on('connection', (socket) => {
  console.log('🟢 Cliente conectado:', socket.id);

  socket.on('broadcaster-join', (roomId) => {
    socket.join(roomId);
    rooms.set(roomId, {
      broadcaster: socket.id,
      viewers: new Set(),
      createdAt: new Date()
    });
    socket.emit('broadcaster-ready');
    console.log(`📡 Broadcaster ${socket.id} en sala ${roomId}`);
  });

  socket.on('viewer-join', (roomId) => {
    const room = rooms.get(roomId);
    if (room && room.broadcaster) {
      socket.join(roomId);
      room.viewers.add(socket.id);
      
      io.to(room.broadcaster).emit('viewer-joined', {
        viewerId: socket.id,
        totalViewers: room.viewers.size
      });
      
      socket.emit('room-joined', {
        roomId,
        broadcasterId: room.broadcaster
      });
      
      io.to(roomId).emit('viewers-update', {
        total: room.viewers.size
      });
      
      console.log(`👁️ Viewer ${socket.id} unido a ${roomId} (total: ${room.viewers.size})`);
    } else {
      socket.emit('room-error', 'Sala no encontrada');
    }
  });

  socket.on('offer', (data) => {
    io.to(data.target).emit('offer', {
      offer: data.offer,
      from: socket.id
    });
  });

  socket.on('answer', (data) => {
    io.to(data.target).emit('answer', {
      answer: data.answer,
      from: socket.id
    });
  });

  socket.on('ice-candidate', (data) => {
    io.to(data.target).emit('ice-candidate', {
      candidate: data.candidate,
      from: socket.id
    });
  });

  socket.on('stop-broadcast', (roomId) => {
    const room = rooms.get(roomId);
    if (room && room.broadcaster === socket.id) {
      io.to(roomId).emit('broadcast-ended');
      rooms.delete(roomId);
      console.log(`🛑 Broadcast detenido en ${roomId}`);
    }
  });

  socket.on('disconnect', () => {
    console.log('🔴 Desconectado:', socket.id);
    
    for (const [roomId, room] of rooms.entries()) {
      if (room.broadcaster === socket.id) {
        io.to(roomId).emit('broadcaster-disconnected');
        rooms.delete(roomId);
        break;
      }
      
      if (room.viewers.has(socket.id)) {
        room.viewers.delete(socket.id);
        io.to(room.broadcaster).emit('viewer-left', {
          viewerId: socket.id,
          totalViewers: room.viewers.size
        });
        io.to(roomId).emit('viewers-update', {
          total: room.viewers.size
        });
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`
  🚀 SERVIDOR FINAL
  ═════════════════
  📡 Puerto: ${PORT}
  ✅ Pantalla completa incluida
  ✅ Optimizado para múltiples viewers
  `);
});