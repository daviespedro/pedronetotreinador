require('dotenv').config();

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const cors = require('cors'); // 1. IMPORTAR O CORS AQUI

const app = express();

// 2. ATIVAR O CORS ANTES DAS ROTAS
app.use(cors()); 

const db = new Database(path.join(__dirname, 'agendamentos.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS agendamentos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    nascimento TEXT NOT NULL,
    telefone TEXT NOT NULL,
    data_consulta TEXT NOT NULL,
    criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);

const inserir = db.prepare(`
  INSERT INTO agendamentos
    (nome, nascimento, telefone, data_consulta)
  VALUES
    (@nome, @nascimento, @telefone, @data_consulta)
`);

const listarAgendamentos = db.prepare(`
  SELECT id, nome, nascimento, telefone, data_consulta, criado_em
  FROM agendamentos
  ORDER BY data_consulta ASC, criado_em DESC, id DESC
`);

function hojeSaoPauloISO() {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());

  const valores = Object.fromEntries(
    partes
      .filter(({ type }) => type !== 'literal')
      .map(({ type, value }) => [type, value])
  );

  return `${valores.year}-${valores.month}-${valores.day}`;
}

function dataValida(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return false;
  }

  const [ano, mes, dia] = s.split('-').map(Number);
  const d = new Date(Date.UTC(ano, mes - 1, dia));

  return (
    d.getUTCFullYear() === ano &&
    d.getUTCMonth() === mes - 1 &&
    d.getUTCDate() === dia
  );
}

function normalizarNascimento(s) {
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
}

function normalizarDataConsulta(s) {
  if (typeof s !== 'string') return null;

  const str = s.trim();
  const hoje = hojeSaoPauloISO();

  if (/^\d{2}\/\d{2}$/.test(str)) {
    const [dia, mes] = str.split('/');
    let ano = Number(hoje.slice(0, 4));
    let dataFormatada = `${ano}-${mes}-${dia}`;

    if (dataFormatada < hoje) {
      ano += 1;
      dataFormatada = `${ano}-${mes}-${dia}`;
    }

    return dataFormatada;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }

  return null;
}

function senhaAdminValida(req) {
  const senhaConfigurada = process.env.ADMIN_PASSWORD;
  const autorizacao = String(req.headers.authorization || '');

  if (!senhaConfigurada) return false;
  if (!autorizacao.startsWith('Bearer ')) return false;

  const senhaRecebida = autorizacao.slice(7).trim();
  return senhaRecebida === senhaConfigurada;
}

app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/agendamentos', (req, res) => {
  try {
    const { nome, nascimento, telefone, data_consulta } = req.body || {};

    const hoje = hojeSaoPauloISO();
    const nomeLimpo = String(nome || '').trim();
    const tel = String(telefone || '').replace(/\D/g, '');

    const nascimentoISO = normalizarNascimento(nascimento);
    const consultaISO = normalizarDataConsulta(data_consulta);

    let erro = null;

    if (nomeLimpo.length < 3 || nomeLimpo.length > 120) {
      erro = 'Informe seu nome completo.';
    } else if (
      !nascimentoISO ||
      !dataValida(nascimentoISO) ||
      nascimentoISO < '1900-01-01' ||
      nascimentoISO > hoje
    ) {
      erro = 'Data de nascimento inválida. Use o formato DD/MM/AAAA.';
    } else if (tel.length < 10 || tel.length > 13) {
      erro = 'Informe um telefone válido, com DDD.';
    } else if (
      !consultaISO ||
      !dataValida(consultaISO) ||
      consultaISO < hoje
    ) {
      erro = 'Data da consulta inválida. Escolha uma data de hoje em diante.';
    }

    if (erro) {
      return res.status(400).json({ erro });
    }

    const resultado = inserir.run({
      nome: nomeLimpo,
      nascimento: nascimentoISO,
      telefone: tel,
      data_consulta: consultaISO
    });

    return res.status(201).json({
      ok: true,
      id: Number(resultado.lastInsertRowid),
      data_consulta: consultaISO
    });
  } catch (e) {
    console.error('ERRO AO AGENDAR:', e);
    return res.status(500).json({
      erro: 'Não foi possível salvar. Verifique o servidor e tente novamente.'
    });
  }
});

app.get('/api/admin/agendamentos', (req, res) => {
  if (!senhaAdminValida(req)) {
    if (!process.env.ADMIN_PASSWORD) {
      return res.status(503).json({
        erro: 'ADMIN_PASSWORD não foi configurada no servidor.'
      });
    }

    return res.status(401).json({
      erro: 'Senha de administrador inválida.'
    });
  }

  try {
    const agendamentos = listarAgendamentos.all();

    return res.json({
      ok: true,
      total: agendamentos.length,
      agendamentos
    });
  } catch (e) {
    console.error('ERRO AO LISTAR AGENDAMENTOS:', e);

    return res.status(500).json({
      erro: 'Não foi possível carregar os agendamentos.'
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}/cliente.html`);
  console.log(`Painel administrativo: http://localhost:${PORT}/admin.html`);

  if (!process.env.ADMIN_PASSWORD) {
    console.warn('ATENÇÃO: defina ADMIN_PASSWORD antes de usar o painel administrativo.');
  }
});