const request = require('supertest');
const app = require('../src/app');
const { pool } = require('../src/db');
let token;

beforeAll(async () => {
  const res = await request(app).post('/api/auth/register')
    .send({ name:'Test', email:'alerts@test.com', password:'Senha@123', orgName:'TestOrg' });
  token = res.body.token;
});
afterAll(async () => { await pool.query("DELETE FROM tenants WHERE name='TestOrg'"); await pool.end(); });

describe('POST /api/alerts', () => {
  it('cria alerta autenticado', async () => {
    const res = await request(app).post('/api/alerts').set('Authorization',`Bearer ${token}`)
      .send({ type:'crime', description:'Teste', location:'Centro' });
    expect(res.status).toBe(201);
    expect(res.body.alert).toHaveProperty('id');
  });
  it('rejeita sem token', async () => {
    const res = await request(app).post('/api/alerts').send({ type:'crime', description:'x' });
    expect(res.status).toBe(401);
  });
  it('rejeita sem description', async () => {
    const res = await request(app).post('/api/alerts').set('Authorization',`Bearer ${token}`).send({ type:'crime' });
    expect(res.status).toBe(400);
  });
  it('aceita tipo feminicidio', async () => {
    const res = await request(app).post('/api/alerts').set('Authorization',`Bearer ${token}`)
      .send({ type:'feminicidio', description:'Ocorrência', location:'Palhoça' });
    expect(res.status).toBe(201);
  });
});

describe('GET /api/alerts', () => {
  it('lista alertas', async () => {
    const res = await request(app).get('/api/alerts').set('Authorization',`Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.alerts)).toBe(true);
  });
  it('filtra por status', async () => {
    const res = await request(app).get('/api/alerts?status=open').set('Authorization',`Bearer ${token}`);
    expect(res.status).toBe(200);
    res.body.alerts.forEach(a => expect(a.status).toBe('open'));
  });
  it('retorna paginação', async () => {
    const res = await request(app).get('/api/alerts?page=1&limit=5').set('Authorization',`Bearer ${token}`);
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('page', 1);
  });
  it('rejeita sem tenant', async () => {
    const res = await request(app).get('/api/alerts');
    expect([400,401]).toContain(res.status);
  });
});

describe('PATCH /api/alerts/:id/status', () => {
  it('atualiza status open → progress', async () => {
    const create = await request(app).post('/api/alerts').set('Authorization',`Bearer ${token}`)
      .send({ type:'infra', description:'Workflow test' });
    const res = await request(app).patch(`/api/alerts/${create.body.alert.id}/status`)
      .set('Authorization',`Bearer ${token}`).send({ status:'progress', note:'Em análise' });
    expect(res.status).toBe(200);
    expect(res.body.alert.status).toBe('progress');
  });
  it('rejeita transição inválida', async () => {
    const create = await request(app).post('/api/alerts').set('Authorization',`Bearer ${token}`)
      .send({ type:'furto', description:'Teste transição' });
    const res = await request(app).patch(`/api/alerts/${create.body.alert.id}/status`)
      .set('Authorization',`Bearer ${token}`).send({ status:'resolved' });
    expect(res.status).toBe(400);
  });
});
