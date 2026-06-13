create extension if not exists pgcrypto;

create table if not exists public.notes (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  subject text not null,
  tags text[] not null default '{}',
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  font_size integer not null default 16 check (font_size between 14 and 21),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists notes_set_updated_at on public.notes;
create trigger notes_set_updated_at
before update on public.notes
for each row execute function public.set_updated_at();

drop trigger if exists subjects_set_updated_at on public.subjects;
create trigger subjects_set_updated_at
before update on public.subjects
for each row execute function public.set_updated_at();

drop trigger if exists user_settings_set_updated_at on public.user_settings;
create trigger user_settings_set_updated_at
before update on public.user_settings
for each row execute function public.set_updated_at();

alter table public.notes enable row level security;
alter table public.subjects enable row level security;
alter table public.user_settings enable row level security;

drop policy if exists "Users can read own notes" on public.notes;
create policy "Users can read own notes"
on public.notes for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own notes" on public.notes;
create policy "Users can insert own notes"
on public.notes for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update own notes" on public.notes;
create policy "Users can update own notes"
on public.notes for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete own notes" on public.notes;
create policy "Users can delete own notes"
on public.notes for delete
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can read own subjects" on public.subjects;
create policy "Users can read own subjects"
on public.subjects for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own subjects" on public.subjects;
create policy "Users can insert own subjects"
on public.subjects for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update own subjects" on public.subjects;
create policy "Users can update own subjects"
on public.subjects for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete own subjects" on public.subjects;
create policy "Users can delete own subjects"
on public.subjects for delete
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can read own settings" on public.user_settings;
create policy "Users can read own settings"
on public.user_settings for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own settings" on public.user_settings;
create policy "Users can insert own settings"
on public.user_settings for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update own settings" on public.user_settings;
create policy "Users can update own settings"
on public.user_settings for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.notes to authenticated;
grant select, insert, update, delete on public.subjects to authenticated;
grant select, insert, update on public.user_settings to authenticated;

alter table public.notes replica identity full;
alter table public.subjects replica identity full;
alter table public.user_settings replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.notes;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.subjects;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.user_settings;
exception
  when duplicate_object then null;
end $$;
