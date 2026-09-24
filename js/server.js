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

const inserir = db.prepare(`
  INSERT INTO agendamentos (nome, nascimento, telefone, data_consulta)
  VALUES (@nome, @nascimento, @telefone, @data_consulta)
`);

// Valida se a string ISO (AAAA-MM-DD) é uma data válida no calendário (ex: rejeita 31/02)
const dataValida = (s) => {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

// Converte "DD/MM/AAAA" para "AAAA-MM-DD"
const normalizarNascimento = (s) => {
  if (typeof s !== 'string') return null;
  const str = s.trim();
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) {
    const [dia, mes, ano] = str.split('/');
    return `${ano}-${mes}-${dia}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }
  return null;
};

// Converte "DD/MM" para "AAAA-MM-DD" (atribuindo o ano atual ou próximo ano)
const normalizarDataConsulta = (s) => {
  if (typeof s !== 'string') return null;
  const str = s.trim();
  if (/^\d{2}\/\d{2}$/.test(str)) {
    const [dia, mes] = str.split('/');
    const hojeObj = new Date();
    let ano = hojeObj.getFullYear();
    let dataFormatada = `${ano}-${mes}-${dia}`;
    const hojeStr = hojeObj.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

    // Se o dia/mês introduzido já passou este ano, assume o ano seguinte
    if (dataFormatada < hojeStr) {
      ano += 1;
      dataFormatada = `${ano}-${mes}-${dia}`;
    }
    return dataFormatada;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }
  return null;
};

app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/agendamentos', (req, res) => {
  const { nome, nascimento, telefone, data_consulta } = req.body || {};
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const nomeLimpo = String(nome || '').trim();
  const tel = String(telefone || '').replace(/\D/g, '');

  const nascimentoISO = normalizarNascimento(nascimento);
  const consultaISO = normalizarDataConsulta(data_consulta);

  let erro = null;
  if (nomeLimpo.length < 3 || nomeLimpo.length > 120) {
    erro = 'Informe seu nome completo.';
  } else if (!nascimentoISO || !dataValida(nascimentoISO) || nascimentoISO < '1900-01-01' || nascimentoISO > hoje) {
    erro = 'Data de nascimento inválida. Use o formato DD/MM/AAAA.';
  } else if (tel.length < 10 || tel.length > 13) {
    erro = 'Informe um telefone válido, com DDD.';
  } else if (!consultaISO || !dataValida(consultaISO) || consultaISO < hoje) {
    erro = 'Data da consulta inválida. Use o formato DD/MM (ex: 27/09).';
  }

  if (erro) return res.status(400).json({ erro });

  try {
    const { lastInsertRowid } = inserir.run({
      nome: nomeLimpo,
      nascimento: nascimentoISO,
      telefone: tel,
      data_consulta: consultaISO,
    });
    res.status(201).json({ id: lastInsertRowid });
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: 'Não foi possível salvar. Tente novamente em instantes.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Rodando em http://localhost:${PORT}/cliente.html`));