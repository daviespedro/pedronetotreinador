const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const app = express();
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_PASSWORD } = process.env;
const documentsBucket = process.env.SUPABASE_DOCUMENTS_BUCKET || 'atestados-medicos';
const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  : null;
const publicDir = path.join(
  __dirname,
  process.env.VERCEL || !fs.existsSync(path.join(__dirname, 'dist')) ? 'public' : 'dist'
);
const allowedDocuments = new Map([
  ['application/pdf', 'pdf'],
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
]);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, callback) => callback(null, allowedDocuments.has(file.mimetype)),
});

const dataValida = (data) => {
  if (typeof data !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data)) return false;
  const parsed = new Date(`${data}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === data;
};

const normalizarNascimento = (valor) => {
  const data = String(valor || '').trim();
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(data)) {
    const [dia, mes, ano] = data.split('/');
    return `${ano}-${mes}-${dia}`;
  }
  return data;
};

const normalizarDataConsulta = (valor) => {
  const data = String(valor || '').trim();
  if (!/^\d{2}\/\d{2}$/.test(data)) return data;

  const [dia, mes] = data.split('/');
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  let ano = Number(hoje.slice(0, 4));
  let consulta = `${ano}-${mes}-${dia}`;
  if (consulta < hoje) consulta = `${++ano}-${mes}-${dia}`;
  return consulta;
};

const validarAgendamento = (body) => {
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const agendamento = {
    nome: String(body.nome || '').trim(),
    nascimento: normalizarNascimento(body.nascimento),
    telefone: String(body.telefone || '').replace(/\D/g, ''),
    data_consulta: normalizarDataConsulta(body.data_consulta),
  };

  if (agendamento.nome.length < 3 || agendamento.nome.length > 120) return { erro: 'Informe seu nome completo.' };
  if (!dataValida(agendamento.nascimento) || agendamento.nascimento < '1900-01-01' || agendamento.nascimento > hoje) {
    return { erro: 'Data de nascimento inválida. Use o formato DD/MM/AAAA.' };
  }
  if (agendamento.telefone.length !== 11) return { erro: 'Informe um celular válido com DDD.' };
  if (!dataValida(agendamento.data_consulta) || agendamento.data_consulta < hoje) {
    return { erro: 'Data da consulta inválida. Use o formato DD/MM (ex: 27/09).' };
  }
  return { agendamento };
};

const exigirSupabase = (req, res, next) => {
  if (!supabase) return res.status(503).json({ erro: 'Serviço de agendamentos não configurado.' });
  next();
};

const receberAtestado = (req, res, next) => {
  upload.single('atestado')(req, res, (error) => {
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ erro: 'O atestado pode ter no máximo 10 MB.' });
    }
    if (error) return res.status(400).json({ erro: 'Envie o atestado em PDF, JPG, PNG ou WEBP.' });
    if (req.file && !allowedDocuments.has(req.file.mimetype)) {
      return res.status(400).json({ erro: 'Envie o atestado em PDF, JPG, PNG ou WEBP.' });
    }
    next();
  });
};

const auth = (req, res, next) => {
  const enviado = req.get('Authorization')?.replace(/^Bearer\s+/, '') || '';
  if (!ADMIN_PASSWORD) return res.status(503).json({ erro: 'Painel administrativo não configurado.' });

  const esperado = Buffer.from(ADMIN_PASSWORD);
  const recebido = Buffer.from(enviado);
  if (esperado.length !== recebido.length || !crypto.timingSafeEqual(esperado, recebido)) {
    return res.status(401).json({ erro: 'Senha incorreta.' });
  }
  next();
};

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: false, limit: '10kb' }));
app.use(express.static(publicDir));

app.post('/api/agendamentos', exigirSupabase, receberAtestado, async (req, res) => {
  const { agendamento, erro } = validarAgendamento(req.body || {});
  if (erro) return res.status(400).json({ erro });

  const { data, error } = await supabase
    .from('agendamentos')
    .insert(agendamento)
    .select('id')
    .single();

  if (error) {
    console.error('Erro ao criar agendamento:', error.message);
    return res.status(500).json({ erro: 'Não foi possível salvar. Tente novamente em instantes.' });
  }
  if (!req.file) return res.status(201).json({ id: data.id });

  const atestadoPath = `agendamentos/${data.id}/atestado-${Date.now()}.${allowedDocuments.get(req.file.mimetype)}`;
  const { error: uploadError } = await supabase.storage
    .from(documentsBucket)
    .upload(atestadoPath, req.file.buffer, { contentType: req.file.mimetype, upsert: false });

  if (uploadError) {
    await supabase.from('agendamentos').delete().eq('id', data.id);
    console.error('Erro ao enviar atestado:', uploadError.message);
    return res.status(500).json({ erro: 'Não foi possível enviar o atestado. Tente novamente.' });
  }

  const { error: updateError } = await supabase
    .from('agendamentos')
    .update({ atestado_path: atestadoPath })
    .eq('id', data.id);

  if (updateError) {
    await supabase.storage.from(documentsBucket).remove([atestadoPath]);
    await supabase.from('agendamentos').delete().eq('id', data.id);
    console.error('Erro ao associar atestado:', updateError.message);
    return res.status(500).json({ erro: 'Não foi possível salvar o atestado. Tente novamente.' });
  }

  res.status(201).json({ id: data.id });
});

app.get('/api/admin/agendamentos', exigirSupabase, auth, async (req, res) => {
  const { data, error } = await supabase
    .from('agendamentos')
    .select('*')
    .order('criado_em', { ascending: false });

  if (error) {
    console.error('Erro ao listar agendamentos:', error.message);
    return res.status(500).json({ erro: 'Não foi possível carregar os agendamentos.' });
  }
  const agendamentos = await Promise.all(data.map(async (item) => {
    if (!item.atestado_path) return { ...item, atestado_url: null };
    const { data: signed, error: signedError } = await supabase.storage
      .from(documentsBucket)
      .createSignedUrl(item.atestado_path, 60 * 10);
    if (signedError) {
      console.error('Erro ao gerar acesso ao atestado:', signedError.message);
      return { ...item, atestado_url: null };
    }
    return { ...item, atestado_url: signed.signedUrl };
  }));
  res.json({ agendamentos, origem: 'Supabase' });
});

app.put('/api/admin/agendamentos/:id', exigirSupabase, auth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ erro: 'ID inválido.' });

  const { agendamento, erro } = validarAgendamento(req.body || {});
  if (erro) return res.status(400).json({ erro });

  const { data, error } = await supabase
    .from('agendamentos')
    .update(agendamento)
    .eq('id', id)
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('Erro ao atualizar agendamento:', error.message);
    return res.status(500).json({ erro: 'Não foi possível atualizar o agendamento.' });
  }
  if (!data) return res.status(404).json({ erro: 'Agendamento não encontrado.' });
  res.json({ ok: true });
});

app.delete('/api/admin/agendamentos/:id', exigirSupabase, auth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ erro: 'ID inválido.' });

  const { data: appointment, error: findError } = await supabase
    .from('agendamentos')
    .select('id, atestado_path')
    .eq('id', id)
    .maybeSingle();

  if (findError) {
    console.error('Erro ao localizar agendamento:', findError.message);
    return res.status(500).json({ erro: 'Não foi possível apagar o agendamento.' });
  }
  if (!appointment) return res.status(404).json({ erro: 'Agendamento não encontrado.' });

  const { error } = await supabase
    .from('agendamentos')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('Erro ao apagar agendamento:', error.message);
    return res.status(500).json({ erro: 'Não foi possível apagar o agendamento.' });
  }
  if (appointment.atestado_path) {
    const { error: removeError } = await supabase.storage.from(documentsBucket).remove([appointment.atestado_path]);
    if (removeError) console.error('Erro ao apagar atestado:', removeError.message);
  }
  res.json({ ok: true });
});

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Servidor em http://localhost:${port}`));
}

module.exports = app;
