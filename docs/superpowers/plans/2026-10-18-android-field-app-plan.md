# Android Field Companion App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A native Android app for field technicians to capture photos and drying readings offline-first, with meter OCR, syncing through the backend's item sync API.

**Architecture:** Kotlin + Jetpack Compose. Room is the on-device source of truth; every user action writes to Room and appends an op to an outbox in the same transaction. WorkManager workers push ops / pull changes through `POST /api/projects/:id/sync` and upload compressed photos to `POST /api/projects/:id/media`. Firebase Auth supplies ID tokens. Meter OCR runs on-device with ML Kit, with the server's `/api/ai/meter-ocr` as an online fallback.

**Tech Stack:** Kotlin, Compose (Material 3), Hilt, Room, WorkManager, Retrofit/OkHttp + kotlinx.serialization, CameraX, ML Kit text recognition, Firebase Auth, JUnit + Turbine + MockWebServer.

**Spec:** `docs/superpowers/specs/2026-10-18-field-app-offline-design.md`
**Depends on:** `docs/superpowers/plans/2026-10-18-sync-backend-and-web-plan.md` (Tasks 1-10 deployed: `/sync`, `/media`, `/migrate`, `/ai/meter-ocr`, auth). Wire formats below are copied from that plan's `shared/items.ts`.

## Global Constraints

- minSdk 24, compileSdk 36, targetSdk 36 (as in the existing `android/app/build.gradle.kts`); JDK 17; `applicationId`/namespace `com.restorationai`.
- Field workflow only: login, project list, room list, photo capture, drying readings, material readings, sync status. No billing/admin/dashboards/AR/video.
- Offline-first: no screen waits on the network to save. Saving = one Room transaction.
- Photos compressed on device to <= 2 MB JPEG (long edge <= 2048 px) before upload; allowed upload types image/jpeg; server max 25 MB.
- Ops are idempotent: every op has a client-generated `opId` (UUID) and every item a client-generated `id` (UUID, except deterministic ids `{parentId}:r:{timestamp}` and `{materialId}:mr:{timestamp}` for readings, per the backend plan).
- Sync batches <= 200 ops. Conflicts "keep both": the app never blocks on a conflict; it shows the server's `conflict` flag as a badge.
- Raw `temp` (F) and `rh` are stored; the server recomputes GPP, dewPoint, vaporPressure, enthalpy. The app computes the same values locally for display using `psychrometric-vectors.json` for parity tests.
- OCR: the tech always confirms values before saving; offline, the tech types them. Common digital displays only.
- Release path: internal debug/release APK first (no Play Store work). `google-services.json` is supplied by the owner and is not committed (`.gitignore`); builds fail with a clear message if absent.

## Review Focus

- Process killed mid-save: the item and its outbox op are both present or both absent (single transaction).
- Photo captured offline, app restarted, signal returns: upload resumes, photo's URL replaced, no duplicate item.
- Server returns `rejected` for an op: op is removed from the outbox, the item is marked `syncError` and visible to the tech (not silently retried forever).
- ID token expired during a long offline period: the first sync after reconnect refreshes the token; a 401 triggers one refresh+retry then surfaces "Sign in again" without losing queued data.
- OCR returns garbage (e.g. "88.8.8" or a value outside 0-100 % RH): the form shows it as editable text, never saves it unseen, and rejects RH > 100 on save.

## File Structure (package `com.restorationai`)

- `data/local/` — `AppDatabase`, entities, DAOs
- `data/remote/` — `SyncApi`, `AuthInterceptor`, wire models
- `data/sync/` — `SyncRepository`, `SyncWorker`, `MediaUploadWorker`, `SyncScheduler`
- `domain/` — `Psychrometrics.kt`, `MeterOcr.kt`, `MeterTextParser.kt`
- `ui/` — `MainActivity`, navigation, screens, view models
- `di/` — existing `FirebaseModule`, new `DataModule`, `NetworkModule`; `VertexAIModule` is unused by this plan: remove it and the `firebase-vertexai` dependency.

---

### Task 1: Toolchain and a building skeleton

**Files:**
- Create: `android/settings.gradle.kts`, `android/build.gradle.kts`, `android/gradle/libs.versions.toml`, `android/gradle.properties`, Gradle wrapper (`android/gradlew`, `android/gradle/wrapper/*`), `android/app/proguard-rules.pro`, `android/app/src/main/res/` (theme, `mipmap` launcher icons, strings), `android/app/src/main/java/com/restorationai/ui/MainActivity.kt`
- Modify: `android/app/build.gradle.kts` (use the version catalog; add `buildConfigField API_BASE_URL` from `-PAPI_BASE_URL` or env `API_BASE_URL`, default `http://10.0.2.2:3000/api`, the emulator's route to the host machine; cleartext HTTP allowed in the debug build only), `.gitignore` (`android/app/google-services.json`, `android/*.keystore`, `android/local.properties`), `android/app/src/main/AndroidManifest.xml`
- Test: `android/app/src/test/java/com/restorationai/SmokeTest.kt`

**Interfaces:**
- Produces: `./gradlew :app:assembleDebug` and `./gradlew :app:testDebugUnitTest` succeed from `android/`.

- [ ] **Step 1 (owner action):** Install JDK 17 (`sudo apt install openjdk-17-jdk`; the owner types it with `!` since it needs sudo) and install `platforms;android-36` and `cmdline-tools` via `sdkmanager`; set `ANDROID_HOME=$HOME/Android/Sdk`. Verify `java -version` shows 17 and `sdkmanager --list_installed` shows `platforms;android-36`.
- [ ] **Step 2 (owner action):** Place Firebase's `google-services.json` at `android/app/google-services.json`.
- [ ] **Step 3: Write the failing test** `SmokeTest`: `assertEquals("com.restorationai", BuildConfig.APPLICATION_ID)`.
- [ ] **Step 4: Run** `cd android && ./gradlew :app:testDebugUnitTest`. Expected: FAIL (project does not configure).
- [ ] **Step 5: Implement** the project files. Use AGP/Kotlin/Compose versions that are mutually compatible (the existing `kotlinCompilerExtensionVersion = "1.5.10"` implies Kotlin 1.9.22; prefer upgrading to current stable Kotlin with the Compose compiler Gradle plugin and KSP instead of kapt, and remove the old `composeOptions`). Reuse `RestorationApplication.kt` and `FirebaseModule.kt` as they are; delete `VertexAIModule.kt` and the `BuildConfig.VERTEX_MODEL_NAME` log line.
- [ ] **Step 6: Run** `./gradlew :app:testDebugUnitTest :app:assembleDebug`. Expected: PASS; an APK exists at `android/app/build/outputs/apk/debug/app-debug.apk`.
- [ ] **Step 7: Commit** `build(android): working Gradle project skeleton`.

### Task 2: Wire models and Psychrometrics

**Files:**
- Create: `data/remote/WireModels.kt`, `domain/Psychrometrics.kt`, copy `tests/fixtures/psychrometric-vectors.json` to `android/app/src/test/resources/psychrometric-vectors.json`
- Test: `domain/PsychrometricsTest.kt`, `data/remote/WireModelsTest.kt`

**Interfaces:**
- Produces (`WireModels.kt`, `@Serializable`): `WireOp(opId:String, id:String, kind:String, parentId:String?, patch:JsonObject, baseRev:Int?, delete:Boolean=false, clientEditedAt:Long)`, `WireItem(id, projectId, kind, parentId:String?, data:JsonObject, rev:Int, seq:Long, deleted:Boolean, conflict:Boolean, updatedAt:Long, updatedBy:String)`, `SyncRequest(ops:List<WireOp>, cursor:Long)`, `OpResult(opId, id, status:String, rev:Int?, conflict:Boolean?, reason:String?)`, `SyncResponse(results:List<OpResult>, changes:List<WireItem>, cursor:Long, hasMore:Boolean)`, `MediaResponse(id:String, url:String, bytes:Long, mimetype:String)`, `MeterOcrResponse(moisture:Double?, tempF:Double?, rh:Double?, confidence:Double)`.
- Produces: `object Psychrometrics { fun fromDryBulb(tempF:Double, rh:Double): Result }`, `data class Result(gpp:Double, dewPoint:Double, vaporPressure:Double, enthalpy:Double)`; the JS formulas in `utils/psychrometrics.ts` `calculatePsychrometricsFromDryBulb` are the reference (same Magnus constants, 1013.25 mb).

- [ ] **Step 1: Write failing tests:** `every vector row matches within 0.01` (loads the JSON); `invalid input (rh <= 0 or NaN) returns zeros like the TS version`; `SyncResponse parses the backend sample JSON including unknown fields` (`Json { ignoreUnknownKeys = true }`).
- [ ] **Step 2: Run** `./gradlew :app:testDebugUnitTest`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(android): wire models and psychrometrics with parity vectors`.

### Task 3: Room database and transactional outbox

**Files:**
- Create: `data/local/AppDatabase.kt`, `data/local/ItemEntity.kt`, `OutboxOpEntity.kt`, `MediaUploadEntity.kt`, `SyncStateEntity.kt`, `ItemDao.kt`, `OutboxDao.kt`, `MediaDao.kt`, `SyncStateDao.kt`, `data/local/LocalStore.kt`
- Test: `androidTest/.../LocalStoreTest.kt` (instrumented, in-memory Room, run on the emulator; also runnable with Robolectric if the builder prefers JVM tests)

**Interfaces:**
- Produces entities: `ItemEntity(projectId, id, kind, parentId?, dataJson, rev, seq, deleted, conflict, syncError?)` primary key `(projectId,id)`; `OutboxOpEntity(opId PK, projectId, opJson, createdAt)`; `MediaUploadEntity(mediaId PK, projectId, filePath, itemId, attempts, createdAt)`; `SyncStateEntity(projectId PK, cursor)`.
- Produces (`LocalStore`): `suspend fun saveItem(projectId, id, kind, parentId, patch:JsonObject, now:Long)` — in one `@Transaction`: reads current item (for `baseRev`), merges patch into local item optimistically, writes `ItemEntity`, inserts the `OutboxOpEntity`; `suspend fun deleteItem(projectId, id, now)`; `fun observeItems(projectId, kind:String? ): Flow<List<ItemEntity>>`; `suspend fun pendingOps(projectId, limit:Int=200): List<WireOp>`; `suspend fun applySyncResponse(projectId, resp:SyncResponse)` — in one transaction, upserts `changes` (but never overwrites an item that still has a pending op with a *newer* local edit: keep local `dataJson` fields touched by pending ops), removes ops with status applied/duplicate, marks `syncError` and removes ops with status rejected, sets cursor; `suspend fun pendingCount(projectId): Int`.

- [ ] **Step 1: Write failing tests:** `saveItem writes item and op atomically`, `saveItem twice on one item keeps baseRev of the server rev not the local one` (second op's baseRev equals last known server rev), `applySyncResponse removes applied ops and sets cursor`, `rejected op sets syncError and is removed`, `pull does not clobber a field with a pending local edit`, `transaction rollback leaves neither item nor op` (simulate failure after item insert).
- [ ] **Step 2: Run** `./gradlew :app:connectedDebugAndroidTest` with the emulator up. Expected: FAIL.
- [ ] **Step 3: Implement.** `kotlinx.serialization` JSON in the DB columns; Room with KSP; schema export on.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(android): Room store with transactional outbox`.

### Task 4: Network client and token handling

**Files:**
- Create: `data/remote/SyncApi.kt`, `data/remote/AuthInterceptor.kt`, `di/NetworkModule.kt`
- Test: `data/remote/AuthInterceptorTest.kt` (MockWebServer)

**Interfaces:**
- Produces: `interface SyncApi { @POST("projects/{id}/sync") suspend fun sync(@Path("id") id:String, @Body body:SyncRequest): SyncResponse; @Multipart @POST("projects/{id}/media") suspend fun uploadMedia(@Path("id") id:String, @Part file:MultipartBody.Part, @Part("mediaId") mediaId:RequestBody): MediaResponse; @POST("ai/meter-ocr") suspend fun meterOcr(@Body body:MeterOcrRequest): MeterOcrResponse; @GET("projects") suspend fun projects(): List<ProjectSummary> }` with `ProjectSummary(id:String, client:String, address:String, status:String)` (+ `@GET("projects/{id}") suspend fun project(...)` returning the materialized project JSON as `JsonObject` for room names).
- Produces: `AuthInterceptor(tokenProvider:suspend (forceRefresh:Boolean)->String?)`: adds `Authorization: Bearer`; on 401 retries once with `forceRefresh=true`; if still 401, throws `AuthExpiredException`.

- [ ] **Step 1: Write failing tests:** `adds bearer header`, `401 triggers one refresh and a retry`, `second 401 throws AuthExpiredException`, `no token sends no header`.
- [ ] **Step 2: Run** `./gradlew :app:testDebugUnitTest`. Expected: FAIL.
- [ ] **Step 3: Implement** (blocking token fetch is acceptable inside the interceptor; it runs on OkHttp's thread).
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(android): authenticated API client`.

### Task 5: Sync worker

**Files:**
- Create: `data/sync/SyncRepository.kt`, `SyncWorker.kt`, `SyncScheduler.kt`
- Test: `data/sync/SyncRepositoryTest.kt`

**Interfaces:**
- Produces: `class SyncRepository(api:SyncApi, store:LocalStore) { suspend fun syncProject(projectId:String): SyncOutcome }` where `SyncOutcome` is `Done(pushed:Int, pulled:Int, conflicts:Int) | Retry | AuthExpired`. Loop: `pendingOps` (<=200) + stored cursor -> `api.sync` -> `store.applySyncResponse` -> repeat while `hasMore` or ops remain. IOException -> `Retry`. `AuthExpiredException` -> `AuthExpired`.
- Produces: `SyncWorker` (`CoroutineWorker`, input `projectId`; maps `Retry` to `Result.retry()` with exponential backoff, `AuthExpired` to `Result.failure` plus a flag the UI reads); `SyncScheduler.enqueue(projectId)` — unique work per project, `NetworkType.CONNECTED`, `ExistingWorkPolicy.KEEP`; `SyncScheduler.syncAllOnConnect()` registers a periodic 15-minute worker and an immediate one. `LocalStore.saveItem` callers invoke `enqueue` after the transaction.

- [ ] **Step 1: Write failing tests** (fake `SyncApi`, in-memory store): `pushes pending ops and clears them`, `pages through hasMore`, `IOException returns Retry and keeps ops`, `AuthExpired returns AuthExpired and keeps ops`, `reports conflict count`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(android): background sync with WorkManager`.

### Task 6: Photo compression and media upload worker

**Files:**
- Create: `data/sync/ImageCompressor.kt`, `data/sync/MediaUploadWorker.kt`, `data/sync/MediaRepository.kt`
- Test: `data/sync/MediaRepositoryTest.kt`, `androidTest/.../ImageCompressorTest.kt`

**Interfaces:**
- Produces: `ImageCompressor.compress(src:File, dest:File, maxLongEdge:Int=2048, maxBytes:Long=2_000_000): File` — downscale then lower JPEG quality (start 85, step down to 50) until under `maxBytes`; preserve EXIF orientation by applying it to pixels.
- Produces: `MediaRepository.addPhoto(projectId:String, parentId:String, source:File, now:Long): String` (returns `photoId`) — compress into app-private storage, then in one transaction: save a `photo` item with patch `{ url:"file://<path>", pendingMediaId:<mediaId>, timestamp:now, ... }` and insert a `MediaUploadEntity`. `MediaRepository.uploadPending(projectId): UploadOutcome` — for each pending media: `api.uploadMedia(projectId, part, mediaId)`; on success, `store.saveItem(photoId, patch {url: durable, pendingMediaId: null})`, delete the media row and the local file; failure -> `Retry`, increment attempts. `MediaUploadWorker` runs it (unique per project, `CONNECTED`, backoff); photo files are never deleted before a confirmed upload.

- [ ] **Step 1: Write failing tests:** `addPhoto creates item and media row together`, `uploadPending success replaces url and clears pendingMediaId and deletes file`, `uploadPending failure keeps file and row, attempts incremented`, `server 415/413 marks the item syncError and stops retrying that media` (4xx other than 401/408/429 are permanent), instrumented: `compress keeps output under 2 MB and long edge <= 2048`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** unit tests and the instrumented test. Expected: PASS.
- [ ] **Step 5: Commit** `feat(android): compressed photo capture queue and resumable-by-retry upload`.

### Task 7: Meter OCR

**Files:**
- Create: `domain/MeterTextParser.kt`, `domain/MeterOcr.kt`
- Test: `domain/MeterTextParserTest.kt`, `domain/MeterOcrTest.kt`

**Interfaces:**
- Produces: `object MeterTextParser { fun parse(lines:List<String>): MeterReading }`, `data class MeterReading(moisture:Double?, tempF:Double?, rh:Double?, confidence:Double)`. Rules: numbers with `%` or `%RH`/`RH` nearby -> `rh` (valid 0-100); numbers with `°F`/`F` -> `tempF` (valid -20-200); `°C`/`C` converted to F; a lone number 0-100 near `%MC`/`WME`/`REL`/`%` on a moisture meter -> `moisture`; implausible values dropped (null). `confidence` = fraction of recognized fields.
- Produces: `class MeterOcr(recognizer:TextRecognizerPort, api:SyncApi, isOnline:()->Boolean) { suspend fun read(image:File): MeterReading }` — on-device first; if `confidence < 0.5` and online, call `api.meterOcr` with the base64 image and return the better-confidence result; offline returns the on-device result. `TextRecognizerPort` is a one-method interface wrapping ML Kit so tests can fake it.

- [ ] **Step 1: Write failing tests:** `parses "72.4 °F 45.2 %RH"`, `parses Celsius and converts`, `drops RH 145`, `drops garbage "88.8.8"`, `moisture only meter`, `falls back to server when on-device confidence is below 0.5 and online`, `does not call server offline`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** (ML Kit `com.google.mlkit:text-recognition` bundled model, so it works offline).
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(android): on-device meter OCR with server fallback`.

### Task 8: Repositories and view models

**Files:**
- Create: `ui/projects/ProjectListViewModel.kt`, `ui/rooms/RoomViewModel.kt`, `ui/readings/ReadingViewModel.kt`, `data/ProjectRepository.kt`, `data/ReadingRepository.kt`
- Test: `ui/readings/ReadingViewModelTest.kt`, `data/ProjectRepositoryTest.kt` (Turbine)

**Interfaces:**
- Produces: `ProjectRepository.projects(): Flow<List<ProjectSummary>>` (cached in Room table `ProjectCacheEntity(id, client, address, status)`, refreshed best-effort when online); `ProjectRepository.rooms(projectId): Flow<List<RoomUi(id,name,status,pendingMediaCount,hasConflict)>>` from items of kind `room`.
- Produces: `ReadingRepository.addReading(projectId, roomId, tempF:Double, rh:Double, mc:Double?, now:Long)` — validates (`rh` in 0..100, `tempF` in -20..200) else throws `IllegalArgumentException`; saves a `reading` item with id `"$roomId:r:$now"`; also stores locally computed `gpp` for immediate display (server overwrites). `addMaterialReading(projectId, materialId, value:Double, now:Long)` -> id `"$materialId:mr:$now"`.
- Produces: `ReadingViewModel` exposing `uiState: StateFlow<ReadingUiState>` (`temp`, `rh`, `mc` text fields, `gpp` live preview via `Psychrometrics`, `ocrSource: Boolean`, `error`), `onOcrResult(MeterReading)`, `onSave()`.

- [ ] **Step 1: Write failing tests:** `rejects rh 120`, `save writes reading item id roomId:r:timestamp`, `live gpp preview updates as temp/rh change`, `ocr result prefills fields and sets ocrSource`, `editing an ocr-filled field keeps values but records edited flag` (patch includes `ocrPrefilled:true, ocrEdited:true`), `rooms flow shows pendingMediaCount and hasConflict`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(android): repositories and view models for rooms and readings`.

### Task 9: Screens

**Files:**
- Create: `ui/AppNav.kt`, `ui/login/LoginScreen.kt`, `ui/projects/ProjectListScreen.kt`, `ui/rooms/RoomScreen.kt`, `ui/capture/CameraScreen.kt`, `ui/readings/ReadingScreen.kt`, `ui/components/SyncStatusChip.kt`
- Test: `androidTest/.../FieldFlowTest.kt` (Compose UI test)

**Interfaces:**
- Consumes: Task 8 view models, `SyncScheduler`, `MediaRepository`, `MeterOcr`.
- Produces: screens — Login (Firebase email/password; reuse of the web app's accounts), Project list, Room screen (photo grid with "Uploading…" overlay for `pendingMediaId`, "Edited by two people" badge, "Add photo", "Add reading"), Camera (CameraX capture to cache file -> `MediaRepository.addPhoto`), Reading (fields prefilled from OCR; "Scan meter" button opens camera, runs `MeterOcr.read`, shows result for confirmation), and `SyncStatusChip` ("All synced" / "N waiting to sync" / "Offline — N saved on this device" / "Sign in again").
- Camera permission requested at first use; denial leaves manual entry working.

- [ ] **Step 1: Write the failing UI test** `FieldFlowTest`: with a fake offline connectivity and in-memory DB — open a project's room, add a reading via the form, assert the chip shows "Offline — 1 saved on this device" and the reading appears in the list; then flip connectivity online with a fake API and assert the chip shows "All synced".
- [ ] **Step 2: Run** `./gradlew :app:connectedDebugAndroidTest`. Expected: FAIL.
- [ ] **Step 3: Implement** screens with Hilt `@HiltViewModel`; touch targets >= 48 dp; large text fields (gloved use); no network call in any save handler.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(android): field capture screens`.

### Task 10: End-to-end verification and internal APK

**Files:**
- Create: `android/README.md` (build, install, configure `API_BASE_URL`, emulator testing steps)
- Modify: `.github/workflows/ci.yml` — add an `android` job (`setup-java` 17, `./gradlew :app:testDebugUnitTest :app:assembleDebug`, using a dummy `google-services.json` from a repo secret `GOOGLE_SERVICES_JSON` base64; skipped on forks)

- [ ] **Step 1:** Start the backend locally (`npm run dev`, with `AUTH` pointed at a test Firebase project) and the emulator. Install the debug APK. Follow this script and record results in the PR description: log in -> open project -> airplane mode -> add 3 photos and 2 readings (one via meter OCR) -> force-stop the app -> relaunch (data still present) -> airplane mode off -> chip reaches "All synced" -> confirm in the web app that the readings and photos appear with durable URLs and the server-computed GPP.
- [ ] **Step 2:** Repeat with two devices editing the same room's `status` offline; confirm both converge and the item shows the conflict badge with the older value in history.
- [ ] **Step 3: Run** `./gradlew :app:testDebugUnitTest :app:assembleRelease` (unsigned or debug-signed for internal use). Expected: PASS.
- [ ] **Step 4: Commit** `docs/ci(android): build instructions and CI job`.
