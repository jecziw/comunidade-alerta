// Este arquivo substitui src/db/index.js durante os testes.
// O Jest encontra este mock automaticamente quando um teste chama
// jest.mock('../src/db') ou jest.mock('../../src/db').
//
// pool.query é uma "jest.fn()" — uma função falsa que:
//   - registra quantas vezes foi chamada e com quais argumentos
//   - permite que cada teste defina o que ela vai retornar
//     usando mockResolvedValue() ou mockRejectedValue()

const pool = {
  query: jest.fn()
};

// initDb não precisa fazer nada nos testes
async function initDb() {}

module.exports = { pool, initDb };
