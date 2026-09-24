const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const db = new Database(path.join(__dirname, 'agendamentos.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS agendamentos (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    nome          TEXT NOT NULL,
    nascimento    TEXT NOT NULL,   -- AAAA-MM-DD
    telefone      TEXT NOT NULL,   -- só dígitos
    data_consulta TEXT NOT NULL,   -- AAAA-MM-DD
    criado_em     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);

// Consulta preparada: os valores nunca são concatenados no SQL (evita SQL injection)
const inserir = db.prepare(`
  INSERT INTO agendamentos (nome, nascimento, telefone, data_consulta)
  VALUES (@nome, @nascimento, @telefone, @data_consulta)
`);

const dataValida = (s) => {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !isNaN(d) && d.toISOString().slice(0, 10) === s; // rejeita 31/02 etc.
};

app.use(express.json({ limit: '10kb' }));
// Só a pasta public é exposta; o arquivo .db fica fora do alcance do navegador
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/agendamentos', (req, res) => {
  const { nome, nascimento, telefone, data_consulta } = req.body || {};
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const nomeLimpo = String(nome || '').trim();
  const tel = String(telefone || '').replace(/\D/g, '');

  let erro = null;
  if (nomeLimpo.length < 3 || nomeLimpo.length > 120) {
    erro = 'Informe seu nome completo.';
  } else if (!dataValida(nascimento) || nascimento < '1900-01-01' || nascimento > hoje) {
    erro = 'Data de nascimento inválida. Use o formato DD/MM/AAAA.';
  } else if (tel.length < 10 || tel.length > 13) {
    erro = 'Informe um telefone válido, com DDD.';
  } else if (!dataValida(data_consulta) || data_consulta < hoje) {
    erro = 'Escolha no calendário a data da consulta.';
  }
  if (erro) return res.status(400).json({ erro });

  try {
    const { lastInsertRowid } = inserir.run({
      nome: nomeLimpo,
      nascimento,
      telefone: tel,
      data_consulta,
    });
    res.status(201).json({ id: lastInsertRowid });
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: 'Não foi possível salvar. Tente novamente em instantes.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Rodando em http://localhost:${PORT}/cliente.html`));