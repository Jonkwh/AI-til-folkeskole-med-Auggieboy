-- ============================================
-- ThinkBot Database Schema
-- Run this in the Supabase SQL Editor
-- ============================================

-- Table: profiles
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Table: chat_sessions
create table if not exists public.chat_sessions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  title text not null default 'New chat',
  masterprompt text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Table: messages
create table if not exists public.messages (
  id uuid default gen_random_uuid() primary key,
  session_id uuid references public.chat_sessions on delete cascade not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Indexes
create index if not exists idx_chat_sessions_user_id on public.chat_sessions(user_id);
create index if not exists idx_messages_session_id on public.messages(session_id);

-- ============================================
-- Row Level Security (RLS)
-- ============================================

-- Enable RLS on all tables
alter table public.profiles enable row level security;
alter table public.chat_sessions enable row level security;
alter table public.messages enable row level security;

-- Profiles: users can only read/update their own profile
create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- Chat sessions: users can only CRUD their own sessions
create policy "Users can view own chat sessions"
  on public.chat_sessions for select
  using (auth.uid() = user_id);

create policy "Users can create own chat sessions"
  on public.chat_sessions for insert
  with check (auth.uid() = user_id);

create policy "Users can update own chat sessions"
  on public.chat_sessions for update
  using (auth.uid() = user_id);

create policy "Users can delete own chat sessions"
  on public.chat_sessions for delete
  using (auth.uid() = user_id);

-- Messages: users can only CRUD messages in their own sessions
create policy "Users can view messages in own sessions"
  on public.messages for select
  using (
    exists (
      select 1 from public.chat_sessions
      where chat_sessions.id = messages.session_id
        and chat_sessions.user_id = auth.uid()
    )
  );

create policy "Users can insert messages in own sessions"
  on public.messages for insert
  with check (
    exists (
      select 1 from public.chat_sessions
      where chat_sessions.id = messages.session_id
        and chat_sessions.user_id = auth.uid()
    )
  );

create policy "Users can delete messages in own sessions"
  on public.messages for delete
  using (
    exists (
      select 1 from public.chat_sessions
      where chat_sessions.id = messages.session_id
        and chat_sessions.user_id = auth.uid()
    )
  );

-- ============================================
-- Auto-create profile on signup
-- ============================================
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer;

-- Trigger to auto-create profile
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
