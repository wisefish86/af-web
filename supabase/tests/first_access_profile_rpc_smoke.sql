-- First-access setup RPC must work for an authenticated client without table UPDATE grants.
-- All writes are rolled back.
begin;

select set_config(
  'request.jwt.claim.sub',
  (select p.id::text from public.profiles p where p.role='client' order by p.created_at desc limit 1),
  true
);

set local role authenticated;

select public.complete_my_access_setup_v2('QA First Access','qa',33);

reset role;

do $$
declare
  v_client uuid:=nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
begin
  if v_client is null then raise exception 'Client profile required'; end if;

  if not exists(
    select 1 from public.profiles
    where id=v_client
      and display_name='QA First Access'
      and nickname='qa'
      and age=33
      and must_set_password=false
  ) then
    raise exception 'First access RPC did not update the client profile';
  end if;
end $$;

rollback;
