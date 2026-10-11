-- Telegram invite acceptance initializes a newly created client profile through PostgREST.
-- service_role bypasses RLS but still needs SQL column privileges.
grant update (display_name,login_alias,nickname,age,must_set_password,updated_at)
on table public.profiles
to service_role;
