
create or replace function public.delete_client_account_hard(p_client_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public','private','auth','pg_temp'
as $function$
begin
  if auth.role()<>'service_role' then
    raise exception 'Service role required';
  end if;

  perform public.purge_client_profile_data(p_client_id);

  delete from auth.users where id=p_client_id;
  if not found then
    raise exception 'Auth user not found';
  end if;
end;
$function$;

revoke all on function public.delete_client_account_hard(uuid) from public,anon,authenticated;
grant execute on function public.delete_client_account_hard(uuid) to service_role;
