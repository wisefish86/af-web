-- Edge Functions use service_role through PostgREST. Explicit table grants are still required.
grant select,insert,update on table public.client_invites to service_role;
