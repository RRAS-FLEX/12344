-- Adds the news_posts table for the public News page: Nautiplex platform
-- announcements and general local Thassos content, both under one feed.

create table public.news_posts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  excerpt text not null,
  content text not null,
  category text not null check (category in ('nautiplex', 'thassos')),
  cover_image text,
  author_name text,
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.news_posts enable row level security;

create policy "Public can read published news posts"
  on public.news_posts for select
  using (status = 'published');

create trigger set_news_posts_updated_at
  before update on public.news_posts
  for each row execute function public.set_updated_at();

-- Seed placeholder posts so the page isn't empty on first load.
-- Replace/add real content via the Supabase Studio table editor.
insert into public.news_posts (slug, title, excerpt, content, category, author_name, status, published_at)
values
  (
    'welcome-to-nautiplex-news',
    'Welcome to Nautiplex News',
    'A new place for platform updates and local Thassos happenings.',
    'We''re launching a News section to keep you in the loop on two fronts: what''s new on Nautiplex, and what''s happening around Thassos.' || chr(10) || chr(10) ||
    'Expect short updates on new destinations, feature releases, and platform changes here, alongside general local content for anyone planning a trip to the island.' || chr(10) || chr(10) ||
    'More posts coming soon.',
    'nautiplex',
    'Nautiplex Team',
    'published',
    now()
  ),
  (
    'thassos-island-at-a-glance',
    'Thassos at a glance',
    'A quick look at the island for first-time visitors planning a boat trip.',
    'Thassos is the northernmost Greek island in the Aegean, known for pine-covered hills that run down to the coastline and unusually clear water.' || chr(10) || chr(10) ||
    'Limenas, the main port town, is the most common departure point for boat trips, with easy access to nearby bays and the rest of the island''s coastline.' || chr(10) || chr(10) ||
    'This post will be replaced with real, regularly-updated local content.',
    'thassos',
    'Nautiplex Team',
    'published',
    now()
  );
