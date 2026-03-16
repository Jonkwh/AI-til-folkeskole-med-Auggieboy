-- Run this if you already applied the original migration.sql
-- This adds the missing delete policy for messages.

create policy "Users can delete messages in own sessions"
  on public.messages for delete
  using (
    exists (
      select 1 from public.chat_sessions
      where chat_sessions.id = messages.session_id
        and chat_sessions.user_id = auth.uid()
    )
  );
