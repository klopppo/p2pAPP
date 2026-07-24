-- Add social link columns to users table for the Edit Profile page.
-- Safe to run repeatedly (IF NOT EXISTS).

alter table public.users add column if not exists website text;
alter table public.users add column if not exists twitter_handle text;
alter table public.users add column if not exists telegram_handle text;
alter table public.users add column if not exists github_handle text;
