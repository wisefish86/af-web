-- Allow delete_unused_training_program() to cascade through immutable child rows
-- and let FK SET NULL maintenance run only inside the same checked delete transaction.

create or replace function public.guard_training_program_child()
returns trigger
language plpgsql
set search_path to 'public','pg_temp'
as $function$
declare
  v_day_id uuid;
  v_program_id uuid;
  v_status text;
  v_created_by uuid;
begin
  if auth.role()='service_role' then
    return case when tg_op='DELETE' then old else new end;
  end if;

  if tg_table_name='training_days' then
    v_program_id:=case when tg_op='DELETE' then old.program_id else new.program_id end;
  elsif tg_table_name='program_exercises' then
    v_day_id:=case when tg_op='DELETE' then old.training_day_id else new.training_day_id end;
    select td.program_id into v_program_id from public.training_days td where td.id=v_day_id;
  elsif tg_table_name='program_cardio_blocks' then
    v_day_id:=case when tg_op='DELETE' then old.training_day_id else new.training_day_id end;
    select td.program_id into v_program_id from public.training_days td where td.id=v_day_id;
  end if;

  if tg_op='DELETE'
     and v_program_id is not null
     and current_setting('app.training_program_delete_id',true)=v_program_id::text then
    return old;
  end if;

  if v_program_id is not null then
    select tp.status,tp.created_by into v_status,v_created_by
    from public.training_programs tp where tp.id=v_program_id;

    if v_status='active'
       and current_setting('app.training_program_inplace_edit_id',true)=v_program_id::text
       and v_created_by=auth.uid()
       and exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='trainer') then
      return case when tg_op='DELETE' then old else new end;
    end if;

    if v_status is distinct from 'draft' then
      raise exception 'Published training program content is immutable; create a new version';
    end if;
  end if;

  return case when tg_op='DELETE' then old else new end;
end;
$function$;

create or replace function public.guard_published_training_program()
returns trigger
language plpgsql
set search_path to 'public','pg_temp'
as $function$
declare
  v_delete_id text;
begin
  if auth.role()='service_role' then
    return case when tg_op='DELETE' then old else new end;
  end if;

  v_delete_id:=current_setting('app.training_program_delete_id',true);

  if tg_op='DELETE' then
    if old.status='draft'
       and not exists(select 1 from public.workout_sessions ws where ws.program_id=old.id) then
      return old;
    end if;

    if old.status<>'active'
       and v_delete_id=old.id::text
       and old.created_by=auth.uid()
       and exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='trainer')
       and not exists(select 1 from public.workout_sessions ws where ws.program_id=old.id) then
      return old;
    end if;

    raise exception 'Used or active training programs are protected history and cannot be deleted';
  end if;

  if v_delete_id is not null
     and v_delete_id<>''
     and old.created_by=auth.uid()
     and exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='trainer')
     and (old.supersedes_program_id::text=v_delete_id or old.source_template_id::text=v_delete_id)
     and (to_jsonb(new)-array['supersedes_program_id','source_template_id','updated_at']::text[])
         is not distinct from
         (to_jsonb(old)-array['supersedes_program_id','source_template_id','updated_at']::text[]) then
    return new;
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
