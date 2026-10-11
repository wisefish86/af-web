create or replace function public.guard_published_training_program()
returns trigger
language plpgsql
set search_path to 'public','pg_temp'
as $function$
begin
  if auth.role()='service_role' then
    return case when tg_op='DELETE' then old else new end;
  end if;

  if tg_op='DELETE' then
    if old.status='draft' then
      return old;
    end if;

    if old.status<>'active'
       and current_setting('app.training_program_delete_id',true)=old.id::text
       and old.created_by=auth.uid()
       and exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='trainer')
       and not exists(select 1 from public.workout_sessions ws where ws.program_id=old.id) then
      return old;
    end if;

    raise exception 'Used or active training programs are protected history and cannot be deleted';
  end if;

  if old.status='active'
     and new.status='active'
     and current_setting('app.training_program_inplace_edit_id',true)=old.id::text
     and old.created_by=auth.uid()
     and exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='trainer') then
    return new;
  end if;

  if old.status<>'draft' then
    if (to_jsonb(new)-array['status','is_active','updated_at']::text[])
       is distinct from
       (to_jsonb(old)-array['status','is_active','updated_at']::text[]) then
      raise exception 'Published or archived training program content is immutable; create a new version';
    end if;

    if old.status='archived' and new.status<>'archived' then
      raise exception 'Archived training programs cannot be reactivated; create a new version';
    end if;

    if old.status='active' and new.status not in ('active','archived') then
      raise exception 'Active training program can only remain active or be archived';
    end if;
  end if;

  return new;
end;
$function$;

create or replace function public.delete_unused_training_program(p_program_id uuid)
returns uuid
language plpgsql
security invoker
set search_path to 'public','pg_temp'
as $function$
declare
  v_program public.training_programs%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not exists(
    select 1 from public.profiles p
    where p.id=auth.uid() and p.role='trainer'
  ) then
    raise exception 'Trainer role required';
  end if;

  select *
  into v_program
  from public.training_programs
  where id=p_program_id
    and created_by=auth.uid()
  for update;

  if not found then
    raise exception 'Training program not found';
  end if;

  if v_program.status='active' or v_program.is_active then
    raise exception 'Active training program cannot be deleted';
  end if;

  if exists(
    select 1 from public.workout_sessions ws
    where ws.program_id=p_program_id
  ) then
    raise exception 'Training program with workout history cannot be deleted';
  end if;

  perform set_config('app.training_program_delete_id',p_program_id::text,true);

  delete from public.training_programs
  where id=p_program_id
    and created_by=auth.uid();

  if not found then
    raise exception 'Training program could not be deleted';
  end if;

  return p_program_id;
end;
$function$;

revoke all on function public.delete_unused_training_program(uuid) from public;
revoke all on function public.delete_unused_training_program(uuid) from anon;
grant execute on function public.delete_unused_training_program(uuid) to authenticated;
