-- Supabase migration: create tables for social-hub

create table if not exists public.posts (
  id text primary key,
  user_id text not null,
  caption text not null,
  social_account_ids text[] not null default '{}',
  media_urls text[],
  scheduled_at timestamptz,
  status text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.connected_account_events (
  user_id text not null,
  account_id text not null,
  platform text not null,
  received_at timestamptz not null default now(),
  primary key (user_id, account_id)
);

create index if not exists posts_user_id_idx on public.posts (user_id);
create index if not exists posts_created_at_idx on public.posts (created_at desc);
create index if not exists connected_account_events_user_id_idx on public.connected_account_events (user_id);
