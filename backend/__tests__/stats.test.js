const request = require('supertest');
const app = require('../src/app');
const { pool } = require('../src/db');
let token;

beforeAll(async () => {
  const res = await request(app).post('/api/auth/register')
    .send({ name:'Stats', email:'stats@test.com', password:'Senha@123', orgName:'StatsOrg' });
  token = res.body.token;
  for (const type of ['crime','transito','infra','furto','feminicidio']) {
    await request(app).post('/api/alerts').set('Authorization',`Bearer ${token}`)
      .send({ type, description:`Alerta de ${type}` });
  }
});
afterAll(async () => { await pool.query("DELETE FROM tenants WHERE name='StatsOrg'"); await pool.end(); });

describe('GET /api/stats', () => {
  it('retorna totais', async () => {
    const res = await request(app).get('/api/stats').set('Authorization',`Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.totals).toHaveProperty('total');
  });
  it('retorna byType com feminicidio', async () => {
    const res = await request(app).get('/api/stats').set('Authorization',`Bearer ${token}`);
    const types = res.body.byType.map(t => t.type);
    expect(types).toContain('feminicidio');
  });
  it('retorna byStatus', async () => {
    const res = await request(app).get('/api/stats').set('Authorization',`Bearer ${token}`);
    expect(Array.isArray(res.body.byStatus)).toBe(true);
  });
  it('retorna trend de 7 dias', async () => {
    const res = await request(app).get('/api/stats').set('Authorization',`Bearer ${token}`);
    expect(Array.isArray(res.body.trend)).toBe(true);
  });
  it('retorna bySource', async () => {
    const res = await request(app).get('/api/stats').set('Authorization',`Bearer ${token}`);
    expect(Array.isArray(res.body.bySource)).toBe(true);
  });
  it('total >= 5', async () => {
    const res = await request(app).get('/api/stats').set('Authorization',`Bearer ${token}`);
    expect(parseInt(res.body.totals.total)).toBeGreaterThanOrEqual(5);
  });
  it('rejeita sem auth', async () => {
    const res = await request(app).get('/api/stats');
    expect(res.status).toBe(401);
  });
  it('totals.open é número', async () => {
    const res = await request(app).get('/api/stats').set('Authorization',`Bearer ${token}`);
    expect(Number.isInteger(parseInt(res.body.totals.open))).toBe(true);
  });
  it('resolved >= 0', async () => {
    const res = await request(app).get('/api/stats').set('Authorization',`Bearer ${token}`);
    expect(parseInt(res.body.totals.resolved)).toBeGreaterThanOrEqual(0);
  });
  it('resposta < 500ms', async () => {
    const t = Date.now();
    await request(app).get('/api/stats').set('Authorization',`Bearer ${token}`);
    expect(Date.now()-t).toBeLessThan(500);
  });
});
