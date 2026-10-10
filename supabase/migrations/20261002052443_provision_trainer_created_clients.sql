
create or replace function public.provision_trainer_created_client(
  p_client_id uuid,
  p_coach_id uuid
) returns void
language plpgsql
security definer
set search_path to 'public','private','pg_temp'
as $function$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required';
  end if;

  if not exists(select 1 from public.profiles where id=p_coach_id and role='trainer') then
    raise exception 'Trainer not found';
  end if;
  if not exists(select 1 from public.profiles where id=p_client_id and role='client') then
    raise exception 'Client not found';
  end if;

  insert into public.coach_clients(coach_id,client_id,status,started_at)
  values(p_coach_id,p_client_id,'active',current_date)
  on conflict(coach_id,client_id) do update
  set status='active',ended_at=null;

  insert into public.client_modules(client_id,module_code,enabled,assigned_by,settings)
  values
    (p_client_id,'nutrition',true,p_coach_id,'{"tracking_mode":"auto"}'::jsonb),
    (p_client_id,'training',true,p_coach_id,'{}'::jsonb),
    (p_client_id,'progress',true,p_coach_id,'{}'::jsonb),
    (p_client_id,'checkins',true,p_coach_id,'{}'::jsonb),
    (p_client_id,'notifications',true,p_coach_id,'{}'::jsonb)
  on conflict(client_id,module_code) do update
  set enabled=true,ends_at=null,assigned_by=excluded.assigned_by,updated_at=now();

  perform private.apply_default_client_setup(p_client_id,p_coach_id);
end;
$function$;

revoke all on function public.provision_trainer_created_client(uuid,uuid) from public,anon,authenticated;
grant execute on function public.provision_trainer_created_client(uuid,uuid) to service_role;
