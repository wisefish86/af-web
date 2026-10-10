delete from public.qa_tokens where used_at is not null or expires_at<=now();
