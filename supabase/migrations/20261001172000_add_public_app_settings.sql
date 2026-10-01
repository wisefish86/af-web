-- Public runtime configuration used by client-safe app surfaces.
create table if not exists public.app_settings (
  key text primary key,
  value text,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public'
      and tablename='app_settings'
      and policyname='public app settings readable'
  ) then
    create policy "public app settings readable"
      on public.app_settings
      for select
      to anon, authenticated
      using (true);
  end if;
end $$;

grant select on public.app_settings to anon, authenticated;

insert into public.app_settings(key,value)
values ('materials_notion_embed_url', null)
on conflict (key) do nothing;
