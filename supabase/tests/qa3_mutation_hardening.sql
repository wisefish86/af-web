-- QA-3 mutation hardening smoke.
-- Run against a non-production clone when possible.
-- The script mutates only inside a transaction and always rolls back.

begin;

do $outer$
declare
  v_coach uuid;
  v_client uuid;
begin
  select cc.coach_id,cc.client_id
  into v_coach,v_client
  from public.coach_clients cc
  join public.profiles p on p.id=cc.coach_id
  where cc.status='active' and p.role='trainer'
  limit 1;

  if v_coach is null or v_client is null then
    raise notice 'QA-3 smoke skipped: no active trainer/client pair';
    return;
  end if;

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub',v_coach,'role','authenticated')::text,
    true
  );

  execute 'set local role authenticated';

  perform (
    with before_rows as (
      select coalesce(jsonb_object_agg(channel,url),'{}'::jsonb) value
      from public.trainer_contact_channels
      where trainer_id=v_coach
    ),
    write_call as (
      select public.save_my_trainer_contact_settings((select value from before_rows))
    ),
    after_rows as (
      select coalesce(jsonb_object_agg(channel,url),'{}'::jsonb) value
      from public.trainer_contact_channels
      where trainer_id=v_coach
    )
    select case
      when (select value from before_rows) is distinct from (select value from after_rows)
      then public.qa_fail('Atomic contact round-trip mismatch')
      else true
    end
    from write_call
  );
end
$outer$;

rollback;
