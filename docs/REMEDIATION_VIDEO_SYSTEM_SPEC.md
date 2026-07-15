# Remediation Video & Verification System — Spec
_Captured 2026-07-15. New system, separate from the global Educational AI Steering library._

## Why this is a separate system, not a steering-doc extension
Steering documents are globally injected background context — always present, never queried by topic. What this feature needs is the opposite: **targeted retrieval** ("student has a multiplication error → pull multiplication remediation content specifically") plus **generation and verification** (video creation, student interaction, correctness checking) that steering docs have no mechanism for. This is a new pipeline with its own data model and its own UI surface.

## Problem this solves
When a product (Math Mastery, Assessment Tool, etc.) detects that a student is making a specific, classifiable math error, the system should be able to:
1. Look up the correction *process* for that specific error type (not just the general subject).
2. Generate a short remedial video that walks the student through that process step-by-step.
3. Have the student follow along interactively.
4. Verify the student actually corrected the error before letting them move on.

## Architecture — 4 components

### 1. Structured Remediation Knowledge Base (Supabase, ca-central-1, RLS)
Replaces "hope the AI finds it in a big text blob" with real structured lookup.

Table: `math_remediation_patterns`
- `id`, `topic` (e.g. "multiplication"), `chapter_ref` (source citation, e.g. "Sherman et al. 2013, Ch. 5")
- `error_pattern_name` (e.g. "Recycling Carry Numerals")
- `error_type` (enum: conceptual | procedural)
- `diagnostic_signs` (text — what the error looks like in student work, used for AI error-classification matching)
- `correction_steps` (JSONB ordered array — the actual step-by-step remediation process, structured for direct use as a video script outline, not prose)
- `verification_criteria` (text — what "corrected" looks like, used by the AI checker in step 4)

Seed data: the 9-chapter content I just added to the steering library, restructured into rows (one row per named error pattern, ~25-30 rows total from this book). Admin-only write access (same pattern as steering docs), same upload flow (PDF/paste/web source) but parsed into structured rows instead of a flat blob.

### 2. Error Classification (wiring into existing detection)
Whichever product first notices the student is struggling (Math Mastery's adaptive drill engine is the obvious existing candidate — it already has live interactive drills and progress tracking) classifies the observed error against `diagnostic_signs` in the knowledge base to find the matching `error_pattern_name`. This is a lookup/matching call, not a new detection system — reuse Math Mastery's existing error capture if it has one; otherwise this classification step needs to be built there first.

### 3. Video Generation Pipeline
Input: the matched `correction_steps` JSONB.
Output: a short narrated step-by-step video.
- Script generation: turn `correction_steps` into a narration script + on-screen visual cues (Claude API, text generation — cheap, already have the pattern from other Hyperion pipelines)
- Visuals: likely simple animated/illustrated steps rather than filmed video — e.g. an HTML5/canvas-based step-through animation (consistent with existing HTML5 game-building pattern already used for phonics/math games) rather than true video rendering, which is far more expensive and complex to build/host
- Audio: TTS narration synced to each step
- Recommend building this as an **interactive step-through component** (HTML5 canvas or React state machine) rather than a literal rendered video file — cheaper, more flexible, and directly supports the interactive "follow along" requirement in #4 without needing video-scrubbing/replay logic

### 4. Interactive Follow-Along + Verification
- Student works through the step-through component, one step at a time (matches the 5-step general process already in the knowledge base: concrete model → discrepancy → step-by-step rebuild → student explains divergence → independent retry)
- At the final step, student attempts 1-2 problems from their original error set independently (this mirrors the book's own verification method)
- AI checks the student's work against `verification_criteria` for that error pattern
- Pass → mark error pattern resolved, unlock progression
- Fail → loop back to step-through with a variation, do not silently advance

## Build sequencing
1. Supabase table + admin UI for structured remediation patterns (reuse steering-doc UI patterns: PDF/paste/web-source intake, parsed into rows instead of blob)
2. Seed with this book's 9 chapters (~25-30 rows) — can reuse the paraphrased content already in the steering library as source material
3. Wire lookup/matching into Math Mastery's existing error-detection (or build classification if none exists)
4. Build the interactive step-through component (start with multiplication as the pilot topic since it's the most fully modeled)
5. Build the verification checker
6. Expand to remaining 8 topics once the pilot works end-to-end

## Explicitly out of scope for v1
- True rendered video (canvas/React step-through is the v1 approach)
- Multi-book knowledge base (single source book for v1, architecture supports more later)
- Cross-product reuse beyond Math Mastery (v1 targets Math Mastery only; Assessment Tool integration is a follow-on)
