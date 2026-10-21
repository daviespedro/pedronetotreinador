alter table public.agendamentos
  add column if not exists atestado_path text;

insert into storage.buckets (id, name, public)
values ('atestados-medicos', 'atestados-medicos', false)
on conflict (id) do nothing;

-- A data da consulta deixou de ser pedida no formulário.
-- Rode isto no SQL Editor do Supabase para o insert não falhar se a coluna for NOT NULL.
alter table public.agendamentos
  alter column data_consulta drop not null;
