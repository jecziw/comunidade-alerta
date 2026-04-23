const request = require('supertest');
const app = require('../src/app');

jest.mock('../src/db');
const { pool } = require('../src/db');

// Dados de exemplo reutilizados nos testes.
// Definir fixtures aqui evita repetição e deixa claro
// qual é o "contrato" de dados que a API deve respeitar.
const alertaExemplo = {
  id: 1,
  title: 'Veículo suspeito',
  description: 'Carro circulando devagar na rua principal',
  neighborhood: 'Leblon',
  severity: 'medium',
  status: 'open',
  created_at: new Date().toISOString()
};

const payloadValido = {
  title: 'Veículo suspeito',
  description: 'Carro circulando devagar na rua principal',
  neighborhood: 'Leblon',
  severity: 'medium',
  status: 'open'
};

// ─── GET /api/alerts ────────────────────────────────────────────────────────
describe('GET /api/alerts', () => {

  beforeEach(() => jest.clearAllMocks());

  it('retorna status 200 e um array de alertas', async () => {
    // Simula o retorno do SELECT * FROM alerts
    pool.query.mockResolvedValue({ rows: [alertaExemplo] });

    const response = await request(app).get('/api/alerts');

    expect(response.status).toBe(200);

    // A API envolve os dados em { data: [...] }
    expect(response.body).toHaveProperty('data');
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.data).toHaveLength(1);
  });

  it('retorna array vazio quando não há alertas', async () => {
    pool.query.mockResolvedValue({ rows: [] });

    const response = await request(app).get('/api/alerts');

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(0);
  });

  it('retorna os campos esperados em cada alerta', async () => {
    pool.query.mockResolvedValue({ rows: [alertaExemplo] });

    const response = await request(app).get('/api/alerts');

    const alerta = response.body.data[0];

    // Garante que os campos essenciais estão presentes
    expect(alerta).toHaveProperty('id');
    expect(alerta).toHaveProperty('title');
    expect(alerta).toHaveProperty('neighborhood');
    expect(alerta).toHaveProperty('severity');
    expect(alerta).toHaveProperty('status');
  });

  it('retorna status 500 quando o banco falha', async () => {
    pool.query.mockRejectedValue(new Error('Database error'));

    const response = await request(app).get('/api/alerts');

    expect(response.status).toBe(500);
    expect(response.body).toHaveProperty('message');
  });
});

// ─── POST /api/alerts ───────────────────────────────────────────────────────
describe('POST /api/alerts', () => {

  beforeEach(() => jest.clearAllMocks());

  it('cria um alerta com payload válido e retorna status 201', async () => {
    // Simula o INSERT ... RETURNING *
    pool.query.mockResolvedValue({ rows: [{ ...alertaExemplo, id: 99 }] });

    const response = await request(app)
      .post('/api/alerts')
      .send(payloadValido)
      .set('Content-Type', 'application/json');

    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty('data');
    expect(response.body.data).toHaveProperty('id');
  });

  it('passa os valores corretos para o banco', async () => {
    pool.query.mockResolvedValue({ rows: [alertaExemplo] });

    await request(app)
      .post('/api/alerts')
      .send(payloadValido)
      .set('Content-Type', 'application/json');

    // Verifica que o pool.query foi chamado com os valores certos
    const chamada = pool.query.mock.calls[0];
    const valoresPassados = chamada[1]; // segundo argumento = array de valores

    expect(valoresPassados[0]).toBe(payloadValido.title);
    expect(valoresPassados[2]).toBe(payloadValido.neighborhood);
    expect(valoresPassados[3]).toBe(payloadValido.severity);
    expect(valoresPassados[4]).toBe(payloadValido.status);
  });

  // Os próximos testes verificam validação: campos obrigatórios ausentes
  // devem retornar 400 (Bad Request), nunca 500

  it('retorna 400 quando title está ausente', async () => {
    const { title, ...semTitle } = payloadValido;

    const response = await request(app)
      .post('/api/alerts')
      .send(semTitle);

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('message');

    // O banco NÃO deve ser chamado se a validação falhou
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('retorna 400 quando neighborhood está ausente', async () => {
    const { neighborhood, ...semNeighborhood } = payloadValido;

    const response = await request(app)
      .post('/api/alerts')
      .send(semNeighborhood);

    expect(response.status).toBe(400);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('retorna 400 quando severity está ausente', async () => {
    const { severity, ...semSeverity } = payloadValido;

    const response = await request(app)
      .post('/api/alerts')
      .send(semSeverity);

    expect(response.status).toBe(400);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('retorna 400 quando status está ausente', async () => {
    const { status, ...semStatus } = payloadValido;

    const response = await request(app)
      .post('/api/alerts')
      .send(semStatus);

    expect(response.status).toBe(400);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('retorna 400 quando o body está completamente vazio', async () => {
    const response = await request(app)
      .post('/api/alerts')
      .send({});

    expect(response.status).toBe(400);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('retorna 500 quando o banco falha durante a criação', async () => {
    pool.query.mockRejectedValue(new Error('Connection lost'));

    const response = await request(app)
      .post('/api/alerts')
      .send(payloadValido);

    expect(response.status).toBe(500);
  });
});
