
create table if not exists public.notification_channel_topic_preferences(
  user_id uuid not null references public.profiles(id) on delete cascade,
  channel text not null,
  topic_code text not null,
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key(user_id,channel,topic_code),
  constraint notification_channel_topic_channel_check check(channel in ('telegram','web_push')),
  constraint notification_channel_topic_code_check check(topic_code in ('feedback','workouts','progress','nutrition','checkins','general'))
);

alter table public.notification_channel_topic_preferences enable row level security;

drop policy if exists notification_channel_topic_select_own on public.notification_channel_topic_preferences;
create policy notification_channel_topic_select_own
on public.notification_channel_topic_preferences
for select to authenticated
using(user_id=(select auth.uid()));

drop policy if exists notification_channel_topic_insert_own on public.notification_channel_topic_preferences;
create policy notification_channel_topic_insert_own
on public.notification_channel_topic_preferences
for insert to authenticated
with check(user_id=(select auth.uid()));

drop policy if exists notification_channel_topic_update_own on public.notification_channel_topic_preferences;
create policy notification_channel_topic_update_own
on public.notification_channel_topic_preferences
for update to authenticated
using(user_id=(select auth.uid()))
with check(user_id=(select auth.uid()));

drop policy if exists notification_channel_topic_delete_own on public.notification_channel_topic_preferences;
create policy notification_channel_topic_delete_own
on public.notification_channel_topic_preferences
for delete to authenticated
using(user_id=(select auth.uid()));

revoke all on table public.notification_channel_topic_preferences from anon;
grant select,insert,update,delete on table public.notification_channel_topic_preferences to authenticated;
