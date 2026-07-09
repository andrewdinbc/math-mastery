-- Mastery Studio (math-mastery) — Supabase schema
-- Mirrors patterns from lesson-planner (Supabase Auth, per-user) and
-- parent-portal (QR submission, RLS grading boundary — memory #19).

create extension if not exists "uuid-ossp";

-- Teachers (mirrors lesson-planner's auth pattern, Supabase Auth uid as PK)
create table if not exists teachers (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  created_at timestamptz default now()
);

-- Micro-units authored in Lesson Planner, referenced here by id.
-- Lesson Planner owns authoring; this table is the read/consume side plus
-- the fields specific to mastery delivery (randomization, default threshold).
create table if not exists micro_units (
  id uuid primary key default uuid_generate_v4(),
  teacher_id uuid references teachers(id) on delete cascade,
  lesson_planner_ref text, -- foreign reference into lesson-planner's plan tree, not a hard FK (separate DB)
  title text not null,
  grade text,
  strand text, -- e.g. "algebra", "number_sense", matches lesson-planner's curriculum tagging
  question_template jsonb not null, -- structured template: operation, variable ranges, comparison type - powers randomization
  randomizable boolean default true,
  default_mastery_pct int default 80 check (default_mastery_pct between 0 and 100),
  question_count int default 11, -- matches the CommonCoreSheets reference format
  created_at timestamptz default now()
);

-- Students (name/id mapping stays teacher-side per QR privacy pattern,
-- same as parent-portal - never expose real names to AI marking prompts
-- unless necessary for personalization).
create table if not exists students (
  id uuid primary key default uuid_generate_v4(),
  teacher_id uuid references teachers(id) on delete cascade,
  qr_code text unique not null,
  display_name text, -- teacher-facing only
  created_at timestamptz default now()
);

-- Per-student, per-unit mastery threshold override. Falls back to the
-- micro_unit's default_mastery_pct when no row exists here - this is what
-- makes differentiation possible without a row for every student x unit.
create table if not exists student_mastery_thresholds (
  id uuid primary key default uuid_generate_v4(),
  student_id uuid references students(id) on delete cascade,
  micro_unit_id uuid references micro_units(id) on delete cascade,
  mastery_pct int not null check (mastery_pct between 0 and 100),
  set_by uuid references teachers(id),
  created_at timestamptz default now(),
  unique(student_id, micro_unit_id)
);

-- Every attempt (scanned or online). This is assessment data - RLS-locked,
-- same hard boundary as parent-portal's qr_teacher_assessment (memory #19).
-- Never queried by any student-facing route directly; student view reads
-- only a derived pass/fail + unit-complete flag via a teacher-approved API,
-- never this table.
create table if not exists attempts (
  id uuid primary key default uuid_generate_v4(),
  student_id uuid references students(id) on delete cascade,
  micro_unit_id uuid references micro_units(id) on delete cascade,
  submitted_via text check (submitted_via in ('scan', 'blank_scan', 'online')),
  raw_answers jsonb not null,
  ai_marking_result jsonb, -- per-question correct/incorrect + specific error type
  score_pct numeric,
  passed_threshold boolean,
  attempt_number int default 1, -- nth attempt at this unit for this student
  created_at timestamptz default now()
);

-- AI-generated targeted remediation, tied to a specific failed attempt.
-- "Chalkboard style": isolates the exact mistake, not a generic re-teach.
create table if not exists remediation_sessions (
  id uuid primary key default uuid_generate_v4(),
  attempt_id uuid references attempts(id) on delete cascade,
  error_pattern text, -- classified mistake type, e.g. "sign_error_on_division"
  remediation_content jsonb not null, -- the generated mini-lesson (steps, worked example, explanation)
  follow_up_question_ids jsonb, -- practice set generated to re-test the specific error pattern
  resolved boolean default false, -- true once student passes the follow-up
  created_at timestamptz default now()
);

-- Enable RLS on assessment-boundary tables per memory #19's hard boundary.
alter table attempts enable row level security;
alter table remediation_sessions enable row level security;
alter table student_mastery_thresholds enable row level security;

create policy "teachers see own students attempts" on attempts
  for select using (
    student_id in (select id from students where teacher_id = auth.uid())
  );

create policy "teachers manage own micro_units" on micro_units
  for all using (teacher_id = auth.uid());

create policy "teachers manage own students" on students
  for all using (teacher_id = auth.uid());
