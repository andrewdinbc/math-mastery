# Standard: Local Roster Folder Pattern

## What it is
A shared client-side library (`lib/roster-folder.js`) using the File
System Access API (Chrome/Edge only) so any product can:
1. One-time: user picks a parent folder (Documents/Downloads/anywhere),
   app creates/reuses a "Roster Manager" subfolder there, permission is
   remembered.
2. Every subsequent use: a single button press automatically checks that
   exact folder - opens the roster file if found, or clearly tells the
   user it couldn't find it (offering to create new / locate manually).

No product may auto-access the filesystem without this explicit one-time
grant - that's a hard browser security boundary, not a design choice.

## Reference implementation
`andrewdinbc/math-mastery`:
- `lib/roster-folder.js` - the library itself (setupRosterFolder,
  findRosterFile, saveRosterFile, hasRosterFolderSetUp,
  isRosterFolderSupported)
- `app/dashboard/roster/page.js` - real usage: "Set Up Roster Folder"
  (one-time) + "Look for Roster File" (button-press check)

## Standard filename convention
`roster.csv` inside the "Roster Manager" folder, format:
`qr_code,first_name` (header row + one line per student).

## Products this applies to (student data holders)
- parent-portal (already has a compatible local-document convention per
  the June 2026 spec - QR<->name<->parent-email lives on the teacher's
  own computer; this library formalizes/upgrades that into the same
  reusable pattern instead of an ad-hoc document)
- Math Mastery (done - reference implementation)
- Assessment Tool (once its own roster/student-review UI is built)
- Lesson Planner (if/when it gains its own student-facing data)
- TeacherAssist BC/AB/ON (wherever licence-key/student data intersects)
- Writing Checker and any future product touching student data

## Canada data residency (separate, larger effort - see task queue)
Every product holding student data should ultimately run on a
`ca-central-1` Supabase project, not `us-west-1`. Math Mastery's current
project is `us-west-1` (created before this requirement was set) - needs
migration too, not just new products.
