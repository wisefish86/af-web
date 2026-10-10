-- Training program revision lifecycle smoke.
-- Creates disposable rows under an authenticated trainer and rolls everything back.

begin;

select set_config(
  'request.jwt.claims',
  (
    select jsonb_build_object('sub',cc.coach_id,'role','authenticated')::text
    from public.coach_clients cc
    join public.profiles p on p.id=cc.coach_id and p.role='trainer'
    where cc.status='active'
    limit 1
  ),
  true
);

set local role authenticated;

do $$
declare
  v_coach uuid:=auth.uid();
  v_client uuid;
  v_exercise uuid;
  v_payload jsonb;
  v_payload2 jsonb;
  v_warmups jsonb;
  v_source uuid;
  v_revision uuid;
  v_replaced uuid;
  v_family uuid;
  v_source_version integer;
  v_revision_version integer;
begin
  select client_id into v_client
  from public.coach_clients
  where coach_id=v_coach and status='active'
  limit 1;

  select id into v_exercise
  from public.exercises
  where is_active=true
  order by created_at
  limit 1;

  if v_coach is null or v_client is null or v_exercise is null then
    raise exception 'Revision smoke requires active trainer/client and one exercise';
  end if;

  v_payload:=jsonb_build_object(
    'client_id',v_client,
    'name','QA program revision',
    'description','rollback smoke',
    'weekly_frequency',2,
    'is_template',false,
    'sessions',jsonb_build_array(jsonb_build_object(
      'name','QA session',
      'session_type','strength',
      'planned_duration_minutes',45,
      'notes',null,
      'items',jsonb_build_array(jsonb_build_object(
        'type','exercise',
        'exercise_id',v_exercise,
        'substitution_group_id',null,
        'exercise_role','main',
        'sets_min',3,'sets_max',3,
        'reps_min',8,'reps_max',12,
        'rir_enabled',true,'rir_min',1,'rir_max',2,
        'rest_seconds',90,
        'allow_client_substitution',false,
        'substitution_policy','strict',
        'notes',null,
        'progression_notes',null,
        'superset_group',null,
        'superset_position',null
      ))
    ))
  );
  v_warmups:=jsonb_build_array(jsonb_build_object(
    'day_index',1,'sort_order',10,'warmup_enabled',true,
    'warmup_load_percent_min',50,'warmup_load_percent_max',60,
    'warmup_reps_min',8,'warmup_reps_max',10,
    'warmup_rest_seconds',60,'warmup_notes','QA warmup'
  ));

  v_source:=public.create_training_program_with_warmups(v_payload,v_warmups);
  perform public.activate_training_program(v_source);

  select family_id,version into v_family,v_source_version
  from public.training_programs where id=v_source;

  v_revision:=public.create_training_program_revision(v_source,v_payload,v_warmups);

  select version into v_revision_version
  from public.training_programs
  where id=v_revision
    and status='draft'
    and family_id=v_family
    and supersedes_program_id=v_source;

  if v_revision_version is distinct from v_source_version+1 then
    raise exception 'Revision version lineage mismatch';
  end if;

  v_payload2:=jsonb_set(v_payload,'{name}',to_jsonb('QA program revision edited'::text));
  v_replaced:=public.replace_training_program_draft(v_revision,v_payload2,v_warmups);

  if exists(select 1 from public.training_programs where id=v_revision) then
    raise exception 'Old draft still exists after replacement';
  end if;

  if not exists(
    select 1 from public.training_programs
    where id=v_replaced
      and status='draft'
      and family_id=v_family
      and version=v_revision_version
      and supersedes_program_id=v_source
      and name='QA program revision edited'
  ) then
    raise exception 'Replacement draft lost family/version/supersedes lineage';
  end if;

  perform public.activate_training_program(v_replaced);

  if not exists(select 1 from public.training_programs where id=v_source and status='archived') then
    raise exception 'Previous active version was not archived';
  end if;
  if not exists(select 1 from public.training_programs where id=v_replaced and status='active') then
    raise exception 'New revision was not activated';
  end if;
end $$;

rollback;
