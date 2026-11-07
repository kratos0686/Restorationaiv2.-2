# Mobile Orientation Layout Lock & AR Scanner Session Reset

This plan resolves two critical field usability issues: preventing mobile devices from unexpectedly switching into the Desktop application layout when rotated to landscape, and fixing the unresponsive **Discard & Start Fresh** button in the AR Room Scanner by replacing blocked browser dialogs with an inline confirmation flow.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following architectural choices were confirmed with you and govern this implementation:

- **Confirmed Decision 1 — Lock Layout Mode at Initial App Load**: Instead of dynamically switching between `MobileApp` and `DesktopApp` on every `window.resize` event when `window.innerWidth` crosses `768px`, the application will determine and lock its layout mode (`mobile` vs. `desktop`) once at initial application boot. Rotating a phone into landscape mode will keep `MobileApp` mounted and preserve all active field state (such as active AR scans, camera streams, and form inputs).
- **Confirmed Decision 2 — Inline Confirmation Prompt for AR Scanner Reset**: The **Discard & Start Fresh** button in the AR Scanner currently calls `window.confirm(...)`, which is silently blocked by the sandboxed iframe environment—making the button appear completely unresponsive. We will replace `window.confirm` with an inline two-step confirmation prompt (`Confirm Discard & Start` / `Cancel`) directly inside the session card.

---

## 1. Overview & Core Concept

- **What It Does**:
  1. **Orientation-Safe Mobile Experience**: Locks the application shell (`MobileApp` vs. `DesktopApp`) at initial load based on the initial device viewport/form factor so rotating a smartphone to landscape mode for wide-angle room scanning or photo capture never triggers a layout switch to the desktop sidebar interface.
  2. **Unblocked AR Session Reset**: Replaces the blocked native browser `confirm()` dialog on the **Discard & Start Fresh** action with an accessible, high-contrast inline confirmation state that clears cached scan data (`ar-scanner-*` keys in `localStorage`) and allows immediate re-initialization.
- **Target Audience / Persona**: Water mitigation technicians using mobile phones on job sites who frequently rotate their devices horizontally while capturing room scans or photos.
- **Key Value**: Eliminates mid-scan state loss caused by mobile screen rotation and restores full control over starting new AR room scans.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Mobile Landscape Rotation Flow**:
     - A technician opens the app on a smartphone (`width < 768px` or mobile device form factor at initial load).
     - The app locks into `MobileApp` for the session.
     - When the technician rotates the phone to landscape (`width >= 768px`, e.g., `844x390`), `MobileApp` remains active and adapts cleanly to the wider viewport without unmounting or switching to `DesktopApp`.
  2. **AR Scanner "Discard & Start Fresh" Flow**:
     - When opening the AR Scanner with cached points or photos, the **Unfinished Session Detected** card appears with **Resume Previous Session** and **Discard & Start Fresh**.
     - Tapping **Discard & Start Fresh** transitions the button area into an inline confirmation prompt: *"Discard cached corners and photos?"* with two clear touch-friendly actions ($\ge 44\text{px}$ height): **Yes, Discard & Start Fresh** (destructive red emphasis) and **Cancel**.
     - Tapping **Yes, Discard & Start Fresh** clears all cached `ar-scanner-*` localStorage keys, resets component state (`scanPoints`, `capturedImages`, `originOffset`, `ceilingHeight`, `areas`, `anomalies`), and immediately transitions to the clean **Initialize Scanner** state (or starts a fresh scan session).
- **Visual Identity & Theme**:
  - *Aesthetic Direction*: Utilitarian field-instrument dark UI (`slate-950` canvas, `slate-900/80` structural surfaces) designed for high legibility in dim basements or bright job site conditions.
  - *Color Palette & Mood*: 60% deep slate neutral canvas (`bg-slate-950`), 30% structural cards with hairline borders (`bg-slate-900/80 border-white/10`), and 10% semantic accents (`brand-cyan` `#06b6d4` for primary actions, `red-500` for destructive discard confirmation).
  - *Typography & Hierarchy*: Clean sans-serif UI labels (`Plus Jakarta Sans` / `Inter`) paired with `font-mono tabular-nums` for spatial coordinates (`ft`), sensor headings (`°N`), and corner/photo counts.
  - *Touch Ergonomics*: Minimum `44px` touch target height on all mobile scanner controls and confirmation buttons, with single-line labels (`whitespace-nowrap shrink-0`).
- **Interactive Feedback & Motion**:
  - Smooth $\le 200\text{ms}$ transition when toggling the inline discard confirmation state.
  - Publishes an `EventBus` toast notification (`"Previous scan session discarded"`) when the cache is cleared so the technician receives immediate visual confirmation.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Locking Layout Mode at Initial Boot**
  - *Chosen Approach*: Capture the initial viewport classification (`isMobileLayout`) once in a `useState` initializer when the app mounts, rather than recomputing `width < 768` on every `resize` event.
  - *Why*: On mobile phones, rotating from portrait (`390px` wide) to landscape (`844px` wide) crosses the `768px` threshold. Re-evaluating `width < 768` on resize unmounts `MobileApp` and mounts `DesktopApp`, destroying active camera streams and local component state. Locking at initial load guarantees layout stability throughout the session.
  - *Alternatives Considered*: Dynamically checking `Math.min(width, height) < 768` on resize was considered, but locking at initial load is completely deterministic and honours your explicit preference.
- **Decision 2: Inline Confirmation Instead of `window.confirm` / `window.alert`**
  - *Chosen Approach*: Manage a local `isConfirmingDiscard` boolean state inside `ARScanner` (and replace the remaining `alert("Sensors required for Odometry.")` fallback with an `EventBus` toast notification).
  - *Why*: Browser modal dialogs (`window.confirm`, `window.alert`) are blocked inside cross-origin/sandboxed iframes and halt the UI thread. Inline confirmation is instantaneous, accessible on touchscreens, and never fails silently.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

- **Architecture & Component Diagram**:
```
┌──────────────────────────────────────────────────────────────────────┐
│                              App Shell                               │
│  • Initial Layout Lock (useState initializer at boot)                │
│    evaluates initial window.innerWidth < 768 once                    │
└──────────────────┬───────────────────────────────────┬───────────────┘
                   │ (Locked Mobile)                   │ (Locked Desktop)
                   ▼                                   ▼
        ┌─────────────────────┐             ┌─────────────────────┐
        │      MobileApp      │             │     DesktopApp      │
        │  (Stays mounted on  │             │                     │
        │  landscape rotate)  │             │                     │
        └──────────┬──────────┘             └──────────┬──────────┘
                   │                                   │
                   └─────────────────┬─────────────────┘
                                     ▼
                   ┌───────────────────────────────────┐
                   │             ARScanner             │
                   │  ┌─────────────────────────────┐  │
                   │  │ Mode: 'init'                │  │
                   │  │ • hasSavedSession check     │  │
                   │  │ • isConfirmingDiscard state │  │
                   │  └──────────────┬──────────────┘  │
                   │                 │                 │
                   │   ┌─────────────┴─────────────┐   │
                   │   ▼                           ▼   │
                   │ [Resume Session]    [Inline Confirm Discard]
                   │   │                           │   │
                   │   ▼                           ▼   │
                   │ requestSensors()    clearCachedSession()
                   │                     + reset state + toast
                   └───────────────────────────────────┘
```

- **Data Model & State**:
  - **Root Layout Lock State**: A locked boolean `isMobileLayout` initialized once via `useState(() => typeof window !== 'undefined' ? window.innerWidth < 768 : false)`.
  - **ARScanner Discard Confirmation State**: A boolean `isConfirmingDiscard` (`false` by default) that toggles the confirmation prompt inside the `Unfinished Session Detected` card when `hasSavedSession` is true.
- **Interactive Component & State Mapping**:
  - **Discard Trigger (`Discard & Start Fresh`)**: Clicking sets `isConfirmingDiscard(true)`.
  - **Cancel Trigger (`Cancel`)**: Clicking sets `isConfirmingDiscard(false)` and restores the primary **Resume Previous Session** / **Discard & Start Fresh** buttons.
  - **Confirm Discard Trigger (`Yes, Discard & Start Fresh`)**: Calls `clearCachedSession()`, resets `scanPoints`, `capturedImages`, `originOffset`, `ceilingHeight`, `areas`, and `anomalies` to empty/default values, sets `isConfirmingDiscard(false)`, and publishes an `EventBus` info toast confirming the session was cleared.
  - **Sensor Permission Feedback**: Replaces the legacy `alert("Sensors required for Odometry.")` call with an `EventBus.publish` warning toast so no native browser dialogs remain in `ARScanner`.
