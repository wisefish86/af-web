-- QA-3 mutation hardening smoke.
-- Uses one existing active trainer/client pair, runs with authenticated role,
-- and rolls every change back.

begin;

select set_config(
  'request.jwt.claims',
  (
    select jsonb_build_object('sub',cc.coach_id,'role','authenticated')::text
    from public.coach_clients cc
    join public.profiles p on p.id=cc.coach_id
    where cc.status='active' and p.role='trainer'
    limit 1
  ),
  true
);

set local role authenticated;

do $$
declare
  v_coach uuid:=auth.uid();
  v_client uuid;
  v_before_contacts jsonb;
  v_after_contacts jsonb;
  v_modules jsonb;
  v_tracking jsonb;
  v_rules jsonb;
  v_saved jsonb;
begin
  if v_coach is null then
    raise exception 'QA-3 smoke requires an active trainer/client pair';
  end if;

  select client_id into v_client
  from public.coach_clients
  where coach_id=v_coach and status='active'
  limit 1;

  if v_client is null then
    raise exception 'QA-3 smoke requires an active trainer/client pair';
  end if;

  select coalesce(jsonb_object_agg(channel,url),'{}'::jsonb)
  into v_before_contacts
  from public.trainer_contact_channels
  where trainer_id=v_coach;

  perform public.save_my_trainer_contact_settings(v_before_contacts);

  select coalesce(jsonb_object_agg(channel,url),'{}'::jsonb)
  into v_after_contacts
  from public.trainer_contact_channels
  where trainer_id=v_coach;

  if v_after_contacts is distinct from v_before_contacts then
    raise exception 'Atomic contact round-trip mismatch';
  end if;

  select coalesce(jsonb_object_agg(module_code,to_jsonb(enabled)),'{}'::jsonb)
  into v_modules
  from public.client_modules
  where client_id=v_client;

  select coalesce(jsonb_object_agg(
    field_code,
    jsonb_build_object('enabled',enabled,'required',required)
  ),'{}'::jsonb)
  into v_tracking
  from public.client_tracking_config
  where client_id=v_client;

  select coalesce(jsonb_agg(
    jsonb_set(to_jsonb(rr),'{channels}','["in_app","telegram"]'::jsonb)
    order by rr.created_at
  ),'[]'::jsonb)
  into v_rules
  from public.reminder_rules rr
  where rr.client_id=v_client;

  v_saved:=public.save_client_workspace(v_client,v_modules,v_tracking,v_rules);

  if exists(
    select 1
    from jsonb_array_elements(v_saved) item
    where not ((item->'channels') ? 'in_app')
       or not ((item->'channels') ? 'telegram')
  ) then
    raise exception 'Workspace reminder channels were not preserved';
  end if;
end $$;

rollback;
