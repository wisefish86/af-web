do $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from information_schema.role_table_grants
  where grantee in ('authenticated','anon')
    and table_schema='public'
    and privilege_type in ('TRUNCATE','REFERENCES','TRIGGER');

  if v_count<>0 then
    raise exception 'Unexpected non-app table privileges remain: %',v_count;
  end if;
end $$;
