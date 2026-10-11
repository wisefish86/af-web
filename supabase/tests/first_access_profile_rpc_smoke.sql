-- First-access setup RPC must work for an authenticated client without table UPDATE grants.
begin;

do $$
declare
  v_client uuid;
  v_before_name text;
  v_before_nickname text;
  v_before_age integer;
  v_before_must_set boolean;
  v_result text;
begin
  select p.id,p.display_name,p.nickname,p.age,p.must_set_password
  into v_client,v_before_name,v_before_nickname,v_before_age,v_before_must_set
  from public.profiles p
  where p.role='client'
  order by p.created_at desc
  limit 1;

  if v_client is null then raise exception 'Client profile required'; end if;

  perform set_config('request.jwt.claim.sub',v_client::text,true);
  set local role authenticated;

  v_result:=public.complete_my_access_setup_v2('QA First Access','qa',33);
  if v_result is distinct from 'QA First Access' then
    raise exception 'First access RPC returned wrong name';
  end if;

  reset role;

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
