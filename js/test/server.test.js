const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');

const loadApp = (environment) => {
  for (const key of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'ADMIN_PASSWORD']) delete process.env[key];
  Object.assign(process.env, environment);
  delete require.cache[require.resolve('../server')];
  return require('../server');
};

const withServer = async (app, run) => {
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
};

test('bloqueia agendamentos sem Supabase configurado', async () => {
  await withServer(loadApp({}), async (url) => {
    const response = await fetch(`${url}/api/agendamentos`, { method: 'POST' });
    assert.equal(response.status, 503);
  });
});

test('rejeita atestado fora dos formatos aceitos', async () => {
  const app = loadApp({
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-key',
  });
  await withServer(app, async (url) => {
    const body = new FormData();
    body.set('atestado', new Blob(['conteudo'], { type: 'text/plain' }), 'atestado.txt');
    const response = await fetch(`${url}/api/agendamentos`, { method: 'POST', body });
    assert.equal(response.status, 400);
  });
});
