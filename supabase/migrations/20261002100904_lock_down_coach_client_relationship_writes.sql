
revoke insert, update, delete, truncate on table public.coach_clients from authenticated;
revoke insert, update, delete, truncate on table public.coach_clients from anon;

grant select on table public.coach_clients to authenticated;
