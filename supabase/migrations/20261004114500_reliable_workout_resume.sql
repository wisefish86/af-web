create unique index if not exists workout_sessions_one_active_per_client_uq
  on public.workout_sessions(client_id)
  where status='in_progress';

create or replace function public.guard_completed_workout_session()
returns trigger
language plpgsql
security invoker
set search_path to 'public','pg_temp'
as $function$
declare
  v_allowed_columns text[]:=array[
    'status','completed_at','updated_at',
    'active_workout_exercise_id','rest_timer_end_at','rest_timer_name'
  ];
begin
  if current_user in ('service_role','postgres') then
    return case when tg_op='DELETE' then old else new end;
  end if;

  if old.status='completed' then
    if tg_op='UPDATE'
       and old.client_id=auth.uid()
       and new.status='in_progress'
       and new.completed_at is null
       and (to_jsonb(new)-v_allowed_columns)=(to_jsonb(old)-v_allowed_columns)
    then
      return new;
    end if;
    raise exception 'Completed workout history is immutable';
  end if;

  return case when tg_op='DELETE' then old else new end;
end;
$function$;

create or replace function public.reopen_my_workout(p_workout_session_id uuid)
returns uuid
language plpgsql
security invoker
set search_path to 'public','pg_temp'
as $function$
declare
  v_user uuid:=auth.uid();
  v_session public.workout_sessions%rowtype;
  v_existing uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  perform pg_advisory_xact_lock(hashtext(v_user::text));

  select * into v_session
  from public.workout_sessions
  where id=p_workout_session_id and client_id=v_user
  for update;

  if not found then raise exception 'Тренировка не найдена.'; end if;
  if v_session.status='in_progress' then return v_session.id; end if;
  if v_session.status<>'completed' then raise exception 'Эту тренировку нельзя возобновить.'; end if;

  select ws.id into v_existing
  from public.workout_sessions ws
  where ws.client_id=v_user
    and ws.status='in_progress'
    and ws.id<>p_workout_session_id
  order by ws.started_at desc
  limit 1;

  if v_existing is not null then
    return v_existing;
  end if;

  update public.workout_sessions
  set status='in_progress',
      completed_at=null,
      updated_at=now(),
      active_workout_exercise_id=null,
      rest_timer_end_at=null,
      rest_timer_name=null
  where id=p_workout_session_id and client_id=v_user;

  return p_workout_session_id;
end;
$function$;

revoke all on function public.reopen_my_workout(uuid) from public,anon;
grant execute on function public.reopen_my_workout(uuid) to authenticated;
