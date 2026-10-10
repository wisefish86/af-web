
create table if not exists public.qa_tokens(
  token_hash text primary key,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.qa_tokens enable row level security;
revoke all on public.qa_tokens from public,anon,authenticated;
grant select,update,insert,delete on public.qa_tokens to service_role;
