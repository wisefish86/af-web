alter table public.training_programs
  alter column is_active set default false;

update public.training_programs
set is_active=(status='active')
where is_active is distinct from (status='active');

create or replace function public.normalize_training_program_active()
returns trigger
language plpgsql
set search_path to 'public','pg_temp'
as $function$
begin
  new.is_active := (new.status='active');
  return new;
end;
$function$;

drop trigger if exists trg_normalize_training_program_active on public.training_programs;
create trigger trg_normalize_training_program_active
before insert or update of status,is_active
on public.training_programs
for each row execute function public.normalize_training_program_active();

alter table public.training_programs
  drop constraint if exists training_programs_status_active_consistency;

alter table public.training_programs
  add constraint training_programs_status_active_consistency
  check (is_active=(status='active'));

create unique index if not exists training_programs_one_active_per_client
on public.training_programs(client_id)
where client_id is not null and status='active';

create or replace function public.activate_training_program(p_program_id uuid)
returns uuid
language plpgsql
set search_path to 'public','pg_temp'
as $function$
declare
  v_user uuid:=auth.uid();
  v_client uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  select tp.client_id into v_client
  from public.training_programs tp
  where tp.id=p_program_id and tp.created_by=v_user
  for update;

  if not found then raise exception 'Program not found or access denied'; end if;
  if v_client is null then raise exception 'Assign the program to a client before publishing'; end if;

  if not exists(
    select 1 from public.coach_clients cc
    where cc.coach_id=v_user and cc.client_id=v_client and cc.status='active'
  ) then raise exception 'Client is not assigned to this trainer'; end if;

  if not exists(select 1 from public.training_days td where td.program_id=p_program_id) then
    raise exception 'Program has no sessions';
  end if;

  if exists(
    select 1
    from public.training_days td
    where td.program_id=p_program_id
      and not exists(select 1 from public.program_exercises pe where pe.training_day_id=td.id)
      and not exists(select 1 from public.program_cardio_blocks pcb where pcb.training_day_id=td.id)
  ) then
    raise exception 'Every session must contain at least one exercise or cardio block';
  end if;

  perform pg_advisory_xact_lock(hashtext('training:'||v_client::text));

  update public.training_programs
  set status='archived',updated_at=now()
  where client_id=v_client
    and status='active'
    and id<>p_program_id;

  update public.training_programs
  set status='active',updated_at=now()
  where id=p_program_id and created_by=v_user;

  return p_program_id;
end;
$function$;

revoke execute on function public.activate_training_program(uuid) from public,anon;
grant execute on function public.activate_training_program(uuid) to authenticated;
