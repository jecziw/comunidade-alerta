const request = require('supertest');
const app = require('../src/app');

describe('GET /api/health', () => {
  it('retorna 200 com status ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'ok');
  });
  it('retorna timestamp válido', async () => {
    const res = await request(app).get('/api/health');
    expect(new Date(res.body.ts)).toBeInstanceOf(Date);
  });
  it('Content-Type é JSON', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['content-type']).toMatch(/json/);
  });
});
