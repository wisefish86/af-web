
update public.reminder_rules
set channels=(
  select array_agg(distinct x order by x)
  from unnest(coalesce(channels,'{}'::text[])||array['in_app','telegram']::text[]) x
),
updated_at=now();

do $$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='private' and p.proname='apply_default_client_setup'
  limit 1;

  if v_def is null then
    raise exception 'apply_default_client_setup not found';
  end if;

  v_def:=replace(v_def,$old$array['in_app']$old$,$new$array['in_app','telegram']$new$);
  execute v_def;
end $$;
