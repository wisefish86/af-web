-- Browser/API roles do not need schema-changing table privileges.
-- Keep CRUD grants/RLS unchanged; remove only TRUNCATE, REFERENCES and TRIGGER.

revoke truncate,references,trigger on all tables in schema public from authenticated,anon;

alter default privileges in schema public
  revoke truncate,references,trigger on tables from authenticated,anon;
