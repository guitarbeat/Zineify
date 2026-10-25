# Zine-ify Studio Revamp — DIY Punk Xerox Press & Guided Imposition Suite

Zine-ify is being completely reimagined from a scattered floating widget board into a cohesive **DIY Punk Xerox & Cut-and-Paste Collage** print-press studio. The revamped experience guides creators through a focused 4-stage production pipeline (**1. Import → 2. Arrange & Impose → 3. Fold & Inspect → 4. Export & Print**) while adding one-click sample zine templates, toggleable crop/bleed/cut-line press marks, and a unified 2D/3D Fold & Spread Inspector Dock.

### User Review & Critical Decisions

> [!IMPORTANT]
> Review the confirmed product and aesthetic direction below. Once approved, we will execute the full visual, layout, and workflow transformation across the application.

- **Confirmed Aesthetic Direction**: **DIY Punk Xerox & Cut-and-Paste Collage** — High-contrast photocopy halftone grain, ink-black structural borders, off-white newsprint sheets, stencil/stamp accents in Cinnabar Xerox Red (`#E63946`), and tactile cut-out shadows (`4px 4px 0 #0F0F0F`).
- **Confirmed Workspace Architecture**: **Step-by-Step Guided Flow (Import, Arrange, Fold, Export)** — A dedicated 4-step studio pipeline with instant step switching, live progress state, and persistent sheet access so users never get lost in overlapping panels.
- **Confirmed Workflow Enhancements**:
  1. **Built-in Sample Zine & Quick-Start Demo Templates**: Instant 1-click procedural 8-page zine generators (*"Subterranean Punk Issue #1"*, *"Riso Art Monograph"*, and *"Field Notes Pocket Guide"*) so users can test folding, imposition, and export immediately without uploading files first.
  2. **Print Marks, Bleed Guides & Cut-Line Overlays**: Live imposition overlays for center slit cut-lines, valley/mountain fold creases, outer crop marks, and bleed/margin safe zones—available both on the interactive canvas and baked optionally into exported PDFs/prints.
  3. **Interactive 2D/3D Fold & Spread Inspector Dock**: A unified inspection stage combining the interactive Three.js 3D folding simulation, a collapsible bottom control dock with 6 fold checkpoints, a 2D page-turn booklet spread reader, and an illustrated 8-step physical folding guide.

---

### 1. Overview & Core Concept

- **What It Does**: Converts multi-page PDFs, image batches, or built-in starter templates into print-ready, single-sheet 8-page mini-zines (and custom imposition grids) with real-time 2D sheet editing, 3D physical fold simulation, and 300 DPI PDF/print output.
- **Target Audience / Persona**: Independent zinesters, DIY publishers, comic artists, educators, and printmakers who want a tactile, zero-friction pressroom tool that respects physical paper geometry.
- **Key Value**: Eliminates the confusion of upside-down imposition math (pages 2, 3, 4, 5 rotated 180° on the top row vs. pages 6, 7, 8, 1 on the bottom row) by pairing a crystal-clear guided press workflow with instant 3D physical verification.

---

### 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Top Bar & Guided Stepper**: A clean 3-zone top bar houses the single-line **ZINE-IFY** wordmark on the left, the 4-stage interactive workflow links (**01. Import**, **02. Arrange**, **03. Fold & Inspect**, **04. Export**) in the center, and the primary **Export PDF** action on the right.
  2. **Stage 01 — Import & Starter Press**: Users drop PDFs/PNGs/JPGs/WEBPs into a tactile pasteboard dropzone, manage their queued source files, or launch one of three **Built-in Sample Zines** with a single click to populate all 8 slots immediately.
  3. **Stage 02 — Arrange & Impose**: The central pasteboard displays the imposed press sheet with true paper aspect ratio (Letter, A4, A3, Legal, A5, or Custom) alongside a focused Press Config sidebar. Users drag-and-drop pages to swap slots, flip individual pages 180°, toggle Fit/Fill crop, duplicate or clear slots, and toggle live **Press Overlays** (Center Slit Cut Mark, Fold Creases, Trim/Crop Marks, Safe Bleed Zone, and Page Numbers).
  4. **Stage 03 — Fold & Inspect (2D/3D Inspector Dock)**: Users inspect how their flat imposed sheet transforms into a physical 8-page booklet. A dedicated viewport switcher toggles between the **3D Interactive Fold Stage** (with a collapsible bottom control dock for scrubbing stages 1–6: *Flat → Crease → Strip → Center Cut → Diamond → Booklet*), the **2D Spread Reader** (flipping through Cover, Spreads 2–3, 4–5, 6–7, and Back Cover), and the **Physical Fold Manual**.
  5. **Stage 04 — Export & Print Press**: Users review a pre-flight summary of their zine (filled pages, paper size, orientation, margin, and optional printable crop/cut marks), then trigger **Download 300 DPI PDF** or **Direct Print Sheet**.

- **Visual Identity & Theme**:
  - *Aesthetic Direction*: **DIY Punk Xerox & Cut-and-Paste Collage** — Authentic underground print-shop atmosphere combining tactile newsprint surfaces, stark ink-black framing, halftone dot patterns, and razor-sharp editorial typography.
  - *Color Palette & Mood* (60-30-10 discipline):
    - **60% Dominant Neutral Canvas (`--background`)**: Warm Newsprint Paper (`#F4F1EA` light) / Deep Toner Black (`#0B0B0C` dark) with subtle photocopy grain.
    - **30% Structural Surfaces (`--surface-bg`, `--border-color`)**: Crisp Pasteboard White (`#FFFFFF` light) / Charcoal Press Plate (`#161618` dark) framed by solid `2px solid #0F0F0F` (`#E4E4E7` in dark mode) structural borders and hard offset shadows (`4px 4px 0px`).
    - **10% Accent Budget (`--primary`, `--accent`)**: Cinnabar Xerox Red (`#E63946`) reserved strictly for primary CTAs, active step indicators, and the center slit cut-line, paired with Press Mustard (`#F2B705`) for bleed/crop guide highlights.
  - *Typography & Hierarchy* (2+1 Font Rule):
    - **Display & Editorial Headings**: `Fraunces` (600/700 weights, tight tracking) for expressive zine mastheads, step titles, and editorial callouts.
    - **UI & Body Prose**: `Plus Jakarta Sans` (400/600 weights) for crisp, high-legibility studio controls and instructions.
    - **Technical & Press Metrics**: `IBM Plex Mono` (`tabular-nums`) for page slot indices, paper dimensions (`mm`/`in`), DPI readouts, and fold angle checkpoints.
  - *Component Styling & Layout*:
    - Full `1440px` desktop studio presence with a 12-column layout: a 4-column contextual press inspector on the left and an 8-column interactive pasteboard stage on the right.
    - Zero nested "cards within cards"—sections within the inspector are separated by crisp `1px` rules and generous whitespace.
    - Zero static pill badges—metadata (page counts, paper dimensions, orientation specs) is rendered as clean inline monospace text separated by middle dots (`·`).

- **Interactive Feedback & Motion**:
  - Fast `150ms` compositor-only (`transform`, `opacity`) press-down micro-interactions on buttons (`translate(2px, 2px)` shadow collapse on click).
  - Smooth exponential damping in the 3D fold viewer when jumping between checkpoints `1`–`6` or dragging the fold slider.
  - Keyboard shortcuts (`Ctrl/Cmd+Z` Undo, `Ctrl/Cmd+Y` Redo, `1`–`6` fold checkpoints, `C` crop toggle, `R` rotate 180°) with instant toast feedback.

---

### 3. Key Product Decisions & Trade-Offs

- **Decision 1: Guided 4-Stage Pipeline with Persistent Sheet Canvas vs. Freeform GridStack Windows**
  - *Chosen Approach*: Replace the overlapping draggable GridStack window cards with a structured 4-step studio workspace (**Import → Arrange → Fold → Export**) where stages 1, 2, and 4 keep the live imposition sheet visible on the right pasteboard while stage 3 expands the 2D/3D Fold & Spread Inspector to full stage width.
  - *Why*: Freeform draggable panels caused layout collisions, hidden scrollbars, and disorientation on both desktop and mobile. A guided pipeline matches the actual physical printmaking process while still allowing non-linear jumping between steps at any time.
  - *Alternatives Considered*: Keeping GridStack panels with locked positions was considered, but it adds unnecessary DOM wrapper overhead and prevents a clean step-by-step editorial flow.
- **Decision 2: Procedural Canvas Sample Zine Generator**
  - *Chosen Approach*: Build a client-side procedural zine generator that renders 8 distinct, high-contrast punk/editorial zine pages onto HTML5 canvases (complete with cover typography, collage geometry, page numbers, and back-cover colophon) and converts them into blob URLs.
  - *Why*: Allows first-time visitors to experience the entire Arrange, 3D Fold, Booklet Spread, and PDF Export workflow in one click with zero external network dependencies or 404 risks.
- **Decision 3: Non-Destructive Print Marks & Bleed Overlays**
  - *Chosen Approach*: Render fold lines, center slit cut markers, corner crop marks, and bleed safe-zones as toggleable SVG/CSS overlays on the pasteboard and optional vector/canvas layers in `ExportService` during 300 DPI PDF generation.
  - *Why*: Lets users verify safe margins visually while choosing whether physical cut/fold ticks should appear on their final printed sheet.

---

### 4. Technical Architecture & Data Strategy *(Technical Reference)*

- **Architecture & Component Diagram**:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        TOP BAR (3-Zone Contract)                             │
│  [ZINE-IFY Wordmark]   [01.Import · 02.Arrange · 03.Fold · 04.Export]  [CTA] │
└──────────────────────────────────────┬───────────────────────────────────────┘
                                       │
                                       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                         AppController & StateStore                           │
│  • activeStep ('import' | 'arrange' | 'fold' | 'export')                     │
│  • allPageImages[8], pageFlips, pageZooms, UndoManager (Ctrl+Z / Ctrl+Y)     │
│  • paperSize, orientation, margin, guideToggles (cut, fold, crop, bleed)     │
└───────────────┬──────────────────────────────────────────────┬───────────────┘
                │                                              │
                ▼                                              ▼
┌───────────────────────────────────────────┐  ┌───────────────────────────────┐
│      LEFT CONTEXTUAL STUDIO DOCK          │  │    RIGHT PASTEBOARD STAGE     │
│                                           │  │                               │
│  • Step 1: Dropzone, File Queue,          │  │  • Live Imposition Sheet      │
│    & Sample Zine Template Launcher        │  │    (LayoutRenderer + Sortable)│
│  • Step 2: SmartSheetConfig (Paper,       │  │  • SVG Press Marks Overlay    │
│    Orientation, Margin) + Press Overlays  │  │    (Center Slit, Fold Grid,   │
│    (Cut Line, Crease, Bleed, Page #s)     │  │     Crop Ticks, Safe Bleed)   │
│  • Step 3: Fold Stepper & Spread Controls │  │  • Interactive 3D Fold Stage  │
│  • Step 4: Pre-Flight Summary & Print     │  │    (Zine3DViewer + Bottom HUD │
│    Marks Export Options                   │  │     Dock + BookletPreview)    │
└───────────────────────────────────────────┘  └───────────────────────────────┘
```

- **Data Model & State**:
  - `StateStore`: Holds `activeStep` (`'import' | 'arrange' | 'fold' | 'export'`), `allPageImages` (8-slot blob URL array), `pageFlips` & `pageZooms` maps, `paperSize` (`letter`, `a4`, `a3`, `legal`, `a5`, `custom`), `orientation` (`landscape` | `portrait`), `margin` (`0–25mm`), `guideToggles` (`cut: true, fold: true, cropMarks: true, bleed: false, numbers: true`), and `includeMarksInExport` (`boolean`).
  - `UndoManager`: Snapshots page image arrays, flips, zooms, and layout presets with automatic blob URL lifecycle cleanup on prune.

- **Interactive Component & State Mapping**:
  - **Guided Stepper Navigation**: Clicking steps `01`–`04` in the top bar or contextual "Next Step / Previous Step" footer buttons updates `state.activeStep`, switches the left inspector view, and automatically initializes/resizes the 3D Fold & Booklet Inspector when entering Step `03`.
  - **Sample Zine Loader**: Clicking any starter template card (*Subterranean Punk #1*, *Risograph Geometry*, *Pocket Field Zine*) generates 8 themed high-resolution canvas pages, pushes an undo snapshot, populates `state.allPageImages`, and advances to Step `02 (Arrange)` with a confirmation toast.
  - **Sheet Imposition & Press Marks**: Toggling press guide checkboxes in Step `02` updates `state.guideToggles` and immediately toggles `.show-cut-marks`, `.show-fold-creases`, `.show-crop-ticks`, and `.show-bleed-zone` overlays on the rendered `.print-sheet`.
  - **Unified 2D/3D Fold & Spread Dock (Step 03)**: Provides tabs to view the **3D Fold Simulation** (with a collapsible bottom HUD bar containing the continuous `0.00–3.00` fold slider and 6 checkpoint buttons), **2D Booklet Spreads** (`BookletPreview` with Previous/Next spread navigation), or the **8-Step Illustrated Fold Guide** side-by-side.
  - **Export & Print Pipeline (Step 04)**: `ExportService` renders all slots at 300 DPI onto an offscreen canvas, optionally draws physical trim/crop ticks and center-slit guides when `includeMarksInExport` is enabled, and outputs `zine.pdf` via `jsPDF` or launches a clean print sheet frame.
