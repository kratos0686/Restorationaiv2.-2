# Field Companion App: Offline Capture, Safe Concurrent Saves, Meter OCR

Date: 2026-10-18. Status: ready for owner review. Approved in conversation by the owner; items marked **(my call)** are assumptions the owner has not seen.

## Intent and why
Field technicians document water-damage jobs on site: find the source, classify the water (clean/grey/black) and mold, decide what materials come out and why, photograph and log removals, dispose, dry, chemically treat (encapsulate if mold), leave. Their phones often have no signal (basements, flooded buildings). The owner wants a **native Android app for this field work only**; billing, admin, dashboards stay on the web/desktop app. The one thing that must never fail is **keeping working with no signal**.

Competitor research (Encircle Hydro, Paul Davis MICA, GoCanvas drying log) shows the winning pattern: minimal typing (OCR of meter photos, auto-labeled photos by room/time), guided S500 (IICRC water-damage standard) checklists, one shared job file visible live to the office, and insurer-ready reports.

## Goals
1. **Offline-first capture.** Photos, videos, drying readings, material readings and removal notes are written to the phone first and synced when signal returns. Each item shows pending/synced state. Photo upload runs in the background with retry and survives app restarts.
2. **Safe simultaneous editing.** Two techs (or tech + office) editing the same project never overwrite each other's data.
3. **Meter OCR.** Photographing a moisture meter or thermo-hygrometer pre-fills the reading form; the tech confirms or corrects before saving.
4. **Upload fix.** Media from any client lands in cloud storage, attached to the right project, never as a temporary blob URL.
5. **Server auth** on all new endpoints (verify Firebase ID tokens). Required because a shipped phone app cannot talk to an unauthenticated API. *(Not requested by the owner; added by me as a prerequisite.)*
6. The web/desktop app adopts the same item-level saves and a working offline queue, since both clients share the backend.

## Non-goals
- Billing, admin, dashboards, client portal in the native app.
- Native AR room scanning (ARCore). Out of scope for this project; revisit later.
- Replacing the web app or rewriting its other screens.
- iOS.

## Anti-goals (failure even if it "works")
- A tech waits on the network to take a photo or log a reading.
- Data silently lost while the UI says "saved". (Today the "Data Saved Locally" banner is false: see Current state.)
- A merge that silently drops one tech's entry.
- OCR values saved without the tech seeing them first.

## Current state (verified by code review)
- Data is nested in one Firestore doc per project (material tracking field is `dryingMonitor`, not `trackedMaterials`): `Project.rooms[]` (each with `readings[]`, `photos[]`), `dryingChambers[]`, `dryingMonitor[]` (tracked materials, each with `readings[]`), `videos[]`. Types in `types.ts`. Psychrometrics (GPP etc.) computed client-side in `utils/psychrometrics`.
- Writes go through `PATCH /projects/:id` replacing whole arrays (`onUpdate(Partial<Project>)`). Concurrent edits overwrite each other.
- Server (`server.ts`, Express + firebase-admin + GCS multer) has no auth middleware; `/login` and `/me` return the first user. Roles/permissions exist in types only.
- `services/api.ts` falls back to `data/mockApi` on fetch failure; offline writes go only to the mock and are lost.
- `uploadMedia` posts to `/projects/:id/media`, which does not exist; only `/upload` exists. Falls back to `URL.createObjectURL`, never re-uploaded.
- `services/SyncService.ts` is a localStorage retry queue but nothing enqueues to it. No IndexedDB or service worker for media.
- Web app picks mobile vs desktop layout by window width (`useWindowSize`, <768 = `MobileApp`).
- The existing `android/` folder is an unbuildable skeleton (no settings.gradle, version catalog, wrapper, MainActivity, resources, keystore, google-services.json). No JDK is installed on the dev machine.

## Design decisions (owner-decided unless marked)
1. **Native Kotlin/Compose Android app**, field workflow only. Owner's decision.
2. **Offline-first**: local database is the source of truth on the phone; sync is background. Owner's decision.
3. **Item-level data model.** Photos, readings, material readings, removal logs become individually addressed records (own ID, project/room/chamber reference, author, timestamp) instead of array elements. Server stores them as Firestore subcollections under the project **(my call)**. Appending is conflict-free by construction (unique client-generated IDs). Editing the same record twice: last write wins by server timestamp **(my call)**, with the losing edit kept in the record's history rather than discarded **(my call)**.
4. **Backward compatibility.** Existing nested project arrays remain readable; a migration/read-adapter exposes them as items. Cutover plan is the builder's job, but existing projects must not lose data.
5. **Sync API**: new authenticated endpoints for creating/updating items and for fetching changes since a cursor. Idempotent on client-generated ID so retries are safe. Exact shape is the builder's call.
6. **Media**: client uploads to a working endpoint (single route, project-scoped) that returns a durable URL; upload retries until success; the item references the media by ID while upload is pending.
7. **OCR**: on-device ML Kit text recognition first **(my call)**, Gemini via existing server AI endpoints as a fallback when on-device confidence is low **(my call)**. Always shown to the tech for confirmation. Targets: moisture meter reading, temperature, relative humidity. Fields saved with a flag recording they were OCR-prefilled and whether edited.
8. **Auth**: Firebase Auth on the phone; server verifies ID tokens and checks the user belongs to the project's company. Reuse existing roles/permissions types.
9. **Order of work**: backend (auth, items, upload) -> web client adoption and offline queue -> Android app. Each stage ships independently.

## Constraints
- Android minSdk 24, JDK 17 needed; existing Gradle skeleton targets compileSdk 36 and Hilt/Compose/Firebase.
- Firebase/Firestore/GCS and Express backend stay.
- Must work with intermittent, hours-long offline periods and large photo backlogs.

## Left to the builder
Local database choice (Room expected), sync/conflict mechanics beyond the rules above, API shapes, migration mechanics, background work scheduling, OCR confidence thresholds, project structure of the Android app, test strategy, and how to stage the rollout.

## Decisions added after reviewer questions
Owner-decided:
- **Conflicts: keep both, flag it.** On a conflicting edit to the same record, the most recently synced version becomes current, the older version is kept in the record's history, and the record is flagged "edited by two people" for office review. Nothing is silently lost. The history and flag are visible to the office in the web app.
- **Media: photos only in the native app**, compressed on the phone (about 1-2 MB each, roughly 100-300 per job), uploaded in the background on any network. Video capture stays in the web app for now. Uploads must be retryable and idempotent. (Correction after code review: the existing `/upload` route already streams to cloud storage; its problems are an unreported size and no auth. The new project-scoped route caps photos at 25 MB.)
- **Release: internal APK first**, Play Store later. A debug/internal build comes first, so JDK 17 and the Android SDK get installed locally. The owner supplies `google-services.json`; a release keystore is needed only for the later Play release.
- **OCR meters: common digital displays first** (clear digital readouts such as Delmhorst, Tramex, FLIR moisture meters and standard thermo-hygrometers). Lower accuracy on segmented LCDs is accepted; the tech always confirms.

My calls (not yet seen by the owner):
- **Offline OCR:** the Gemini fallback needs a signal, so offline the tech types the value. On-device ML Kit still works offline.
- **Web transition:** existing nested arrays are copied once into item records. After the web client is migrated, `PATCH /projects/:id` rejects writes to the item-managed fields (rooms, chambers, tracked materials, readings, photos, videos). Until then, the server reads both forms. Stages ship independently without data loss because old nested data stays readable.
- **Structural data:** rooms, chambers and tracked materials are records too. Deletes are soft (a deleted flag, kept for sync). Per-field last-synced-wins plus history applies to edits like rename or status change. An item that references a room not yet synced is held as pending until the room arrives. The sync cursor carries deletions.
- **Permissions:** company and role come from the Firestore `users` document. The server enforces company membership and role permission on every new endpoint. Existing users get a one-time backfill before the Android app ships.
- **Psychrometrics:** the phone stores raw temperature and RH. The server recomputes GPP and the other derived values on ingest so every client sees the same numbers. The Android app may compute them for display, using a shared set of test vectors against `utils/psychrometrics` so Kotlin and web agree.
