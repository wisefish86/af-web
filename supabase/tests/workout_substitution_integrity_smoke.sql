-- Transactional workout substitution integrity smoke. All rows are rolled back.

begin;

do $$
declare
  v_client uuid;
  v_group uuid;
  v_old_exercise uuid;
  v_new_exercise uuid;
  v_session uuid;
  v_workout_exercise uuid;
  v_new_name text;
begin
  select p.id into v_client
  from public.profiles p
  where p.role='client'
  order by p.created_at
  limit 1;

  select m1.group_id,m1.exercise_id,m2.exercise_id,e2.name
  into v_group,v_old_exercise,v_new_exercise,v_new_name
  from public.exercise_substitution_members m1
  join public.exercise_substitution_members m2
    on m2.group_id=m1.group_id
   and m2.exercise_id<>m1.exercise_id
   and m2.match_type='direct'
  join public.exercises e1 on e1.id=m1.exercise_id and e1.is_active=true
  join public.exercises e2 on e2.id=m2.exercise_id and e2.is_active=true
  where m1.match_type='direct'
  order by m1.group_id,m1.priority,m2.priority
  limit 1;

  if v_client is null or v_group is null then
    raise exception 'QA substitution smoke requires one client and one direct substitution pair';
  end if;

  -- Hide any real active workout only inside this transaction so the partial
  -- unique index does not block the disposable session.
  update public.workout_sessions
  set status='abandoned',completed_at=coalesce(completed_at,now()),updated_at=now()
  where client_id=v_client and status='in_progress';

  insert into public.workout_sessions(client_id,status,started_at,updated_at)
  values(v_client,'in_progress',now(),now())
  returning id into v_session;

  insert into public.workout_exercises(
    workout_session_id,exercise_id,exercise_name_snapshot,
    allow_substitution,substitution_group_id,substitution_policy,prescribed_sets
  )
  select v_session,e.id,e.name,true,v_group,'strict',3
  from public.exercises e
  where e.id=v_old_exercise
  returning id into v_workout_exercise;

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub',v_client,'role','authenticated')::text,
    true
  );

  perform public.replace_workout_exercise(v_workout_exercise,v_new_exercise);

  if not exists(
    select 1
    from public.workout_exercises
    where id=v_workout_exercise
      and exercise_id=v_new_exercise
      and exercise_name_snapshot=v_new_name
      and substituted_from_exercise_id=v_old_exercise
  ) then
    raise exception 'Replacement did not refresh exercise identity snapshots';
  end if;

  perform public.save_workout_set(v_workout_exercise,1,20,10,2,false,now());

  begin
    perform public.replace_workout_exercise(v_workout_exercise,v_old_exercise);
    raise exception 'QA_EXPECTED_SUBSTITUTION_REJECTION_MISSING';
  exception when others then
    if sqlerrm='QA_EXPECTED_SUBSTITUTION_REJECTION_MISSING' then raise; end if;
    if position('Exercise cannot be substituted after a set has been saved' in sqlerrm)=0 then
      raise;
    end if;
  end;
end $$;

rollback;
