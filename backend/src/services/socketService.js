let io;
function initSocketService(server) {
  const { Server } = require('socket.io');
  io = new Server(server, { cors:{ origin:'*', methods:['GET','POST'] }, transports:['websocket','polling'] });
  io.on('connection', socket => {
    socket.on('join:tenant', tenantId => socket.join(`tenant:${tenantId}`));
  });
  console.log('[socket] Socket.io inicializado');
  return io;
}
function emitToTenant(tenantId, event, data) { if (io) io.to(`tenant:${tenantId}`).emit(event,data); }
function emitToAll(event, data) { if (io) io.emit(event,data); }
module.exports = { initSocketService, emitToTenant, emitToAll };
