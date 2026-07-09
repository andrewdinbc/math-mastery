# Mastery Studio — Project Spec
(repo: andrewdinbc/math-mastery — rename pending, see Naming below)

## What this product is
Three integrated purposes in one product:
1. **Mastery practice** — Keller Model / PSI (Personalized System of Instruction)
   applied to math: self-paced, mastery-gated micro-units, AI-as-proctor.
2. **QR/lesson-planner delivery** — micro-units are authored by the teacher
   inside Lesson Planner (not a separate authoring tool), delivered via the
   same QR-code worksheet pattern already built for Student Portfolio
   (parent-portal), in three modes: pre-printed w/ student QR, blank
   lined paper w/ student writing their own name, or fully online.
3. **Teacher assessment analytics** — CoGrader-style holistic breakdown
   (Overview / Patterns / Strengths / Areas for Growth) per student and per
   class, shared in spirit with the analytics already built into
   assessment-tool — this becomes a real shared capability, not a one-off.

## Naming
Working name: "Mastery Studio". Aj to confirm/override before this goes
public-facing (repo/Vercel project rename is a separate, low-risk queued
step — doesn't block building the actual product under the existing
math-mastery repo name).

## Pedagogical model (Keller Model / PSI + ARCS motivation layer)
- Self-paced: student moves through micro-units at their own speed.
- Mastery-gated: can't advance until hitting a mastery threshold. Threshold
  is teacher-set PER STUDENT (differentiable, not one bar for the class).
- Modular: courses = small, testable micro-units, authored in Lesson Planner.
- AI as proctor: marks automatically against the threshold.
- AI remediation ("chalkboard" style): on error, generate a targeted mini-
  lesson showing the SPECIFIC mistake the student made and how to avoid it,
  then return student to practice (not a generic re-teach).
- ARCS): unit framing, feedback tone, and remediation content should reflect
  Attention/Relevance/Confidence/Satisfaction — not just correctness.

## Delivery mechanics
- Reuses parent-portal's QR/AI-marking pattern: app/api/qr-worksheet,
  app/api/qr-worksheet/bulk, app/api/mark-submission (adapt, don't
  duplicate blindly — math has structured numeric/algebraic answers, not
  free-text rubric marking, so mark-submission's AI marking logic needs a
  math-specific variant, not a copy-paste).
- Question randomization: teacher-facing toggle per micro-unit. Randomizes
  numeric operands/coefficients while preserving the underlying skill and
  difficulty (reference: attached CommonCoreSheets "Using Substitutions"
  worksheet — same question structure, randomized values, includes an
  answer key page).
- Three delivery modes per micro-unit: (a) pre-printed, student QR
  top-right (matches parent-portal's existing bulk PDF generator), (b)
  blank/lined page, student writes name (QR still present, scanned after
  the fact), (c) fully online (no print step at all).

## Data model (see schema.sql)
- micro_units: authored in Lesson Planner, referenced here by id.
- student_mastery_thresholds: per-student, per-unit override of the
  default mastery %, set by teacher.
- attempts: every submission (online or scanned), raw answers + AI marking
  result + pass/fail against that student's threshold.
- remediation_sessions: AI-generated targeted mini-lesson content tied to
  a specific failed attempt, plus the follow-up practice set.

## Grading/assessment data boundary
Same hard architectural boundary as Student Portfolio (memory #19):
assessment/mastery data lives in RLS-locked tables, never queried by any
student-facing or parent-facing route.

## Build stages
1. [THIS SESSION] Spec + Supabase schema committed.
2. [QUEUED] Core app: teacher dashboard, student practice flow, Supabase
   Auth (matching lesson-planner's per-user pattern).
3. [QUEUED] AI marking + remediation engine (math-specific, not a copy of
   parent-portal's rubric marker).
4. [QUEUED] QR/print delivery, adapted from parent-portal's bulk generator.
5. [QUEUED] Teacher analytics page (Overview/Patterns/Strengths/Growth),
   built as a genuinely shared component — also wired into assessment-tool
   per Aj's explicit request, not duplicated logic in two places.
6. [QUEUED] Dev Mode wired in (per Aj's earlier request this session).
7. [QUEUED] Lesson Planner integration: micro-unit authoring UI.
8. [QUEUED] Assessment Tool integration: consume Mastery Studio's
   analytics data alongside its existing rubric-based review.

Stages 2-8 are queued as separate, fully-specced Hyperion tasks rather than
one giant task, since each is independently buildable/reviewable and this
is legitimately multi-day scope, not a same-session build.
