# Fitted No-Scroll Draggable Sidebar Panels

Redesign the four sidebar panels (`Brand`, `Add pages`, `Layout & paper`, and `Display`) into streamlined single-row inline layouts so every panel fits its content natively with zero internal scrollbars and zero text collisions.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following design decisions incorporate your confirmed preferences from the clarification step:

- **Confirmed Decision 1 (Inline Control Consolidation)**: Streamline multi-row controls inside each panel into compact single-row inline layouts so all controls remain immediately visible without scrolling.
- **Confirmed Decision 2 (Fitted Panel Redesign)**: Remove `overflow-y: auto` scrollbars from inner draggable panels and redesign vertical density so all four sidebar cards fit comfortably within the 12-row desktop viewport budget.

---

## 1. Overview & Core Concept

- **What It Does**: Transforms the left-hand draggable control cards from tall, vertically stacked forms (which previously clipped or triggered internal scrollbars) into crisp, fitted instrument panels where every control fits natively inside its card boundaries.
- **Target Audience / Persona**: Zine creators and desktop publishers working across laptop and desktop screens who want immediate, one-click access to upload, paper setup, margin, and display controls without scrolling inside miniature cards.
- **Key Value**: Eliminates visual clipping, fixes the horizontal text collision in the Orientation buttons, removes inner scrollbars, and ensures all controls are visible at a glance.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Brand & Export Panel (2 Grid Rows)**: Displays the Zine-ify logo sticker and dark-mode toggle on the top row, with single-line `Preview Fold` and `Export PDF` action buttons below.
  2. **Add Pages Panel (2 Grid Rows)**: Places the `Add pages` heading and a compact `Choose files` button inline on the header row, paired with a fitted dashed drop target (`Drop PDF or images`) directly beneath.
  3. **Layout & Paper Panel (5 Grid Rows)**:
     - *Header Row*: `Layout & paper` title on the left, `in / mm` unit switcher inline on the right.
     - *Paper Row*: Inline `Paper` label paired with the paper size `<select>` dropdown (`US Letter (8.5×11 in)`).
     - *Orientation Row*: Full-width 2-button segmented control (`Portrait` | `Landscape`) with clean icons and no duplicate dimension text (preventing the horizontal text overlap seen previously).
     - *Margin Row*: Single inline row combining the `Margin` label, range slider, and `− / +` numeric stepper.
  4. **Display Panel (3 Grid Rows)**: Places `Display` title and a compact inline `Reset layout` button on the top row, followed by three compact single-line toggle switches (`Page numbers`, `Page controls`, `Cut & fold guides`).
- **Visual Identity & Theme**:
  - *Aesthetic Direction*: Tactile editorial print-shop workspace with crisp 1px structural borders (`var(--border-color)`), warm paper surfaces (`var(--surface-bg)`), and high-contrast ink typography (`var(--accent-dark)`).
  - *Typography & Hierarchy*: `Fraunces` display serif (`0.8rem`, `600` weight) for panel titles paired with `Plus Jakarta Sans` (`0.72rem`–`0.75rem`) and `tabular-nums` for numeric steppers and dimensions.
  - *Component Styling & Layout*: Single-elevation cards (`overflow: hidden`) with proportional internal flex distribution (`justify-content: space-between`) so controls distribute evenly across each panel's height.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Removing Redundant Dimension Text from Orientation Buttons**
  - *Chosen Approach*: Display clean `Portrait` and `Landscape` labels with icons inside the 2-column orientation switcher, while keeping exact sheet dimensions in the Paper Size dropdown directly above.
  - *Why*: Placing both the `Orientation` label and two buttons containing `(8.5×11)` strings on a single narrow sidebar row caused the buttons to overflow and overlap text. Full-width 2-column buttons with concise labels guarantee single-line legibility at any sidebar width.
  - *Alternatives Considered*: Stacking Portrait and Landscape vertically (rejected because it wastes vertical space needed to avoid scrollbars).
- **Decision 2: Inline Header Actions for Upload, Units, and Reset Layout**
  - *Chosen Approach*: Move secondary actions (`Choose files` in Add Pages, `in / mm` unit toggle in Layout & Paper, and `Reset layout` in Display) inline with their respective panel titles.
  - *Why*: Saves 3 full horizontal rows (~105px of vertical height) across the sidebar without hiding any functionality inside menus.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

### Architecture & Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        App Shell (100dvh, No Scroll)                    │
│  ┌───────────────────────────────┬───────────────────────────────────┐  │
│  │   Left Column (4 Cols, 12H)   │     Hero Canvas (8 Cols, 12H)     │  │
│  │                               │                                   │  │
│  │  ┌─────────────────────────┐  │  ┌─────────────────────────────┐  │  │
│  │  │ Brand Panel (2H)        │  │  │ Zine Layout Header          │  │  │
│  │  │ Logo + Theme | Actions  │  │  │ 0/8 · Undo · Redo · Clear   │  │  │
│  │  └─────────────────────────┘  │  ├─────────────────────────────┤  │  │
│  │  ┌─────────────────────────┐  │  │                             │  │  │
│  │  │ Add Pages (2H)          │  │  │   Auto-Fitted Print Sheet   │  │  │
│  │  │ Title + Browse | Drop   │  │  │   (4 × 2 Imposition Grid)   │  │  │
│  │  └─────────────────────────┘  │  │                             │  │  │
│  │  ┌─────────────────────────┐  │  │                             │  │  │
│  │  │ Layout & Paper (5H)     │  │  │                             │  │  │
│  │  │ Title + Units (in|mm)   │  │  │                             │  │  │
│  │  │ Paper Select Dropdown   │  │  │                             │  │  │
│  │  │ [Portrait] [Landscape]  │  │  │                             │  │  │
│  │  │ Margin Slider + Stepper │  │  │                             │  │  │
│  │  └─────────────────────────┘  │  │                             │  │  │
│  │  ┌─────────────────────────┐  │  │                             │  │  │
│  │  │ Display (3H)            │  │  │                             │  │  │
│  │  │ Title + Reset Layout    │  │  │                             │  │  │
│  │  │ 3 × Compact Toggles     │  │  │                             │  │  │
│  │  └─────────────────────────┘  │  └─────────────────────────────┘  │  │
│  └───────────────────────────────┴───────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

### Interactive Component & State Mapping

- **SmartSheetConfig Component**:
  - Renders the inline header containing the `Layout & paper` title and `[in | mm]` unit buttons (`data-unit`).
  - Renders the single-row paper `<select class="smart-sheet-select" data-field="paperSize">` (plus compact inline `W × H` numeric inputs when `custom` is active).
  - Renders the 2-column `.smart-sheet-orientation-seg` (`data-value="portrait"` and `data-value="landscape"`).
  - Renders the single-row margin bar combining `<input type="range" data-field="margin">` and `.smart-sheet-margin-stepper` (`data-margin-delta="-1"` / `"+1"`).
- **Add Pages & Display Panels**:
  - `Add pages` header houses `#browse-files-btn` inline; `#upload-zone` fills the remaining card space as a flex child.
  - `Display` header houses `#reset-layout-btn` inline; the three `.workspace-config-toggle` rows distribute evenly below.
- **GridStack Row Allocation**:
  - Update default row heights to `brand: 2`, `upload: 2` (at `y: 2`), `settings: 5` (at `y: 4`), `display: 3` (at `y: 9`), totaling 12 rows (`2 + 2 + 5 + 3 = 12`), and bump the layout storage key so cached row heights refresh automatically.
