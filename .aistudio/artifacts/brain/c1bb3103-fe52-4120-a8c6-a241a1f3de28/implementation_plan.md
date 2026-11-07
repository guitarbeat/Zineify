# Single-Page Artboard Editor Layout & Overlap Fix

This update resolves the layout collision where the 8-up imposition sheet remained visible and overlapped on top of the Single-Page Artboard Editor, ensuring the editor cleanly occupies the full canvas pane with a large centered page artboard and a high-contrast right-side inspector drawer.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following layout decisions were confirmed and govern this fix:

- **Confirmed Decision 1 (Workspace Scope)**: The Single-Page Editor occupies the **full canvas pane only**, completely replacing the 8-up imposition sheet while keeping the bottom/side studio controls deck in place.
- **Confirmed Decision 2 (Internal Editor Layout)**: The editor uses a **large centered page artboard paired with a right-side inspector drawer** for typography, snap-alignment, page operations, and layers.

---

## 1. Overview & Core Concept

- **What It Fixes**:
  1. **Eliminates the 8-Up Sheet Overlap**: Previously, `#preview-area` used an ID selector (`display: flex`) whose CSS specificity `(1,0,0)` overrode the `.hidden` utility class `(0,1,0)`. As a result, opening the Single-Page Editor left the 8-up sheet rendered on top of the editor and compressed the editor into the bottom half of the canvas pane.
  2. **Maximizes the Centered Page Artboard**: With `#preview-area` truly hidden and canvas container padding removed while editing a single page, the artboard dynamically scales to fill the available canvas height and width while preserving the exact single-page aspect ratio.
  3. **Sharpens Dark & Light Theme Legibility**: Fixes low-contrast text readouts (such as the font size readout, tool hints, and field labels) inside the dark-mode inspector drawer and artboard viewport.

---

## 2. User Experience & Visual Design

- **Seamless View Swap Inside the Canvas Pane**:
  - Clicking **Edit Page / Text** on any page cell or clicking any text layer on the 8-up sheet immediately hides `#preview-area` (`display: none !important`) and expands `#single-page-editor` edge-to-edge across `#stage-sheet-view`.
  - Clicking **8-Up Sheet** (or pressing `Esc`) closes the Single-Page Editor and restores `#preview-area` seamlessly.
- **Visual Identity & Theme Refinements**:
  - **Artboard Stage**: Centered inside a dot-grid studio viewport with generous breathing room, crisp paper-color rendering, rule-of-sixths grid overlay, and floating bottom tool hint pill.
  - **Right-Side Inspector Drawer (`300px` desktop width)**: Clean vertical sections with high-contrast labels (`#e5e7eb` in dark mode, `#374151` in light mode), tabular-numeral coordinate and pixel readouts (`tabular-nums`), and single-line segmented controls.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Explicit `#preview-area.hidden` & Stage Mode Attribute**
  - *Chosen Approach*: Add `#preview-area.hidden { display: none !important; }` and toggle a `.is-single-page-editing` state class on `#stage-sheet-view` and `.snap-card-body--canvas` when `SinglePageEditor` opens or closes.
  - *Why*: Guarantees that ID-level CSS rules on `#preview-area` can never override visibility when the Single-Page Editor is active, and strips the `0.75rem` outer canvas padding so the editor toolbar and inspector dock flush against the canvas card frame.
- **Decision 2: Post-Layout Artboard Measurement (`requestAnimationFrame`)**
  - *Chosen Approach*: Trigger `_fitArtboardToViewport()` both immediately and on the next animation frame after hiding `#preview-area`.
  - *Why*: Ensures `viewportEl.getBoundingClientRect()` measures the full unobstructed canvas pane height rather than the cramped height prior to `#preview-area` collapsing.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

```
┌─────────────────────────────────────────────────────────────────────────┐
│                   Canvas Pane (.snap-card-body--canvas)                 │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │ #stage-sheet-view (.is-single-page-editing when editor is open)   │  │
│  │                                                                   │  │
│  │  ├─ #preview-area.hidden ──► display: none !important             │  │
│  │  │                                                                │  │
│  │  └─ #single-page-editor (100% width × 100% height)                │  │
│  │      ├─ .spe-topbar (Back to 8-Up, Select/Type, Grid/Snap, 1–8)   │  │
│  │      └─ .spe-workspace (CSS Grid: minmax(0, 1fr) 300px)           │  │
│  │          ├─ .spe-artboard-viewport (Centered scaled page canvas)  │  │
│  │          └─ .spe-drawer (Right-side Typography, Align & Layers)   │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

- **State & Lifecycle Mapping**:
  - `SinglePageEditor.open()` adds `.hidden` to `#preview-area`, adds `.is-single-page-editing` to `#stage-sheet-view` and `.snap-card-body--canvas`, and schedules a `requestAnimationFrame` pass to recompute `_fitArtboardToViewport()` and `_renderTextBoxes()`.
  - `SinglePageEditor.close()` removes `.is-single-page-editing`, removes `.hidden` from `#preview-area`, and triggers `AppController.renderCurrentLayout()` so all edits appear immediately on the 8-up sheet.
  - `AppController.renderCurrentLayout()` checks `this.singlePageEditor?.isOpen` so background layout updates never unhide `#preview-area` while the user is actively editing a page.
