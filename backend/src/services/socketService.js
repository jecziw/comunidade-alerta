const jwt = require('jsonwebtoken');
const env = require('../config/env');

let io;

function initSocketService(server) {
  const { Server } = require('socket.io');
  io = new Server(server, { cors:{ origin:'*', methods:['GET','POST'] }, transports:['websocket','polling'] });

  // ── Autenticação do socket ──────────────────────────────────
  // Valida o JWT e deriva o tenant do PRÓPRIO TOKEN (não do que o
  // cliente mandar). Sem isso, qualquer um entraria na sala de
  // qualquer tenant e receberia os eventos dele (IDOR via WebSocket).
  io.use((socket, next) => {
    const h = socket.handshake || {};
    const token =
      (h.auth && h.auth.token) ||
      ((h.headers && h.headers.authorization) || '').replace(/^Bearer\s+/i, '') ||
      (h.query && h.query.token);
    if (!token) return next(new Error('unauthorized'));
    try {
      const decoded = jwt.verify(token, env.jwt.secret);
      socket.data.userId   = decoded.userId;
      socket.data.tenantId = decoded.tenantId;
      return next();
    } catch (_) {
      return next(new Error('unauthorized'));
    }
  });

  io.on('connection', socket => {
    // Entra automaticamente APENAS na sala do próprio tenant (vinda do JWT).
    if (socket.data.tenantId) socket.join(`tenant:${socket.data.tenantId}`);
  });

  console.log('[socket] Socket.io inicializado (autenticado por JWT)');
  return io;
}

function emitToTenant(tenantId, event, data) { if (io) io.to(`tenant:${tenantId}`).emit(event, data); }
function emitToAll(event, data) { if (io) io.emit(event, data); }

module.exports = { initSocketService, emitToTenant, emitToAll };
