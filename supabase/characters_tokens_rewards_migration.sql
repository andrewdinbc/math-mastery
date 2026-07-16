-- Character/avatar system + token economy + typed rewards.
-- Run once in Supabase SQL Editor (math-mastery project).

-- Global character catalog. character_type distinguishes mascots (chosen
-- as a companion, shown alongside the student) from avatars (represents
-- the student themselves -- male/female student characters Aj is adding).
create table if not exists mastery_characters (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  image_url text not null,
  character_type text not null default 'mascot' check (character_type in ('mascot', 'avatar')),
  created_at timestamptz not null default now()
);

-- Per-teacher enable/disable. A character with no row here defaults to
-- enabled (opt-out model) -- simplest for "just added 3 characters,
-- teacher hasn't configured anything yet" to still work out of the box.
create table if not exists mastery_teacher_characters (
  teacher_id uuid not null references mastery_teachers(id) on delete cascade,
  character_id uuid not null references mastery_characters(id) on delete cascade,
  enabled boolean not null default true,
  primary key (teacher_id, character_id)
);

-- Student's current mascot + avatar selection.
alter table mastery_students add column if not exists selected_mascot_id uuid references mastery_characters(id);
alter table mastery_students add column if not exists selected_avatar_id uuid references mastery_characters(id);

-- Token ledger (transaction log, not a running-total column) -- balance
-- is SUM(amount), auditable, and supports future spend transactions
-- (negative amount) once avatar customization/token-shop exists.
create table if not exists mastery_token_transactions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references mastery_students(id) on delete cascade,
  amount int not null,
  reason text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_token_transactions_student on mastery_token_transactions (student_id);

-- Reward catalog -- teacher-defined, either a virtual badge or a real
-- physical prize the teacher tracks themselves (this system doesn't
-- manage physical inventory, just records that it was earned/claimed).
create table if not exists mastery_rewards (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references mastery_teachers(id) on delete cascade,
  name text not null,
  description text,
  reward_type text not null check (reward_type in ('badge', 'prize')),
  token_cost int, -- null = not redeemable with tokens, only manually awarded
  created_at timestamptz not null default now()
);

-- Rewards a student has actually earned/been given.
create table if not exists mastery_student_rewards (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references mastery_students(id) on delete cascade,
  reward_id uuid not null references mastery_rewards(id) on delete cascade,
  awarded_at timestamptz not null default now(),
  claimed boolean not null default false -- for prize-type rewards: has the physical item been handed over
);

create index if not exists idx_student_rewards_student on mastery_student_rewards (student_id);

-- Seed the three character assets already committed to /public/characters.
-- Names are placeholders -- rename anytime via the teacher's character
-- manager UI once built.
insert into mastery_characters (name, image_url, character_type)
values
  ('Fable the Fox', '/characters/fox-fable.png', 'mascot'),
  ('Scout the Robot', '/characters/robot-scout.png', 'mascot'),
  ('Professor Hoot', '/characters/owl-professor.png', 'mascot')
on conflict do nothing;
