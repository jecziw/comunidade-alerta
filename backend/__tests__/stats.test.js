const request = require('supertest');
const app = require('../src/app');

jest.mock('../src/db');
const { pool } = require('../src/db');

// O endpoint /api/stats faz 3 queries em paralelo (Promise.all).
// O mock precisa retornar respostas diferentes para cada chamada.
// mockResolvedValueOnce() define o retorno para a PRÓXIMA chamada apenas —
// a primeira chamada retorna o primeiro valor, a segunda o segundo, etc.

describe('GET /api/stats', () => {

  beforeEach(() => jest.clearAllMocks());

  it('retorna status 200 com os campos corretos', async () => {
    // Simula as 3 queries em ordem:
    // 1) SELECT COUNT(*) AS total FROM alerts
    pool.query.mockResolvedValueOnce({ rows: [{ total: 42 }] });
    // 2) SELECT COUNT(*) AS total FROM alerts WHERE severity = 'critical'
    pool.query.mockResolvedValueOnce({ rows: [{ total: 5 }] });
    // 3) SELECT COUNT(DISTINCT neighborhood) AS total FROM alerts
    pool.query.mockResolvedValueOnce({ rows: [{ total: 3 }] });

    const response = await request(app).get('/api/stats');

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('totalAlerts');
    expect(response.body).toHaveProperty('criticalAlerts');
    expect(response.body).toHaveProperty('neighborhoods');
    expect(response.body).toHaveProperty('updatedAt');
  });

  it('retorna os valores numéricos corretos', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ total: 100 }] });
    pool.query.mockResolvedValueOnce({ rows: [{ total: 12 }] });
    pool.query.mockResolvedValueOnce({ rows: [{ total: 4 }] });

    const response = await request(app).get('/api/stats');

    expect(response.body.totalAlerts).toBe(100);
    expect(response.body.criticalAlerts).toBe(12);
    expect(response.body.neighborhoods).toBe(4);
  });

  it('faz exatamente 3 queries ao banco', async () => {
    pool.query.mockResolvedValue({ rows: [{ total: 0 }] });

    await request(app).get('/api/stats');

    // Promise.all dispara 3 queries simultâneas
    expect(pool.query).toHaveBeenCalledTimes(3);
  });

  it('updatedAt é um timestamp ISO válido', async () => {
    pool.query.mockResolvedValue({ rows: [{ total: 0 }] });

    const response = await request(app).get('/api/stats');

    const ts = response.body.updatedAt;
    expect(ts).toBeDefined();
    // new Date de uma string ISO inválida retorna "Invalid Date"
    expect(new Date(ts).toString()).not.toBe('Invalid Date');
  });

  it('retorna status 500 quando o banco falha', async () => {
    pool.query.mockRejectedValue(new Error('Timeout'));

    const response = await request(app).get('/api/stats');

    expect(response.status).toBe(500);
  });

  it('retorna zeros quando não há alertas', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ total: 0 }] });
    pool.query.mockResolvedValueOnce({ rows: [{ total: 0 }] });
    pool.query.mockResolvedValueOnce({ rows: [{ total: 0 }] });

    const response = await request(app).get('/api/stats');

    expect(response.body.totalAlerts).toBe(0);
    expect(response.body.criticalAlerts).toBe(0);
    expect(response.body.neighborhoods).toBe(0);
  });
});
