const jwt = require('jsonwebtoken');
const env = require('../config/env');

let io;

function initSocketService(server) {
  const { Server } = require('socket.io');
  io = new Server(server, { cors:{ origin:'*', methods:['GET','POST'] }, transports:['websocket','polling'] });

  // ── Autenticação do socket ──────────────────────────────────
  // A conexão é SEMPRE permitida: o cidadão anônimo pode ouvir apenas a sala
  // pública ('public'). Se houver token JWT válido, marcamos o tenant para que
  // o socket entre TAMBÉM na sala privada dele. O tenant vem do PRÓPRIO TOKEN,
  // nunca do cliente — isso preserva o isolamento (sem IDOR via WebSocket):
  // um socket sem token válido nunca entra em nenhuma sala 'tenant:*'.
  io.use((socket, next) => {
    const h = socket.handshake || {};
    const token =
      (h.auth && h.auth.token) ||
      ((h.headers && h.headers.authorization) || '').replace(/^Bearer\s+/i, '') ||
      (h.query && h.query.token);
    if (token) {
      try {
        const decoded = jwt.verify(token, env.jwt.secret);
        socket.data.userId   = decoded.userId;
        socket.data.tenantId = decoded.tenantId;
      } catch (_) { /* token inválido → tratado como anônimo (só sala pública) */ }
    }
    return next();
  });

  io.on('connection', socket => {
    socket.join('public');                                              // todos: alertas públicos
    if (socket.data.tenantId) socket.join(`tenant:${socket.data.tenantId}`); // só com token válido: sala privada
  });

  console.log('[socket] Socket.io inicializado (sala pública + tenant por JWT)');
  return io;
}

function emitToTenant(tenantId, event, data) { if (io) io.to(`tenant:${tenantId}`).emit(event, data); }
function emitToAll(event, data) { if (io) io.emit(event, data); }
function emitPublic(event, data) { if (io) io.to('public').emit(event, data); }

module.exports = { initSocketService, emitToTenant, emitToAll, emitPublic };
