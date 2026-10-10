
revoke all on function public.create_client_invite(integer) from public,anon,authenticated;
revoke all on function public.accept_client_invite(text) from public,anon,authenticated;
revoke all on function public.revoke_client_invite(uuid) from public,anon,authenticated;
