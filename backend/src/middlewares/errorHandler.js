function errorHandler(err, req, res, next) {
  console.error('[error]', err.stack || err.message);
  const status  = err.status || err.statusCode || 500;
  const message = process.env.NODE_ENV === 'production' && status === 500
    ? 'Erro interno do servidor.' : err.message || 'Erro interno.';
  res.status(status).json({ error: message, ...(err.code && { code: err.code }) });
}
module.exports = { errorHandler };
