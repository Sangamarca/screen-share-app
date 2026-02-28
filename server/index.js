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
  // SOLO ESTO - timeouts altos
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
  console.log('🟢 Conectado:', socket.id);

  socket.on('broadcaster-join', (roomId) => {
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
    rooms.delete(roomId);
  });

  socket.on('disconnect', () => {
    console.log('🔴 Desconectado:', socket.id);
    for (const [roomId, room] of rooms.entries()) {
      if (room.broadcaster === socket.id) {
        rooms.delete(roomId);
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor en puerto ${PORT}`);
});