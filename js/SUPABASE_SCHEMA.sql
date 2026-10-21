alter table public.agendamentos
  add column if not exists atestado_path text;

insert into storage.buckets (id, name, public)
values ('atestados-medicos', 'atestados-medicos', false)
on conflict (id) do nothing;
