// src/services/socket.service.js
// ─────────────────────────────────────────────────────────────────────────────
// Socket Service — Handles real-time communication between server and frontend.
// Primarily used for streaming live build logs.
// ─────────────────────────────────────────────────────────────────────────────

let io;

const init = (server) => {
  const { Server } = require('socket.io');
  io = new Server(server, {
    cors: {
      origin: "*", // In production, restrict this to your frontend URL
      methods: ["GET", "POST"]
    }
  });

  io.on('connection', (socket) => {
    console.log('🔌 Client connected to logs:', socket.id);

    // Clients can "join" a room for a specific build ID
    socket.on('join-build', (buildId) => {
      socket.join(`build-${buildId}`);
      console.log(`👤 Client joined room for build: ${buildId}`);
    });

    socket.on('disconnect', () => {
      console.log('🔌 Client disconnected');
    });
  });

  return io;
};

// Emit a log line to a specific build's room
const emitLog = (buildId, logLine) => {
  if (io) {
    io.to(`build-${buildId}`).emit('log', logLine);
  }
};

// Emit a status change event
const emitStatusChange = (buildId, status) => {
  if (io) {
    io.to(`build-${buildId}`).emit('status-change', { buildId, status });
  }
};

module.exports = {
  init,
  emitLog,
  emitStatusChange
};
