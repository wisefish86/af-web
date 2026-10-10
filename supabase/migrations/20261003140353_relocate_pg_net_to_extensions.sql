drop extension if exists pg_net;
drop schema if exists net cascade;
create extension if not exists pg_net with schema extensions;
