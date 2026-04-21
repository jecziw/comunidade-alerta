module.exports = {
  port: Number(process.env.PORT || 3000),
  databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@db:5432/comunidade_alerta'
};
