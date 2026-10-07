-- Training program revision/publish reliability smoke.
-- One active source may have at most one draft revision; replacing that draft
-- preserves lineage and activation is retry-safe. All changes roll back.

begin;

do $$
declare
  v_trainer uuid;
  v_client uuid;
  v_source uuid;
  v_source_family uuid;
  v_source_version integer;
  v_exercise uuid;
  v_revision uuid;
  v_replacement uuid;
  v_second_rejected boolean:=false;
  v_payload jsonb;
begin
  select tp.created_by,tp.client_id,tp.id,tp.family_id,tp.version
  into v_trainer,v_client,v_source,v_source_family,v_source_version
  from public.training_programs tp
  join public.coach_clients cc
    on cc.coach_id=tp.created_by
   and cc.client_id=tp.client_id
   and cc.status='active'
  where tp.status='active'
    and tp.client_id is not null
  order by tp.updated_at desc
  limit 1;

  select id into v_exercise
  from public.exercises
  where is_active=true
  order by created_at
  limit 1;

  if v_trainer is null or v_source is null or v_exercise is null then
    raise exception 'QA program revision smoke requires an active trainer-owned program and exercise';
  end if;

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub',v_trainer,'role','authenticated')::text,
    true
  );
  set local role authenticated;

  v_payload:=jsonb_build_object(
    'client_id',v_client,
    'name','QA program revision '||gen_random_uuid()::text,
    'description','QA',
    'weekly_frequency',1,
    'is_template',false,
    'sessions',jsonb_build_array(
      jsonb_build_object(
        'name','QA session',
        'session_type','strength',
        'planned_duration_minutes',30,
        'items',jsonb_build_array(
          jsonb_build_object(
            'type','exercise',
            'exercise_id',v_exercise,
            'sets_min',2,
            'sets_max',2,
            'reps_min',8,
            'reps_max',10,
            'rir_enabled',true,
            'rir_min',2,
            'rir_max',2,
            'rest_seconds',90,
            'allow_client_substitution',false,
            'substitution_policy','strict'
          )
        )
      )
    )
  );

  select public.create_training_program_revision(v_source,v_payload,'[]'::jsonb)
  into v_revision;

  if not exists(
    select 1
    from public.training_programs
    where id=v_revision
      and status='draft'
      and created_by=v_trainer
      and client_id=v_client
      and family_id=v_source_family
      and version=v_source_version+1
      and supersedes_program_id=v_source
  ) then
    raise exception 'Revision metadata is incorrect';
  end if;

  begin
    perform public.create_training_program_revision(v_source,v_payload,'[]'::jsonb);
  exception when others then
    if sqlerrm ilike '%Draft revision already exists%' then
      v_second_rejected:=true;
    else
      raise;
    end if;
  end;

  if not v_second_rejected then
    raise exception 'Second draft revision for the same source was not rejected';
  end if;

  if (
    select count(*)
    from public.training_programs
    where created_by=v_trainer
      and supersedes_program_id=v_source
      and status='draft'
  )<>1 then
    raise exception 'Expected exactly one draft revision for source';
  end if;

  v_payload:=jsonb_set(v_payload,'{description}',to_jsonb('QA replacement draft'::text),true);

  select public.replace_training_program_draft(v_revision,v_payload,'[]'::jsonb)
  into v_replacement;

  if v_replacement=v_revision then
    raise exception 'Draft replacement did not produce the replacement row';
  end if;

  if not exists(
    select 1
    from public.training_programs
    where id=v_replacement
      and status='draft'
      and family_id=v_source_family
      and version=v_source_version+1
      and supersedes_program_id=v_source
  ) then
    raise exception 'Replacement draft lost revision lineage';
  end if;

  perform public.activate_training_program(v_replacement);
  perform public.activate_training_program(v_replacement);

  if not exists(
    select 1 from public.training_programs
    where id=v_replacement and status='active'
  ) then
    raise exception 'Revision did not become active';
  end if;

  if not exists(
    select 1 from public.training_programs
    where id=v_source and status='archived'
  ) then
    raise exception 'Source was not archived after activation';
  end if;

  reset role;
end $$;

rollback;
