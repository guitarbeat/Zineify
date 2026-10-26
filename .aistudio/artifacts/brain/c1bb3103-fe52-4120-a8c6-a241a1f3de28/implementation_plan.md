# Workspace Backdrop Logo & Consolidated Toolbar Layout

Eliminate the standalone Brand card by placing the **Zine-ify** punk-collage logo directly on the workspace back panel behind the draggable cards, and relocate **Preview Fold**, **Export PDF**, and the **Theme Toggle** into the **Zine layout** header bar to free up vertical sidebar space.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following layout and positioning choices incorporate your confirmed answers:

- **Confirmed Decision 1 (Action & Theme Button Placement)**: Move **Preview Fold**, **Export PDF**, and the **Theme** toggle button (plus the conditional **Install App** trigger) into the **Zine layout** top header bar right beside **Undo** and **Redo**.
- **Confirmed Decision 2 (Logo Back Panel Placement)**: Render the **Zine-ify** logo as a centered watermark in the workspace background behind all draggable panels so cards glide over the logo when rearranged.
- **Confirmed Decision 3 (Sidebar Row Reallocation)**: Removing the standalone Brand card frees up 3 full GridStack rows in the left column, allowing **Add pages** (`3 rows`), **Layout & paper** (`5 rows`), and **Display** (`4 rows`) to breathe comfortably across the 12-row height with zero internal scrollbars.

---

## 1. Overview & Core Concept

- **What It Does**: Converts the workspace container itself into a branded cutting-mat surface with a centered Zine-ify logo backdrop while consolidating primary actions into the main canvas toolbar.
- **Target Audience / Persona**: Zine creators arranging pages and previewing folds who want maximum room for sidebar controls without sacrificing brand identity or quick access to export and preview actions.
- **Key Value**: Removes an entire card from the left sidebar column (25% vertical savings), giving the remaining three control cards generous breathing room while making the Zine-ify logo large and visible on the underlying workspace surface whenever panels are dragged or resized.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Workspace Backdrop Logo**: The Zine-ify logo sits centered on the back panel of the workspace shell (`pointer-events: none`, behind the GridStack layer). As the user drags or resizes any panel, the cards move smoothly over the logo on the back panel.
  2. **Unified Zine Layout Header Bar**: The top bar of the **Zine layout** card displays `Zine layout 0/8` on the left and a single-line action cluster on the right: `Undo`, `Redo`, `Start over` (when pages exist), a subtle vertical divider, `Preview Fold`, `Export PDF` (primary coral-red CTA), and the `Theme` toggle icon button.
  3. **Spacious 3-Card Sidebar**: With the Brand card removed, the left column stacks only three draggable cards across the 12 rows:
     - **Add pages** (`y: 0, h: 3`)
     - **Layout & paper** (`y: 3, h: 5`)
     - **Display** (`y: 8, h: 4`)
- **Visual Identity & Theme**:
  - *Aesthetic Direction*: Tactile print-studio desk where the workspace back panel acts as a branded mat beneath floating modular tool cards.
  - *Color Palette & Mood*: Preserves the 60-30-10 balance with warm paper/ink surfaces, reserving the high-intent coral-red accent (`--primary-vibrant`) for the **Export PDF** button in the canvas header.
  - *Typography & Hierarchy*: `Fraunces` display serif for card titles, `Plus Jakarta Sans` with `tabular-nums` for page counters and single-line toolbar buttons.
  - *Component Styling & Layout*: Single-elevation cards (`overflow: hidden`) with subtle `1px` borders floating above the centered workspace backdrop logo.
- **Interactive Feedback & Motion**: Cards remain directly draggable by their bodies (`cursor: grab`), gliding smoothly over the fixed centered logo on the back panel while toolbar buttons provide crisp hover and disabled states.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Workspace Back-Panel Watermark Layering**
  - *Chosen Approach*: Render a dedicated `.workspace-back-logo` layer inside the workspace shell with `position: absolute; inset: 0; pointer-events: none; z-index: 0;` while `.grid-stack` sits at `z-index: 1`.
  - *Why*: Ensures the logo is centered in the workspace back panel and never intercepts mouse or touch events, allowing panels to be freely dragged over and around it.
  - *Alternatives Considered*: CSS `background-image` on `.app-shell`—passed over because an explicit `<img>` element inside a non-interactive backdrop container allows precise `object-fit: cover` cropping of the logo's black border and smooth opacity adjustments across light and dark themes.
- **Decision 2: Consolidated Canvas Header Toolbar**
  - *Chosen Approach*: Group history actions (`Undo`, `Redo`, `Start over`) and primary workflow actions (`Preview Fold`, `Export PDF`, `Theme`) in the **Zine layout** header bar separated by a subtle hairline divider.
  - *Why*: Keeps every global action in a predictable, always-visible top-right toolbar while reclaiming 25% of the sidebar's vertical height.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

- **Architecture & Component Diagram**:
```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Workspace Shell (.app-shell / .gs-wrapper)                                   │
│                                                                              │
│   ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐    │
│     Back Panel Layer (z-index: 0, pointer-events: none)                      │
│   │                  [ Centered Zine-ify Logo Watermark ]               │    │
│   └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘    │
│                                                                              │
│   ┌──────────────────────┐  ┌────────────────────────────────────────────┐   │
│   │ Add pages (h: 3)     │  │ Zine layout 0/8   [Undo][Redo] | [3D][PDF][☼]│ │
│   │ [Choose files]       │  ├────────────────────────────────────────────┤   │
│   │ [Drop PDF or images] │  │                                            │   │
│   ├──────────────────────┤  │                                            │   │
│   │ Layout & paper (h: 5)│  │                                            │   │
│   │ [in | mm]            │  │            Main Sheet Canvas               │   │
│   │ [Letter (8.5×11in)]  │  │                 (h: 12)                    │   │
│   │ [Portrait|Landscape] │  │                                            │   │
│   │ [Margin ─────── - +] │  │                                            │   │
│   ├──────────────────────┤  │                                            │   │
│   │ Display (h: 4)       │  │                                            │   │
│   │ [Reset] + 3 Toggles  │  │                                            │   │
│   └──────────────────────┘  └────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────────┘
```

- **Data Model & State**:
  - Updates `DEFAULT_LAYOUT` in the GridStack layout manager to remove the `brand` node and allocate the 12 sidebar rows across `upload` (`y: 0, h: 3`), `settings` (`y: 3, h: 5`), and `display` (`y: 8, h: 4`), bumping the layout storage key to `v5` so cached layouts automatically refresh.
- **Interactive Component & State Mapping**:
  - All existing DOM IDs (`#view3dBtn`, `#exportPdfBtn`, `#theme-toggle`, `#theme-icon`, `#pwa-install-trigger`, `#undo-btn`, `#redo-btn`, `#clear-all-btn`) remain unchanged so every event listener, keyboard shortcut, and state update continues working seamlessly.
