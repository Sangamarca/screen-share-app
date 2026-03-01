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

// Almacenar salas activas
const rooms = new Map();

io.on('connection', (socket) => {
  console.log('🟢 Cliente conectado:', socket.id);

  // Unirse como broadcaster (transmisor)
  socket.on('broadcaster-join', (roomId) => {
    console.log(`📡 Broadcaster ${socket.id} en sala: ${roomId}`);
    
    // Dejar salas anteriores
    socket.rooms.forEach(room => {
      if (room !== socket.id) socket.leave(room);
    });
    
    socket.join(roomId);
    
    // Guardar información del broadcaster
    rooms.set(roomId, {
      broadcaster: socket.id,
      viewers: new Set(),
      createdAt: new Date()
    });
    
    socket.emit('broadcaster-ready');
    console.log(`✅ Broadcaster listo en sala ${roomId}`);
  });

  // Unirse como viewer (espectador)
  socket.on('viewer-join', (roomId) => {
    console.log(`👁️ Viewer ${socket.id} intentando unirse a sala: ${roomId}`);
    
    const room = rooms.get(roomId);
    
    if (room && room.broadcaster) {
      // Unir al viewer a la sala
      socket.join(roomId);
      room.viewers.add(socket.id);
      
      console.log(`✅ Viewer ${socket.id} unido a sala ${roomId}. Total viewers: ${room.viewers.size}`);
      
      // NOTIFICAR AL BROADCASTER - ESTO ES CRÍTICO
      io.to(room.broadcaster).emit('viewer-joined', {
        viewerId: socket.id,
        totalViewers: room.viewers.size
      });
      
      // Confirmar al viewer
      socket.emit('room-joined', {
        roomId,
        broadcasterId: room.broadcaster
      });
      
      // Actualizar lista de viewers
      io.to(roomId).emit('viewers-update', {
        total: room.viewers.size
      });
      
    } else {
      console.log(`❌ Sala ${roomId} no encontrada o sin broadcaster`);
      socket.emit('room-error', 'La sala no existe o no hay transmisión activa');
    }
  });

  // Manejar oferta WebRTC
  socket.on('offer', (data) => {
    console.log(`📤 Oferta de ${socket.id} para ${data.target}`);
    io.to(data.target).emit('offer', {
      offer: data.offer,
      from: socket.id
    });
  });

  // Manejar respuesta WebRTC
  socket.on('answer', (data) => {
    console.log(`📥 Respuesta de ${socket.id} para ${data.target}`);
    io.to(data.target).emit('answer', {
      answer: data.answer,
      from: socket.id
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
      io.to(roomId).emit('broadcast-ended');
      rooms.delete(roomId);
    }
  });

  // Manejar desconexión
  socket.on('disconnect', () => {
    console.log('🔴 Cliente desconectado:', socket.id);
    
    // Buscar si era broadcaster
    for (const [roomId, room] of rooms.entries()) {
      if (room.broadcaster === socket.id) {
        console.log(`📡 Broadcaster ${socket.id} desconectado de sala ${roomId}`);
        io.to(roomId).emit('broadcaster-disconnected');
        rooms.delete(roomId);
        break;
      }
      
      // Si era viewer, quitarlo
      if (room.viewers.has(socket.id)) {
        room.viewers.delete(socket.id);
        console.log(`👁️ Viewer ${socket.id} removido de sala ${roomId}`);
        
        // Notificar al broadcaster
        io.to(room.broadcaster).emit('viewer-left', {
          viewerId: socket.id,
          totalViewers: room.viewers.size
        });
        
        // Actualizar lista
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
  🚀 SERVIDOR INICIADO
  ════════════════════
  📡 Puerto: ${PORT}
  ✅ Servidor listo
  `);
});