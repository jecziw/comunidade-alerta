// Supertest recebe o app do Express e cria um servidor temporário
// só para a duração do teste — sem ocupar nenhuma porta real.
const request = require('supertest');
const app = require('../src/app');

// Diz ao Jest: substitua ../src/db pelo mock que criamos em __mocks__/db.js
jest.mock('../src/db');

// Importa o mock para poder controlar o que pool.query retorna
const { pool } = require('../src/db');

// "describe" agrupa testes relacionados — aparece no relatório final
describe('GET /api/health', () => {

  // "beforeEach" roda antes de cada teste individual
  // Limpa o histórico de chamadas do mock para que um teste
  // não influencie o resultado do próximo
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // "it" (ou "test") define um caso de teste individual.
  // O nome deve descrever o comportamento esperado em linguagem simples.
  it('retorna status 200 e status ok quando o banco está disponível', async () => {
    // Configura o mock: quando pool.query for chamada, simula sucesso do banco
    pool.query.mockResolvedValue({ rows: [{ '?column?': 1 }] });

    // Faz a requisição HTTP usando o Supertest
    const response = await request(app).get('/api/health');

    // "expect" faz as asserções — verifica se o resultado é o esperado
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
    expect(response.body.database).toBe('up');

    // Garante que o endpoint de fato consultou o banco (SELECT 1)
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it('retorna status 503 quando o banco está indisponível', async () => {
    // Simula uma falha na conexão com o banco
    pool.query.mockRejectedValue(new Error('Connection refused'));

    const response = await request(app).get('/api/health');

    expect(response.status).toBe(503);
    expect(response.body.status).toBe('degraded');
    expect(response.body.database).toBe('down');
  });

  it('sempre inclui o campo timestamp na resposta', async () => {
    pool.query.mockResolvedValue({ rows: [] });

    const response = await request(app).get('/api/health');

    // Verifica que o campo existe e é uma string ISO válida
    expect(response.body.timestamp).toBeDefined();
    expect(new Date(response.body.timestamp).toISOString()).toBe(response.body.timestamp);
  });
});
