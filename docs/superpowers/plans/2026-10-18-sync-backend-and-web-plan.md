# Item-Level Sync, Offline Queue, Media Upload, Meter OCR Endpoint — Backend and Web Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the backend and web app a conflict-safe, offline-capable, authenticated item sync layer plus a working media upload route, so the Android app (separate plan) can build on it.

**Architecture:** Photos, readings, material readings, rooms, chambers, tracked materials and videos become individually addressed "items" stored in a Firestore subcollection `projects/{id}/items`. Clients push idempotent ops and pull changes by a per-project sequence cursor through one endpoint, `POST /api/projects/:id/sync`. The web app keeps its current components: `updateProject()` in `services/api.ts` (the single funnel for all saves) diffs whole-array updates into item ops and queues them in IndexedDB.

**Tech Stack:** Express 5 + firebase-admin + @google-cloud/storage (existing), vitest + supertest (new, server tests), `idb` + `fake-indexeddb` (new, web), React 19.

**Spec:** `docs/superpowers/specs/2026-10-18-field-app-offline-design.md`

## Global Constraints

- Conflicts: "keep both, flag it". Latest sync becomes current; the overwritten values go to the item's history; the item gets `conflict: true`. Nothing is silently dropped.
- Photos only in native app; media compressed by clients; uploads retryable and idempotent.
- Server verifies Firebase ID tokens, checks company membership, and enforces role permissions (`view_projects` to read, `edit_projects` to write) on every new endpoint. Company and role come from the Firestore `users` document.
- Psychrometrics: clients send raw `temp` (F) and `rh`; the server recomputes `gpp`, `dewPoint`, `vaporPressure`, `enthalpy` via `utils/psychrometrics.ts` `calculatePsychrometricsFromDryBulb`.
- Existing nested project data must stay readable; no data loss during cutover. Legacy `PATCH /projects/:id` keeps working until the web client is migrated, then rejects item-managed fields.
- Material-tracking field in code is `dryingMonitor` (spec says `trackedMaterials`; use `dryingMonitor`). `PlacedEquipment` stays nested and untouched (out of scope).
- Item-managed `Project` fields: `rooms`, `dryingChambers`, `dryingMonitor`, `videos`.
- Gate legacy behavior behind env flags so each stage ships independently: `ITEM_STORE_ENFORCED` (legacy PATCH rejects item-managed fields when `"true"`) and `AUTH_ENFORCED_LEGACY` (legacy project/upload routes require a valid token when `"true"`). Both default off.
- Node 20 compatible (CI deploy uses Node 20); TypeScript `~5.8`.
- Lint (`npm run lint`, `--max-warnings 0`), `npm run typecheck`, and `npm test` must pass after every task.

## Review Focus

- Same op sent twice (retry after a timeout): second is `duplicate`, item unchanged, no extra history entry.
- Two techs edit different fields of one room offline: both edits survive, `conflict` stays false. Same field: later sync wins, earlier value in history, `conflict: true`.
- Item whose `parentId` room has not synced yet: accepted and stored; GET materialization does not crash or drop it.
- A user from company B pushing ops to company A's project: 403, nothing written.
- Photo upload with an unsupported type or over the size limit: 4xx with a clear message; retried upload of the same `mediaId` overwrites rather than duplicating.

## File Structure

- `shared/items.ts` — item/op types and field constants shared by server and web (new).
- `server/items/applyOps.ts` — pure conflict/merge logic on an `ItemStore` (new).
- `server/items/store.ts` — `ItemStore` interface, `MemoryItemStore`, `FirestoreItemStore` (new).
- `server/items/derive.ts` — psychrometric recompute for `reading` items (new).
- `server/items/migrate.ts` — nested arrays <-> items (`projectToItems`, `materializeProject`) (new).
- `server/auth.ts` — token verification and project access middleware (new).
- `server/syncRouter.ts` — `/projects/:id/sync`, `/projects/:id/media`, `/projects/:id/migrate`, `/ai/meter-ocr` (new).
- `server.ts` — mount router, legacy guards, `GET /projects/:id` adapter (modify).
- `services/authToken.ts`, `services/offline/{db,outbox,diffToOps,SyncEngine}.ts` — web (new). `services/SyncService.ts` deleted.
- `tests/server/*.test.ts` (node environment), `tests/offline/*.test.ts`.

---

### Task 1: Server test infrastructure

**Files:**
- Modify: `package.json` (devDependencies `supertest`, `@types/supertest`), `vitest.config.ts`
- Test: `tests/server/smoke.test.ts`

**Interfaces:**
- Produces: tests under `tests/server/**` run in the `node` environment (no jsdom, no `tests/setup.tsx`).

- [ ] **Step 1: Write the failing test** `tests/server/smoke.test.ts`: `it('runs in node env', () => { expect(typeof window).toBe('undefined'); })`.
- [ ] **Step 2: Run** `npx vitest run tests/server/smoke.test.ts`. Expected: FAIL (jsdom defines `window`).
- [ ] **Step 3:** In `vitest.config.ts` use `projects`/`environmentMatchGlobs` (whichever vitest 5 supports; check docs) so `tests/server/**` use `environment: 'node'` and skip `setupFiles`. Install the dev dependencies.
- [ ] **Step 4: Run** the smoke test plus `npm test`. Expected: all pass.
- [ ] **Step 5: Commit** `test: add node-environment server test setup`.

### Task 2: Shared item types and the conflict engine

**Files:**
- Create: `shared/items.ts`, `server/items/store.ts` (interface + `MemoryItemStore` only), `server/items/applyOps.ts`
- Test: `tests/server/applyOps.test.ts`

**Interfaces:**
- Produces (`shared/items.ts`):
  - `type ItemKind = 'room'|'chamber'|'material'|'reading'|'materialReading'|'photo'|'video'`
  - `interface HistoryEntry { rev:number; changedFields:string[]; before:Record<string,unknown>; at:number; by:string }`
  - `interface Item { id:string; projectId:string; kind:ItemKind; parentId:string|null; data:Record<string,unknown>; rev:number; seq:number; deleted:boolean; conflict:boolean; createdAt:number; createdBy:string; updatedAt:number; updatedBy:string; history:HistoryEntry[]; opIds:string[] }`
  - `interface Op { opId:string; id:string; kind:ItemKind; parentId?:string|null; patch:Record<string,unknown>; baseRev:number|null; delete?:boolean; clientEditedAt:number }`
  - `interface OpResult { opId:string; id:string; status:'applied'|'duplicate'|'rejected'; rev?:number; conflict?:boolean; reason?:string }`
  - `const ITEM_MANAGED_FIELDS = ['rooms','dryingChambers','dryingMonitor','videos'] as const`
- Produces (`server/items/store.ts`): `interface ItemStore { get(projectId,id):Promise<Item|null>; nextSeq(projectId):Promise<number>; put(item:Item):Promise<void>; listSince(projectId,cursor:number,limit:number):Promise<Item[]>; listAll(projectId):Promise<Item[]> }` and `class MemoryItemStore implements ItemStore`.
- Produces (`server/items/applyOps.ts`): `applyOps(store:ItemStore, projectId:string, userId:string, ops:Op[], now?:()=>number): Promise<OpResult[]>`.

- [ ] **Step 1: Write failing tests** in `applyOps.test.ts` (each with `MemoryItemStore`):
  - `creates an item at rev 1 with seq assigned`
  - `duplicate opId returns status duplicate and leaves rev unchanged`
  - `non-overlapping field edits from stale base both survive and conflict stays false`
  - `overlapping field edit from stale base wins, old value lands in history.before, conflict true`
  - `matching baseRev applies without conflict`
  - `delete op sets deleted true and bumps rev; later patch to a deleted item is applied but keeps deleted true unless patch.deleted is false` (my call: resurrect only explicitly)
  - `item with parentId pointing to a missing item is stored`
  - `history is capped at 20 entries and opIds at 50`
- [ ] **Step 2: Run** `npx vitest run tests/server/applyOps.test.ts`. Expected: FAIL (modules missing).
- [ ] **Step 3: Implement.** A stale write is one with `baseRev !== item.rev`; compute `changedSince` = union of `changedFields` of history entries with `rev > baseRev`; conflict only if the patch's keys intersect it. Apply patch by shallow merge. Each applied op consumes `nextSeq`.
- [ ] **Step 4: Run** the test file, then `npm run typecheck`. Expected: pass.
- [ ] **Step 5: Commit** `feat(server): item model and conflict-aware op application`.

### Task 3: Psychrometric recompute on ingest

**Files:**
- Create: `server/items/derive.ts`, `tests/fixtures/psychrometric-vectors.json`
- Modify: `server/items/applyOps.ts` (call derive for `kind === 'reading'`)
- Test: `tests/server/derive.test.ts`

**Interfaces:**
- Produces: `deriveReading(data:Record<string,unknown>): Record<string,unknown>` — when `temp` and `rh` are finite numbers, overwrites `gpp`, `dewPoint`, `vaporPressure`, `enthalpy` from `calculatePsychrometricsFromDryBulb(temp, rh)`; otherwise returns data unchanged.
- Produces: `tests/fixtures/psychrometric-vectors.json`: array of `{ tempF, rh, gpp, dewPoint, vaporPressure, enthalpy }`, at least 12 rows spanning 40–110 F and 10–99 % RH, generated by a script `scripts/gen-psychro-vectors.ts` from the TS function (the Android plan consumes this file).

- [ ] **Step 1: Write failing tests:** `derive overwrites a client-supplied wrong gpp`, `derive leaves non-numeric temp untouched`, `applyOps on a reading item stores recomputed gpp`, `vectors file matches current calculatePsychrometricsFromDryBulb output` (loops the fixture, asserts equality).
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement** `deriveReading`, the generator script, commit the generated JSON, wire into `applyOps`.
- [ ] **Step 4: Run** server tests. Expected: pass.
- [ ] **Step 5: Commit** `feat(server): recompute psychrometrics on reading ingest`.

### Task 4: Firestore item store

**Files:**
- Modify: `server/items/store.ts`
- Test: `tests/server/firestoreStore.test.ts`

**Interfaces:**
- Consumes: `ItemStore` from Task 2.
- Produces: `class FirestoreItemStore implements ItemStore` taking `(db: FirebaseFirestore.Firestore)`. Items live at `projects/{projectId}/items/{id}`. `nextSeq` increments `projects/{projectId}.itemSeq` in a transaction. `listSince` is `where('seq','>',cursor).orderBy('seq').limit(n)`.

- [ ] **Step 1: Write failing tests** against a minimal in-test fake of the Firestore methods used (`collection/doc/get/set/where/orderBy/limit/runTransaction`): `put then get round-trips an item`, `nextSeq increases monotonically across concurrent calls (Promise.all of 20, all distinct)`, `listSince returns only seq greater than cursor in order and respects limit`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** with only the Firestore calls the fake supports (keep the fake the contract).
- [ ] **Step 4: Run.** Expected: pass.
- [ ] **Step 5: Commit** `feat(server): Firestore-backed item store`.

### Task 5: Auth and access middleware

**Files:**
- Create: `server/auth.ts`
- Test: `tests/server/auth.test.ts`

**Interfaces:**
- Produces: `interface AuthUser { id:string; companyId:string; role:string; permissions:string[] }`
- Produces: `createAuth(deps:{ verifyIdToken:(token:string)=>Promise<{uid:string;email?:string}>; getUser:(uid:string)=>Promise<AuthUser|null>; getProject:(id:string)=>Promise<{companyId:string}|null> }): { authenticate: RequestHandler; requireProject(need:'view_projects'|'edit_projects'): RequestHandler }`. `authenticate` reads `Authorization: Bearer`, sets `req.authUser`; 401 on missing/invalid token or unknown user. `requireProject` 404 if no project, 403 if `authUser.companyId !== project.companyId` (role `SuperAdmin` bypasses company check), 403 if lacking the permission.
- Declare `req.authUser` via module augmentation of Express `Request`.

- [ ] **Step 1: Write failing supertest tests** on a tiny express app: `401 without token`, `401 when verifyIdToken rejects`, `403 for another company's project`, `403 for technician without edit_projects on write`, `200 for same-company technician`, `SuperAdmin may access any company`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: pass.
- [ ] **Step 5: Commit** `feat(server): token auth and project access middleware`.

### Task 6: Migration and materialization

**Files:**
- Create: `server/items/migrate.ts`
- Test: `tests/server/migrate.test.ts`

**Interfaces:**
- Produces: `projectToItems(project:Project, userId:string, now:number): Item[]` (seq 0; assigned on put). Deterministic ids: rooms/chambers/materials/photos/videos keep their own `id`; room and chamber readings `${parentId}:r:${timestamp}` (`kind:'reading'`, `parentId` = room/chamber id); material readings `${materialId}:mr:${timestamp}`; photos nested in a room or chamber get that `parentId`; chambers' and rooms' own fields (name, status, roomIds, dimensions, etc.) go to `data`; nested arrays are not copied into `data`.
- Produces: `materializeProject(project:Project, items:Item[]): Project` — rebuilds `rooms`, `dryingChambers`, `dryingMonitor`, `videos` from non-deleted items (readings/photos sorted by `timestamp`), nesting children under `parentId`; orphans (missing parent) go into a synthetic room `{id:'__unsorted__', name:'Unsorted'}` (my call) rather than being dropped.
- Produces: `migrateProject(store:ItemStore, project:Project, userId:string): Promise<number>` — idempotent (skips ids that exist), returns number created.

- [ ] **Step 1: Write failing tests:** `projectToItems then materializeProject round-trips a fixture project (rooms, readings, photos, chamber, dryingMonitor with readings, videos)`, `migrateProject twice creates items once`, `orphan reading lands in Unsorted`, `deleted items are omitted`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: pass.
- [ ] **Step 5: Commit** `feat(server): migrate nested project arrays to items and back`.

### Task 7: Sync, migrate and media routes

**Files:**
- Create: `server/syncRouter.ts`
- Test: `tests/server/syncRouter.test.ts`

**Interfaces:**
- Consumes: `createAuth`, `ItemStore`, `applyOps`, `migrateProject`, an `uploadStream(objectName:string, buffer-or-stream, contentType:string): Promise<{url:string; bytes:number}>` dependency.
- Produces: `createSyncRouter(deps:{ auth; store:ItemStore; getProject(id):Promise<Project|null>; saveProjectFlag(id, patch):Promise<void>; saveMedia: (projectId:string, mediaId:string, file:{buffer:Buffer; mimetype:string; originalname:string}) => Promise<{url:string; bytes:number}> }): express.Router`
  - `POST /projects/:id/sync` body `{ ops: Op[]; cursor: number }` (max 200 ops) -> `{ results: OpResult[]; changes: Item[]; cursor: number; hasMore: boolean }`. Requires `edit_projects` if `ops.length > 0`, else `view_projects`. If the project has no `itemsMigrated` flag, migrate first and set `itemsMigrated: true`. `changes` are items with `seq > cursor` (page of 200), including ones just written by this call's ops.
  - `POST /projects/:id/migrate` (permission `edit_projects`, idempotent) -> `{ created:number }`.
  - `POST /projects/:id/media` multipart field `file` plus text field `mediaId` (required). Allowed types `image/jpeg|png|webp|heic`; max 25 MB; object name `${projectId}/${mediaId}.${ext}`; same `mediaId` overwrites. -> `{ id:mediaId, url, bytes, mimetype }`. 415 for bad type, 413 for too large, 400 without `mediaId`. Requires `edit_projects`.

- [ ] **Step 1: Write failing supertest tests** (fake auth deps, `MemoryItemStore`, fake `saveMedia`): `sync applies ops and returns changes`, `sync with no ops requires only view_projects`, `sync rejects >200 ops with 413`, `sync auto-migrates an unmigrated project exactly once`, `cursor pagination: hasMore true then false`, `other company gets 403 and store stays empty`, `media 415 on application/pdf`, `media 413 over 25 MB`, `media 400 without mediaId`, `media same mediaId twice calls saveMedia with the same object name`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** with `multer.memoryStorage()` for this route only (25 MB cap keeps memory bounded) and the injected `saveMedia`.
- [ ] **Step 4: Run.** Expected: pass.
- [ ] **Step 5: Commit** `feat(server): item sync, migrate, and project-scoped media routes`.

### Task 8: Wire into server.ts, legacy guards, GET adapter

**Files:**
- Modify: `server.ts` (inside `startServer`, near the existing `api` router at ~line 503; legacy `PATCH /projects/:id` ~line 562; `GET /projects/:id` ~line 530; `/upload` ~line 864; fix `size` in `gcsStorage` ~line 425)
- Test: `tests/server/legacyGuards.test.ts`, extend `syncRouter.test.ts`

**Interfaces:**
- Consumes: Tasks 2-7.
- Produces: `legacyPatchGuard(env:{ITEM_STORE_ENFORCED?:string}): RequestHandler` exported from `server/syncRouter.ts`: when enforced and `req.body` has any `ITEM_MANAGED_FIELDS` key, responds 409 `{ error:'item-managed fields must be saved through /sync', fields:[...] }`.
- Produces: `GET /projects/:id` returns `materializeProject(project, items)` when `project.itemsMigrated`, else the nested project unchanged.

- [ ] **Step 1: Write failing tests:** `guard passes when flag off`, `guard returns 409 listing rooms when flag on`, `guard passes non-item fields when flag on`, `GET adapter returns materialized rooms for a migrated project`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** Build real deps in `server.ts`: `verifyIdToken` = `admin.auth().verifyIdToken`; `getUser` reads `users/{uid}` (document id is the Firebase uid; if the existing docs use another id, look up `where('email','==',email)` — check mock users first); `store = new FirestoreItemStore(admin.firestore())` if Firestore initialized, else `MemoryItemStore` (matches the existing mock fallback behavior); `saveMedia` writes to the existing `bucket`. When `AUTH_ENFORCED_LEGACY === 'true'`, put `authenticate` + `requireProject` on legacy project routes and `/upload`. Replace `size: Number(gcFile.metadata?.size || 0)` with bytes counted from the incoming stream.
- [ ] **Step 4: Run** `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build`. Expected: pass; build emits `dist/server.cjs`.
- [ ] **Step 5: Commit** `feat(server): mount sync router, legacy guards behind flags, GET adapter`.

### Task 9: Meter OCR fallback endpoint

**Files:**
- Modify: `services/IntelligenceRouter.ts` (new method), `server/syncRouter.ts`
- Test: `tests/server/meterOcr.test.ts`

**Interfaces:**
- Produces: `IntelligenceRouter.extractMeterReading(imageBase64:string, mimeType:string): Promise<{ moisture:number|null; tempF:number|null; rh:number|null; confidence:number }>` — asks Gemini for strict JSON; `null` for unreadable fields; `confidence` 0-1.
- Produces: `POST /api/ai/meter-ocr` body `{ imageBase64, mimeType }` (auth required, any role with `use_ai_tools`) -> that object. 400 for missing/oversize (>6 MB base64) image; 502 if the model returns unparseable JSON.

- [ ] **Step 1: Write failing tests** with a stubbed router: `returns parsed readings`, `nulls pass through`, `400 on missing image`, `502 on non-JSON model output`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** reusing `trackGeminiCall`/usage context patterns used by the other `/ai/*` routes.
- [ ] **Step 4: Run.** Expected: pass.
- [ ] **Step 5: Commit** `feat(server): meter OCR fallback endpoint`.

### Task 10: User permission backfill

**Files:**
- Create: `scripts/backfill-user-permissions.ts`
- Test: `tests/server/backfill.test.ts`

**Interfaces:**
- Produces: `computeBackfill(users:User[]): { id:string; permissions:Permission[] }[]` — for users with missing/empty `permissions`, role defaults mirror `data/mockApi.ts` role permissions (Technician: `view_projects`, `edit_projects`, `use_ai_tools`; others as in that file). The script accepts `--apply` (default is a dry run that prints the diff).

- [ ] **Step 1: Write failing tests:** `fills Technician defaults`, `leaves users with permissions untouched`, `unknown role gets no permissions and is reported`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** the pure function and a thin Firestore runner.
- [ ] **Step 4: Run.** Expected: pass.
- [ ] **Step 5: Commit** `feat: user permission backfill script`.

### Task 11: Web auth token on API calls

**Files:**
- Create: `services/authToken.ts`
- Modify: `services/api.ts` (all `fetch` calls go through `authedFetch`), `firebase.ts` only if the auth instance is not already exported
- Test: `tests/offline/authToken.test.ts`

**Interfaces:**
- Produces: `getIdToken(): Promise<string|null>` (Firebase `currentUser.getIdToken()`, `null` when signed out); `authedFetch(input:string, init?:RequestInit): Promise<Response>` adds `Authorization: Bearer <token>` when available.

- [ ] **Step 1: Write failing tests:** `authedFetch adds bearer when a token exists`, `authedFetch sends no header when signed out`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** and replace `fetch(` with `authedFetch(` in `services/api.ts`.
- [ ] **Step 4: Run** `npm test`. Expected: existing API tests still pass.
- [ ] **Step 5: Commit** `feat(web): send Firebase ID token on API calls`.

### Task 12: IndexedDB outbox and local item store

**Files:**
- Create: `services/offline/db.ts`, `services/offline/outbox.ts`
- Modify: `package.json` (`idb`; dev `fake-indexeddb`), `tests/setup.tsx` (import `fake-indexeddb/auto`)
- Test: `tests/offline/outbox.test.ts`

**Interfaces:**
- Produces (`db.ts`): `openOfflineDb(): Promise<IDBPDatabase>` with stores `items` (key `[projectId,id]`), `ops` (key `opId`, index `projectId`), `media` (key `mediaId`, holds `Blob`), `meta` (key `projectId`: `{cursor:number}`).
- Produces (`outbox.ts`): `enqueueOps(projectId, ops:Op[]): Promise<void>`; `pendingOps(projectId): Promise<Op[]>` (oldest first); `removeOps(opIds:string[]): Promise<void>`; `saveLocalItems(items:Item[]): Promise<void>`; `localItems(projectId): Promise<Item[]>`; `getCursor/setCursor(projectId)`; `enqueueMedia(mediaId, projectId, blob:Blob, filename:string)`; `pendingMedia(projectId)`; `removeMedia(mediaId)`; `pendingCount(projectId): Promise<number>` (ops + media).

- [ ] **Step 1: Write failing tests:** `ops survive reopening the database`, `pendingOps returns insertion order`, `pendingCount counts ops and media`, `cursor defaults to 0`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: pass.
- [ ] **Step 5: Commit** `feat(web): IndexedDB outbox and local item store`.

### Task 13: diffToOps

**Files:**
- Create: `services/offline/diffToOps.ts`
- Test: `tests/offline/diffToOps.test.ts`

**Interfaces:**
- Consumes: `Item`, `Op`, `ITEM_MANAGED_FIELDS`, ids from `projectToItems` conventions (Task 6; share the id helper: export `readingId(parentId,timestamp)` and `materialReadingId(materialId,timestamp)` from `shared/items.ts` and use them in Task 6 too).
- Produces: `diffToOps(projectId:string, current:Item[], updates:Partial<Project>, newOpId:()=>string, now:number): Op[]` — for each item-managed key in `updates`, compares the incoming nested array against `projectToItems`-style flattening of the update and against `current`; emits an upsert op (`patch` = only changed top-level fields, `baseRev` = current item's `rev` or `null` if new) per added/changed item and a `delete:true` op per item present in `current` (non-deleted) but missing from the update. Non-item keys are ignored (returned separately by the caller).

- [ ] **Step 1: Write failing tests:** `adding one reading to a room emits one op, not the whole room`, `unchanged update emits no ops`, `changing a room name emits a patch with only name`, `removing a photo emits delete`, `new room gets baseRev null`, `ops carry current rev as baseRev`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** (flatten with the Task 6 function to avoid a second definition of the mapping).
- [ ] **Step 4: Run.** Expected: pass.
- [ ] **Step 5: Commit** `feat(web): convert whole-array project updates into item ops`.

### Task 14: Sync engine; wire updateProject; retire SyncService

**Files:**
- Create: `services/offline/SyncEngine.ts`
- Modify: `services/api.ts` (`updateProject`, `getProject`/list reads), `context/AppContext.tsx` (online handler ~lines 175-190 calls the engine), `components/AdminPanel.tsx` (manual sync button uses the engine), delete `services/SyncService.ts` and its imports
- Test: `tests/offline/SyncEngine.test.ts`

**Interfaces:**
- Produces: `SyncEngine.syncProject(projectId): Promise<{ pushed:number; pulled:number; conflicts:number }>` — loops: push up to 200 oldest pending ops with the stored cursor, store returned changes in the local item store, advance the cursor, remove ops whose result is `applied|duplicate|rejected` (rejected ops are surfaced via `onRejected` callback and removed), continue while `hasMore`. Stops cleanly on network error leaving ops queued.
- Produces: `SyncEngine.syncAll(): Promise<void>`; `SyncEngine.subscribe(listener:(s:{pending:number; syncing:boolean; conflicts:number})=>void): () => void`.
- Modify `updateProject(id, updates)`: split `updates` into item-managed and other fields; item part -> `diffToOps` against `localItems(id)` (hydrated from the server's items, or from `projectToItems` of the loaded project when the local store is empty), apply ops optimistically to the local store, `enqueueOps`, and trigger `syncProject` without awaiting network; non-item part -> existing PATCH path. Never fall back to `mockApi` for item-managed fields.

- [ ] **Step 1: Write failing tests** with a mocked `authedFetch`: `offline updateProject queues ops and returns the optimistic project`, `syncProject pushes then clears the queue`, `network failure leaves ops queued`, `duplicate result clears op`, `rejected result invokes onRejected and clears op`, `conflict count is reported`, `two sequential edits to different rooms send two item ops, never a rooms array`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`; existing `DryingLogs`/`PhotoDocumentation` tests must still pass.
- [ ] **Step 5: Commit** `feat(web): offline-capable sync engine behind updateProject`.

### Task 15: Media upload queue

**Files:**
- Modify: `services/api.ts` (`uploadMedia`), `types.ts` (`Photo.pendingMediaId?: string`, `VideoLog.pendingMediaId?: string`), `services/offline/SyncEngine.ts` (media pass)
- Test: `tests/offline/uploadMedia.test.ts`

**Interfaces:**
- Produces: `uploadMedia(projectId:string, file:File, opts?:{mediaId?:string}): Promise<{ url:string; pendingMediaId?:string }>` — hmm, existing callers expect `Promise<string|null>`; keep the signature `Promise<string|null>` and add `uploadMediaDetailed(projectId, file): Promise<{url:string; pendingMediaId?:string}>`; `uploadMedia` returns `.url` of it. Online success: POST `/projects/:id/media` with `mediaId` (a fresh uuid), return the durable URL. Failure: `enqueueMedia`, return `URL.createObjectURL(file)` and the `pendingMediaId`.
- Engine media pass: for each pending media, upload; on success enqueue ops that patch every photo/video item whose `data.pendingMediaId === mediaId` to `{url: durableUrl, pendingMediaId: null}`, then `removeMedia`.
- Update `PhotoDocumentation.tsx` (call `uploadMediaDetailed`, store `pendingMediaId` on the new photo) only where it constructs the photo.

- [ ] **Step 1: Write failing tests:** `online upload posts to /projects/:id/media with mediaId and returns the server url`, `offline upload queues the blob and returns an object URL`, `engine uploads queued media then patches the photo url and clears pendingMediaId`, `retrying the same mediaId reuses it`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`. Expected: pass (including `tests/PhotoDocumentation.test.tsx`).
- [ ] **Step 5: Commit** `fix(web): working media upload route with durable offline queue`.

### Task 16: Truthful offline and conflict UI

**Files:**
- Modify: `App.tsx` (offline banner), `context/AppContext.tsx` (expose `syncStatus`), `components/DryingLogs.tsx` and `components/PhotoDocumentation.tsx` (small badges)
- Test: `tests/offline/syncStatusUi.test.tsx`

**Interfaces:**
- Consumes: `SyncEngine.subscribe`.
- Produces: banner text `Offline — {n} change(s) saved on this device, will sync when connected` when offline and `n > 0`; `Syncing {n}…` while syncing; items with `conflict` show a "Edited by two people" badge; photos with `pendingMediaId` show "Uploading…".

- [ ] **Step 1: Write failing tests:** `banner shows pending count offline`, `banner hidden when online and queue empty`, `conflict badge renders for a conflicted item`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** (replace the unconditional "Data Saved Locally" copy).
- [ ] **Step 4: Run** `npm test`. Expected: pass.
- [ ] **Step 5: Commit** `feat(web): truthful offline banner and conflict badges`.

### Task 17: Turn on enforcement and document rollout

**Files:**
- Modify: `.env.example`, `Dockerfile`/deploy env only if flags are set there, `README.md` (rollout section)
- Test: `tests/server/legacyGuards.test.ts` (existing)

- [ ] **Step 1:** Document `ITEM_STORE_ENFORCED` and `AUTH_ENFORCED_LEGACY` in `.env.example` with a rollout order: deploy server; deploy web; run `scripts/backfill-user-permissions.ts --apply`; set `AUTH_ENFORCED_LEGACY=true`; after all web clients have updated, set `ITEM_STORE_ENFORCED=true`.
- [ ] **Step 2: Run** `npm run lint && npm run typecheck && npm test && npm run build`. Expected: all pass.
- [ ] **Step 3: Commit** `docs: rollout order for auth and item-store enforcement`.
