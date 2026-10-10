const express = require('express');
const Database = require('better-sqlite3');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

const app = express();

// 1. Conexão Local (SQLite)
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

const inserirSQLite = db.prepare(`
  INSERT INTO agendamentos (nome, nascimento, telefone, data_consulta)
  VALUES (@nome, @nascimento, @telefone, @data_consulta)
`);

// 2. Conexão Nuvem (Supabase)
// Substitua com as suas credenciais obtidas no Passo 2
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://mgrzsbrltkplsjqiccty.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ncnpzYnJsdGtwbHNqcWljY3R5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAzMDI3NzQsImV4cCI6MjEwNTg3ODc3NH0.X6pH-lgWoPDZDvX8RASCJC92zRm-VqtVGHEMxporyWo';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Funções Auxiliares de Validação e Formatação de Datas
const dataValida = (s) => {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

const normalizarNascimento = (s) => {
  if (typeof s !== 'string') return null;
  const str = s.trim();
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) {
    const [dia, mes, ano] = str.split('/');
    return `${ano}-${mes}-${dia}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  return null;
};

const normalizarDataConsulta = (s) => {
  if (typeof s !== 'string') return null;
  const str = s.trim();
  if (/^\d{2}\/\d{2}$/.test(str)) {
    const [dia, mes] = str.split('/');
    const hojeObj = new Date();
    let ano = hojeObj.getFullYear();
    let dataFormatada = `${ano}-${mes}-${dia}`;
    const hojeStr = hojeObj.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

    if (dataFormatada < hojeStr) {
      ano += 1;
      dataFormatada = `${ano}-${mes}-${dia}`;
    }
    return dataFormatada;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  return null;
};

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.static(path.join(__dirname, 'public')));

// Rota POST: Guarda no SQLite E no Supabase simultaneamente
app.post('/api/agendamentos', async (req, res) => {
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
  } else if (tel.length !== 11) {
    erro = 'Informe um celular válido com DDD.';
  } else if (!consultaISO || !dataValida(consultaISO) || consultaISO < hoje) {
    erro = 'Data da consulta inválida. Use o formato DD/MM (ex: 27/09).';
  }

  if (erro) return res.status(400).json({ erro });

  const novoAgendamento = {
    nome: nomeLimpo,
    nascimento: nascimentoISO,
    telefone: tel,
    data_consulta: consultaISO,
  };

  try {
    // 1º: Regista no SQLite Local
    const { lastInsertRowid } = inserirSQLite.run(novoAgendamento);
    console.log('✓ Guardado no SQLite com ID:', lastInsertRowid);

    // 2º: Regista em paralelo no Supabase
    const { error: erroSupabase } = await supabase
      .from('agendamentos')
      .insert([novoAgendamento]);

    if (erroSupabase) {
      console.error('⚠️ Erro ao sincronizar com Supabase:', erroSupabase.message);
    } else {
      console.log('✓ Guardado no Supabase com sucesso!');
    }

    // Retorna a confirmação para o cliente
    res.status(201).json({ id: lastInsertRowid });
  } catch (e) {
    console.error('x Erro ao guardar no SQLite:', e);
    res.status(500).json({ erro: 'Não foi possível salvar. Tente novamente em instantes.' });
  }
});

// Auth admin: compara Bearer com ADMIN_PASSWORD (.env)
const auth = (req, res, next) => {
  const senha = process.env.ADMIN_PASSWORD;
  if (!senha) return res.status(500).json({ erro: 'ADMIN_PASSWORD não configurada no .env.' });
  if (req.get('Authorization') !== `Bearer ${senha}`) return res.status(401).json({ erro: 'Senha incorreta.' });
  next();
};

// Rota GET: mostra o SQLite local; usa Supabase só se o banco local estiver vazio.
app.get('/api/admin/agendamentos', auth, async (req, res) => {
  let agendamentosLocal = [];
  try {
    agendamentosLocal = db.prepare('SELECT * FROM agendamentos ORDER BY criado_em DESC').all();
    if (agendamentosLocal.length) {
      return res.json({ agendamentos: agendamentosLocal, origem: 'SQLite Local' });
    }
  } catch (e) {
    return res.status(500).json({ erro: 'Erro ao consultar o banco de dados.' });
  }

  try {
    const { data, error } = await supabase
      .from('agendamentos')
      .select('*')
      .order('criado_em', { ascending: false });

    if (!error && data) {
      return res.json({ agendamentos: data, origem: 'Supabase' });
    }
  } catch (e) {
    console.warn('Servidor sem ligação ao Supabase. A carregar do SQLite local...');
  }

  res.json({ agendamentos: agendamentosLocal, origem: 'SQLite Local' });
});

// Rota DELETE: apaga no SQLite e no Supabase (senão o fallback ressuscita o registro)
app.delete('/api/admin/agendamentos/:id', auth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ erro: 'ID inválido.' });
  const row = db.prepare('SELECT * FROM agendamentos WHERE id = ?').get(id);
  let q = supabase.from('agendamentos').delete();
  if (row) {
    db.prepare('DELETE FROM agendamentos WHERE id = ?').run(id);
    const { nome, nascimento, telefone, data_consulta } = row;
    q = q.match({ nome, nascimento, telefone, data_consulta });
  } else {
    q = q.eq('id', id); // painel estava lendo do Supabase
  }
  let error = null;
  try { ({ error } = await q); } catch (e) { error = e; }
  if (error) console.error('⚠️ Erro ao apagar no Supabase:', error.message);
  if (!row && error) return res.status(404).json({ erro: 'Não encontrado.' });
  res.json({ ok: true, supabase: !error });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Rodando em http://localhost:${PORT}/cliente.html`));