# GEMINI.md — Restoration-AI Codebase Guide

This file documents the codebase structure, development conventions, and workflows for Google AI Studio coding agents working in this repository.

---

## Project Overview

**Restoration-AI** is a water restoration management and AI intelligence platform. It enables restoration technicians to document, monitor, and analyze water damage projects using:

- AI-powered documentation (Google Gemini multi-modal)
- Augmented Reality room scanning and 3D mapping
- Psychrometric monitoring (temp, humidity, GPP, moisture content)
- Equipment tracking and placement
- Compliance checklists, billing, and report generation
- Multi-tenant RBAC architecture

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 19 with TypeScript 5.8 |
| Build tool | Vite 6 |
| AI | Google Generative AI (`@google/genai` 1.20) |
| 3D / AR | Three.js 0.183, React Three Fiber 9, React Three Drei 10 |
| Charts | Recharts 2.10 |
| PDF | jsPDF 4.2 + html2canvas 1.4 |
| Icons | Lucide React 0.469 |
| Styling | Tailwind CSS (CDN, dark mode) |
| Utilities | Lodash 4.18 |

---

## Repository Structure

```
/
├── components/          # 30 React TSX components (UI + business logic)
├── context/
│   └── AppContext.tsx   # Global state: auth, permissions, selected project, online status
├── services/
│   ├── EventBus.ts      # CloudEvent pub/sub messaging (Eventarc-compliant)
│   ├── IntelligenceRouter.ts  # Routes tasks to optimal Gemini model by complexity
│   ├── audio.ts         # Audio encode/decode for Gemini live mode
│   └── photoutils.ts    # Blob → base64 for image API calls
├── utils/
│   ├── psychrometrics.ts  # Psychrometric calculations (dew point, GPP, vapor pressure)
│   └── uploadUtils.ts     # Resumable GCP uploads (5 MB chunks)
├── hooks/
│   └── useWindowSize.ts   # Responsive window size hook
├── data/
│   └── mockApi.ts         # Mock API with seed data (companies, users, projects, equipment)
├── scripts/
│   └── run-odm.sh         # Docker command for OpenDroneMap 3D mesh generation
├── tests/                 # Test file stubs (no test runner configured yet)
├── types.ts               # All TypeScript domain types and enums
├── App.tsx                # Root component — routing between mobile/desktop layouts
├── index.tsx              # React entry point
├── index.html             # HTML shell with Tailwind CDN and import maps
├── vite.config.ts         # Vite config — port 3000, GEMINI_API_KEY env injection
├── tsconfig.json          # TypeScript config — ES2022, ESNext modules, bundler resolution
└── package.json           # Scripts: dev, build, preview
```

---

## Key Components

| Component | Purpose |
|-----------|---------|
| `App.tsx` | Root — responsive routing (mobile < 768px, desktop ≥ 768px), auth gate, keyboard shortcut (Ctrl+K CommandCenter) |
| `MobileApp.tsx` | Mobile tab layout and navigation routing |
| `DesktopApp.tsx` | Desktop sidebar layout and navigation routing |
| `LaunchScreen.tsx` | Initial splash/loading screen before auth check |
| `OAuthHandler.tsx` | OAuth authentication flow |
| `AuthScreen.tsx` | Authentication UI screen |
| `Dashboard.tsx` | Mobile project list, search/filter, live EventBus feed |
| `DesktopDashboard.tsx` | Desktop-specific dashboard view |
| `ARScanner.tsx` | AR room scanning, 3D mapping, moisture sensing via device APIs |
| `WalkthroughViewer.tsx` | AR walkthrough and photo placement on floorplan |
| `FloorplanViewer.tsx` | Floorplan display and interaction |
| `GeminiAssistant.tsx` | Multi-modal AI assistant (text, voice, live streaming) |
| `NewProject.tsx` | Project creation with AI scribe and geolocation |
| `ProjectDetails.tsx` | Project view and edit, history |
| `SmartDocumentation.tsx` | AI-generated documentation with templates |
| `DryingLogs.tsx` | Psychrometric monitoring and material moisture tracking |
| `AdminPanel.tsx` | Multi-tenancy: user, company, and permission management |
| `EquipmentManager.tsx` | Equipment placement, hour tracking |
| `PhotoDocumentation.tsx` | Photo capture, annotation, AI damage analysis |
| `PredictiveAnalysis.tsx` | AI-driven drying timeline prediction |
| `Billing.tsx` | Line items, invoicing, Xactimate export |
| `ComplianceChecklist.tsx` | Safety and compliance tracking |
| `TicSheet.tsx` | TIC sheet management |
| `Reporting.tsx` | Report generation |
| `ReferenceGuide.tsx` | Industry reference materials |
| `CommandCenter.tsx` | CLI-style command interface (Ctrl+K / Cmd+K) |
| `Settings.tsx` | App settings UI (units, date format, etc.) |
| `Downloads.tsx` | Downloads management |
| `Forms.tsx` | Shared form components |
| `EventToast.tsx` | Toast notifications driven by EventBus events |
| `SkeletonLoader.tsx` | Skeleton loading placeholders for async states |
| `ComponentTester.tsx` | Developer component testing harness |

---

## Type System (`types.ts`)

All domain types are centralized in `types.ts`. Key types:

```typescript
// Core domain
Project / LossFile     // Main project entity (LossFile is a type alias for Project)
AIProjectData          // Project extended with aiSummary and aiAlert fields
Room                   // Room with dimensions, readings, photos, status ('wet'|'drying'|'dry')
Reading                // Psychrometric snapshot (temp °F, RH %, GPP, MC %)
PlacedEquipment        // Equipment ('Air Mover'|'Dehumidifier'|'HEPA Scrubber'|'Heater') with status/hours
TrackedMaterial        // Material moisture monitoring with dry goals and reading history
MaterialReading        // Single moisture reading with timestamp and display date
DailyNarrative         // Project log entries with entryType and optional attachments
Photo / PlacedPhoto    // Images with spatial metadata (wall position x/y%) and AI insights
RoomScan               // AR scan output (floorplan SVG, dimensions, photo positions)
RoomMaterials          // AI-extracted material analysis per room (flooring, wall, trim)
LineItem               // Scope-of-work items for invoicing (code, description, qty, rate)
Milestone              // Project timeline milestone with status
AITask                 // Checklist task with completion flag
VideoLog               // Video asset with thumbnail and description
SafetyAssessment       // Pre-entry safety checklist (electrical, structural, biohazard, PPE)
ComplianceCheck        // Individual compliance checklist item
User / Company         // Multi-tenancy entities
AppSettings            // User preferences (units, date format, language, defaultView)
DownloadItem           // Downloadable asset with checkbox state

// Enums / Union types
WaterCategory          // CAT_1 (Clean) | CAT_2 (Gray) | CAT_3 (Black)
LossClass              // CLASS_1 (Least) | CLASS_2 | CLASS_3 | CLASS_4 (Specialty)
ProjectStage           // 'Intake'|'Inspection'|'Scope'|'Stabilize'|'Monitor'|'Closeout'
UserRole               // 'SuperAdmin' | 'CompanyAdmin' | 'Technician'
Permission             // 'manage_users'|'view_billing'|'manage_billing'|'view_projects'|
                       // 'edit_projects'|'view_admin'|'use_ai_tools'|'manage_company'
Tab                    // All valid navigation tab strings ('dashboard'|'losses'|...|'smart-docs')
```

When adding new domain concepts, extend `types.ts` first.

---

## AI Integration

### Google Gemini Models (via `@google/genai` v1.20)

The `IntelligenceRouter` service selects the appropriate model based on task complexity:

| TaskComplexity | Model | Use Case |
|----------------|-------|---------|
| `FAST_ANALYSIS` | `gemini-3-flash-preview` | Quick categorization, summaries |
| `DEEP_REASONING` | `gemini-3-pro-preview` | Complex generation, narratives, scope |
| `VISION_ANALYSIS` | `gemini-3-pro-image-preview` | Photo/damage analysis |
| `CREATIVE_EDIT` | `gemini-2.5-flash-image` | Image editing |
| `VIDEO_GENERATION` | `veo-3.1-fast-generate-preview` | Video generation (use `generateVideo()`) |
| `LOCATION_SERVICES` | `gemini-2.5-flash` | Geolocation and mapping tasks |

### Key AI Patterns

- **Structured output**: Use `responseMimeType: 'application/json'` with `responseSchema` (use `Type` from `@google/genai`) for typed responses.
- **Extended thinking**: Pass `thinkingBudget` in the config — only applied for `DEEP_REASONING` and `VISION_ANALYSIS` models.
- **Vision**: Convert images to base64 via `photoutils.ts` before sending to Gemini.
- **Live mode**: Use `audio.ts` utilities (`encode`, `decode`, `decodeAudioData`) for streaming audio.
- **Routing**: Always instantiate `IntelligenceRouter` and call `execute()` — never hardcode a model name.
- **Video generation**: `VIDEO_GENERATION` complexity cannot use `execute()` — call `router.generateVideo(prompt, imageBase64?)` instead.

### Gemini Performance & Protocols

- **Context Optimization**: Gemini models have massive context windows, but optimizing input token size reduces Time To First Token (TTFT). Filter irrelevant project history before submission.
- **Rate Limits & Context Caching**: If long static technical documents (like IICRC S500) are included in the prompt context repeatedly, consider extending the IntelligenceRouter to use the Gemini Context Caching API.
- **Streaming**: Due to the thoroughness of `DEEP_REASONING` models (like `gemini-3-pro-preview`), always consume the streaming API (`generateContentStream`) where the UI supports it (e.g., `GeminiAssistant.tsx`) to improve perceived UI latency.
- **Payload Management**: When using `VISION_ANALYSIS` with multiple room photos, limit the resolution or number of concurrent images to avoid hitting strict payload/token limits quickly.

### IntelligenceRouter Higher-Level Methods

```typescript
const router = new IntelligenceRouter();

// Categorize and extract structured data from field input
await router.parseFieldIntent(userInput, projectContext);

// Generate Xactimate-style scope of work line items
await router.generateScope(projectContextString);

// Generate an IICRC-style daily project narrative
await router.generateNarrative({ currentStage, equipment, readings, newPhotosCount, complianceIssues });

// Generate a video (uses ai.models.generateVideos internally)
await router.generateVideo(prompt, optionalBase64Image);

// Access the operations client for async job polling
router.getOperationsClient();
```

### Environment Variable

```bash
GEMINI_API_KEY=your_key_here   # Required. Set in .env.local
```

Vite exposes this as both `process.env.GEMINI_API_KEY` and `process.env.API_KEY`.

---

## State Management

- **Global state**: `AppContext.tsx` via React Context — `activeTab`, `selectedProjectId`, `currentUser`, `isAuthenticated`, `accessToken`, `isOnline`, `settings`.
- **Permission helper**: `hasPermission(permission)` from `useAppContext()` — SuperAdmin always returns true; others check `currentUser.permissions`.
- **Component state**: `useState` / `useReducer` for local UI state.
- **Events**: `EventBus.ts` for cross-component messaging (CloudEvent format, Eventarc-compliant pub/sub).

Prefer `EventBus` for decoupled cross-component communication rather than prop drilling or lifting state high.

---

## Development Conventions

### TypeScript

- Strict TypeScript throughout. No `any` without explicit justification.
- All new domain types go in `types.ts`.
- Use enums and union types from `types.ts` (e.g., `WaterCategory`, `ProjectStage`) rather than raw strings.
- `tsconfig.json` uses `moduleResolution: "bundler"` and `allowImportingTsExtensions: true` — import `.tsx` files without omitting the extension when needed.

### React Patterns

- Functional components with hooks only — no class components.
- Custom hooks live in `hooks/`. If a stateful pattern is reused 2+ times, extract a hook.
- Services live in `services/`. Business logic should not live directly in components.
- Utilities live in `utils/`. Pure functions with no React dependencies.

### Styling

- Tailwind CSS utility classes (dark mode enabled by default, `dark:` variants).
- Glassmorphism design: `backdrop-blur`, transparency (`bg-opacity-*`), rounded panels, dark slate palette (`slate-900`, `slate-950`).
- No separate CSS files unless absolutely necessary — use inline Tailwind classes.
- Skeleton loaders (`SkeletonLoader.tsx`) for all async data states.

### Component Structure

```tsx
// 1. Imports (React, hooks, services, types, utils)
// 2. Local types/interfaces (if not in types.ts)
// 3. Component function
//    a. Context and props destructuring
//    b. useState / useReducer declarations
//    c. useEffect hooks
//    d. Event handlers and business logic
//    e. Render (JSX)
// 4. Export default
```

### File Naming

- Components: `PascalCase.tsx`
- Hooks: `camelCase.ts` with `use` prefix
- Services and utilities: `camelCase.ts`
- Types: all in `types.ts`

---

## Development Workflow

### Setup

```bash
npm install          # Install dependencies (triggers preinstall.js — see Known Issues)
# Create .env.local and set:
# GEMINI_API_KEY=your_key_here
npm run dev          # Start dev server on http://localhost:3000
```

### Common Commands

```bash
npm run dev          # Development server (hot reload, port 3000, host 0.0.0.0)
npm run build        # Production build → dist/
npm run preview      # Serve the production build locally
```

### OpenDroneMap (3D mesh from photos)

```bash
bash scripts/run-odm.sh   # Requires Docker with GPU support
```

---

## Testing

**Current state**: Test file stubs exist in `tests/` (e.g., `App.test.tsx`, `Dashboard.test.tsx`, `GeminiAssistant.test.tsx`) and a `setup.ts` file, but no test runner (Jest/Vitest) is configured in `package.json`.

When adding tests:
1. Add Vitest (preferred, Vite-native) as a dev dependency.
2. Configure `vitest` in `vite.config.ts` and reference `tests/setup.ts`.
3. Tests live in `tests/` with the naming pattern `ComponentName.test.tsx`.
4. Use `@testing-library/react` for component tests.

---

## Multi-Tenancy & Permissions

- Data is isolated by `companyId`.
- Users have one of three roles: `SuperAdmin`, `CompanyAdmin`, `Technician`.
- `SuperAdmin` (system-level) bypasses all permission checks automatically.
- Fine-grained permissions: `manage_users`, `view_billing`, `manage_billing`, `view_projects`, `edit_projects`, `view_admin`, `use_ai_tools`, `manage_company`.
- Always call `hasPermission(permission)` from `useAppContext()` before rendering sensitive UI or making privileged API calls.
- Mock seed data (2 companies, 4 users, seed projects) is in `data/mockApi.ts` for development.

---

## External Services

| Service | Purpose |
|---------|---------|
| Google Gemini API | All AI capabilities (text, vision, audio, video) |
| GCP Cloud Storage | Image/asset storage (resumable upload via `uploadUtils.ts`) |
| OpenDroneMap | 3D reconstruction from project photos |
| Eventarc | Event publishing infrastructure (bridged via EventBus) |

---

## Path Aliases

Vite and TypeScript are both configured with:

```
@/* → project root
```

Use `@/components/Foo` instead of relative paths like `../../components/Foo`.

---

## Known Issues & Important Notes

1. **No CI/CD**: No GitHub Actions or deployment pipeline configured. Build manually with `npm run build`.
2. **No test runner**: Tests are stubs only. Vitest setup needed before writing real tests.
3. **API key exposure**: `GEMINI_API_KEY` is bundled into the client build via Vite `define`. For production, proxy Gemini calls through a backend service.
4. **preinstall.js**: This file runs automatically during `npm install` and contains obfuscated code. It should be audited or removed before production deployment.
5. **Mock data only**: `data/mockApi.ts` is the entire data layer. There is no real backend — all persistence is in-memory during the session and resets on page reload.
6. **Duplicate files at root**: `App-1.tsx`, `index-1.html`, `index-1.tsx`, `types-1.ts`, `metadata-1.json` are likely experimental alternates and should not be imported.

---

## Gemini API Usage Patterns

### Structured JSON output (via IntelligenceRouter)

```typescript
import { IntelligenceRouter } from '@/services/IntelligenceRouter';
import { Type } from '@google/genai';

const router = new IntelligenceRouter();
const response = await router.execute('FAST_ANALYSIS', promptString, {
  responseMimeType: 'application/json',
  responseSchema: {
    type: Type.OBJECT,
    properties: {
      category: { type: Type.STRING },
      summary: { type: Type.STRING },
    }
  }
});
const parsed = JSON.parse(response.text());
```

### Vision (image analysis)

```typescript
import { blobToBase64 } from '@/services/photoutils';
const base64 = await blobToBase64(imageBlob);
// Pass as inlineData part in the contents array to router.execute()
```

### Audio (live streaming)

```typescript
import { encode, decode, decodeAudioData } from '@/services/audio';
// encode: Uint8Array → base64 string
// decode: base64 string → Uint8Array
// decodeAudioData: Uint8Array → Web Audio API AudioBuffer
```

### EventBus usage

```typescript
import { EventBus } from '@/services/EventBus';

// Subscribe — returns unsubscribe function
const unsub = EventBus.on('com.restorationai.project.updated', handler);
// Subscribe to all events
const unsubAll = EventBus.on('*', handler);

// Publish with optional UI toast
EventBus.publish(
  'com.restorationai.project.updated',
  { projectId },
  subject?,
  'Project updated successfully',  // toast message
  'success'                         // toast level: 'info'|'success'|'warning'|'error'
);

// Cleanup in useEffect return
return () => unsub();
```
