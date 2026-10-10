-- Retry/lost-response reliability for trainer program draft saves.
begin;

do $$
declare
  v_trainer uuid;
  v_client uuid;
  v_exercise uuid;
  v_payload jsonb;
  v_changed jsonb;
  v_create_request uuid:=gen_random_uuid();
  v_revision_request uuid:=gen_random_uuid();
  v_replace_request uuid:=gen_random_uuid();
  v_stale_request uuid:=gen_random_uuid();
  v_draft uuid;
  v_retry uuid;
  v_revision uuid;
  v_replacement uuid;
  v_mismatch_rejected boolean:=false;
  v_stale_rejected boolean:=false;
begin
  select cc.coach_id,cc.client_id into v_trainer,v_client
  from public.coach_clients cc
  join public.profiles p on p.id=cc.coach_id and p.role='trainer'
  where cc.status='active'
  limit 1;

  select id into v_exercise
  from public.exercises
  where is_active=true and exercise_scope='global'
  order by created_at
  limit 1;

  if v_trainer is null or v_client is null or v_exercise is null then
    raise exception 'QA program save smoke requires trainer/client/exercise fixtures';
  end if;

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub',v_trainer,'role','authenticated')::text,
    true
  );
  set local role authenticated;

  v_payload:=jsonb_build_object(
    'client_id',v_client,
    'name','QA retry-safe program',
    'description','rollback smoke',
    'weekly_frequency',1,
    'is_template',false,
    'sessions',jsonb_build_array(
      jsonb_build_object(
        'name','QA session',
        'session_type','strength',
        'planned_duration_minutes',35,
        'items',jsonb_build_array(
          jsonb_build_object(
            'type','exercise','exercise_id',v_exercise,
            'sets_min',2,'sets_max',2,'reps_min',8,'reps_max',10,
            'rir_enabled',true,'rir_min',1,'rir_max',2,'rest_seconds',90,
            'allow_client_substitution',false,'substitution_policy','strict'
          )
        )
      )
    )
  );

  v_draft:=public.save_training_program_draft_v2(v_create_request,null,null,v_payload,'[]'::jsonb);
  v_retry:=public.save_training_program_draft_v2(v_create_request,null,null,v_payload,'[]'::jsonb);
  if v_retry is distinct from v_draft then raise exception 'Create retry returned another draft'; end if;
  if (select count(*) from public.training_programs where created_by=v_trainer and save_request_id=v_create_request)<>1 then
    raise exception 'Create retry produced duplicates';
  end if;

  v_changed:=jsonb_set(v_payload,'{name}',to_jsonb('QA changed payload'::text),true);
  begin
    perform public.save_training_program_draft_v2(v_create_request,null,null,v_changed,'[]'::jsonb);
  exception when others then
    if sqlerrm ilike '%already used for a different program payload%' then v_mismatch_rejected:=true;
    else raise;
    end if;
  end;
  if not v_mismatch_rejected then raise exception 'Payload mismatch was not rejected'; end if;

  perform public.activate_training_program(v_draft);

  v_revision:=public.save_training_program_draft_v2(v_revision_request,null,v_draft,v_payload,'[]'::jsonb);
  v_retry:=public.save_training_program_draft_v2(v_revision_request,null,v_draft,v_payload,'[]'::jsonb);
  if v_retry is distinct from v_revision then raise exception 'Revision retry returned another draft'; end if;
  if (select count(*) from public.training_programs where created_by=v_trainer and supersedes_program_id=v_draft and status='draft')<>1 then
    raise exception 'Revision retry produced duplicates';
  end if;

  v_changed:=jsonb_set(v_payload,'{description}',to_jsonb('QA replacement'::text),true);
  v_replacement:=public.save_training_program_draft_v2(v_replace_request,v_revision,null,v_changed,'[]'::jsonb);
  v_retry:=public.save_training_program_draft_v2(v_replace_request,v_revision,null,v_changed,'[]'::jsonb);
  if v_retry is distinct from v_replacement then raise exception 'Replacement retry returned another draft'; end if;
  if exists(select 1 from public.training_programs where id=v_revision) then raise exception 'Replaced draft still exists'; end if;

  begin
    perform public.save_training_program_draft_v2(v_stale_request,v_revision,null,v_changed,'[]'::jsonb);
  exception when others then
    if sqlerrm ilike '%Draft program not found%' then v_stale_rejected:=true;
    else raise;
    end if;
  end;
  if not v_stale_rejected then raise exception 'New request against stale draft was not rejected'; end if;

  perform public.activate_training_program(v_replacement);
  perform public.activate_training_program(v_replacement);
  if not exists(select 1 from public.training_programs where id=v_replacement and status='active') then
    raise exception 'Replacement did not become active';
  end if;
end $$;

rollback;
