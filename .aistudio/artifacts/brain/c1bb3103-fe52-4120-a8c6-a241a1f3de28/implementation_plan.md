# Workspace Layout Redesign & Pasteboard Integration Plan

## 1. Visual & Spatial Architecture
- **Redesigned Default Workspace Grid (`12×12` Desktop Matrix)**:
  - **Top-Left (`Add pages` / `upload`)**: Positioned at `x: 0, y: 0, w: 6, h: 6` so the dropzone (`Drop PDF or images`) occupies a generous upper-left quadrant while leaving the upper-right quadrant (`x: 6..12, y: 0..6`) open to showcase the **Zine-ify** sticker artwork and pasteboard texture.
  - **Bottom-Left (`Layout & paper` / `settings` + `Display` / `display`)**:
    - `Layout & paper` positioned at `x: 0, y: 6, w: 4, h: 4`.
    - `Display` positioned directly beneath at `x: 0, y: 10, w: 4, h: 1` (collapsed into its compact mini-overlay bar showing `Display · 3/3 guides`, `Reset`, and the detent toggle button, leaving breathing room below).
  - **Bottom-Right (`Zine layout` / `canvas`)**: Positioned at `x: 4, y: 6, w: 8, h: 6` with `gs-min-h="4"`, framing the lower-right workspace while letting the Zine-ify artwork peek through from behind.
- **Pasteboard & Empty Canvas Behavior (`0/8` State)**:
  - When `0/8` pages are loaded (`#preview-area.is-empty`), hide the `.print-sheet` 8-slot grid (`opacity: 0; pointer-events: none; visibility: hidden`) so the `Zine layout` card displays a clean, translucent geometric diamond-and-dot pasteboard surface over the background logo.
  - Clicking or dropping files anywhere on the empty `Zine layout` pasteboard area (`#unified-drop-zone`) triggers file browse or imports dropped PDFs/images, and immediately reveals the 8-slot sheet once pages are added.

## 2. Interactive Mechanics & Independent Card Resizing
- **Independent Card Resizing & Detent Snapping**:
  - Remove the forced `restackSidebarColumn()` behavior so resizing or collapsing any card (`Add pages`, `Layout & paper`, `Display`, or `Zine layout`) adjusts only that card (or the directly coupled pair when dragging a shared split divider where both cards share the same `x` and `w`), without snapping or moving unrelated cards across the column.
  - Update `syncMiniOverlayStates()` and `DEFAULT_CARD_HEIGHTS` (`upload: 6`, `settings: 4`, `display: 4` when expanded; `1` when collapsed to mini-overlay) so `Display` starts in its sleek mini-overlay state (`h: 1`) by default and expands to `h: 4` when toggled.
  - Bump the GridStack storage version key (`STORAGE_KEY_DESKTOP = 'zine-grid-fit-v6'`) so the redesigned layout applies cleanly on load and when clicking `Reset`.

## 3. Files to Modify
- **`/index.html`**:
  - Update default GridStack attributes (`gs-x`, `gs-y`, `gs-w`, `gs-h`, `gs-min-h`) on `canvas`, `upload`, `settings`, and `display` to match the redesigned layout.
- **`/src/utils/gridStack.js`**:
  - Update `DEFAULT_LAYOUT`, `DEFAULT_CARD_HEIGHTS`, and `STORAGE_KEY_DESKTOP` (`zine-grid-fit-v6`).
  - Remove forced full-column `restackSidebarColumn()` calls on resize/detent toggles so cards resize independently while preserving direct split-handle resizing.
- **`/src/components/UI/UIManager.js`**:
  - Allow clicking the empty `#unified-drop-zone` pasteboard surface when `#preview-area.is-empty` is active to open the file picker.
- **`/src/styles/layout.css` & `/src/styles/zine-editor.css`**:
  - Add the subtle diagonal crosshatch + dot pasteboard pattern to `.workspace-back-logo` and `.snap-card-body--canvas`.
  - Hide `.print-sheet` inside `#preview-area.is-empty` so the `0/8` state matches the clean translucent pasteboard design in the screenshot.
