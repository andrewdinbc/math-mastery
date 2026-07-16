-- Calendar events -- teacher-created, visible to their students.
-- Run once in Supabase SQL Editor (math-mastery project).
-- NOTE: uses mastery_teachers, not the "teachers" table in schema.sql --
-- that file is stale; mastery_teachers/mastery_students/mastery_micro_units
-- are the real live tables (confirmed via app/api/micro-units/route.js).

create table if not exists mastery_events (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references mastery_teachers(id) on delete cascade,
  title text not null,
  description text,
  event_date date not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_mastery_events_teacher on mastery_events (teacher_id);
create index if not exists idx_mastery_events_date on mastery_events (event_date);

alter table mastery_events enable row level security;

create policy "teacher manages own events" on mastery_events
  for all using (auth.uid() = teacher_id) with check (auth.uid() = teacher_id);

-- Students need read access to their own teacher's events. Since student
-- access in this app goes through the service-role API layer (qrCode-based,
-- no student auth session), this policy is a formality for any future
-- teacher-authenticated direct read; the actual student-facing read goes
-- through /api/events using the service role key, same pattern as
-- /api/practice-home.
