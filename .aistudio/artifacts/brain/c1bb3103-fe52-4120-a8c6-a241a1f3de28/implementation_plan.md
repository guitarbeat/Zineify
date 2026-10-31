# Zine-ify Studio Improvements Plan

## 1. Overview
We will enhance **Zine-ify** across four core areas selected for this update:
1. **Per-Page Fit / Fill & Zoom-Pan Framing Controls**: Let users toggle individual slots between `Fit` (full page visible) and `Fill` (cover slot), adjust zoom (`100%–250%`), and drag-to-pan framing with live WYSIWYG rendering across the 2D sheet, 3D preview, 2D booklet reader, and PDF export.
2. **Interactive Booklet Page-Flipper in 3D (Step 8) & 2D Preview**: Allow users at Step 8 (`Booklet`) of the 3D Fold Preview to flip page-by-page through the finished 8-page booklet (`Front Cover 1 → Spread 2–3 → Spread 4–5 → Spread 6–7 → Back Cover 8`), synchronized with quick-jump spread pills in the 2D Booklet tab.
3. **Printable Cut-Slit & Fold Registration Marks on Exported PDFs**: Upgrade PDF and print output with crisp center-slit scissor marks, inner-crease stop ticks, dashed fold lines, and outer corner trim marks, paired with a dedicated export-guides toggle in the Display Guides deck.
4. **Full Undo / Redo Stack & Automatic Local Session Recovery**: Fix `handleUndo()` so undone states move onto the redo stack (`undo(currentSnapshot)`), display action descriptions on Undo/Redo button tooltips, and persist all page framing/transform states and guide preferences in `IndexedDB` + `localStorage`.

---

## 2. Architecture & Component Changes

### A. Per-Page Fit / Fill Crop Mode & Zoom-Pan Adjustments
- **State & Transforms (`src/core/StateStore.js`, `src/core/AppController.js`)**:
  - Normalize per-slot transform state in `state.pageTransforms[index]` (`{ fit: 'contain' | 'cover', zoom: 1..2.5, panX: -100..100, panY: -100..100 }`) while keeping `state.pageZooms[index]` synchronized for backward compatibility.
  - Add `pageTransformChanged` event handling in `AppController` with debounced undo snapshot recording so dragging or zooming a page records clean undo/redo history.
- **Slot Toolbar & Interactive Pan/Zoom UI (`src/components/UI/Templates.js`, `src/components/UI/LayoutRenderer.js`, `src/components/UI/UIManager.js`)**:
  - Update the per-slot `.crop-btn` badge to reflect `Fit` vs. `Fill` state clearly.
  - Add a compact floating zoom/pan framing bar inside the selected `.page-cell` (`Zoom -`, `Zoom +`, `Reset Framing`, and drag-to-pan hint) when a populated slot is selected.
  - Enable pointer drag-to-pan directly on the selected slot's image when zoomed or in `Fill` mode.
- **WYSIWYG Rendering (`src/services/ExportService.js`, `src/core/AppController.js`)**:
  - Update `ExportService._drawCell()`, `ExportService.buildSheetsHtml()`, and `AppController.buildPreviewAsset()` to apply `fit`, `zoom`, and `panX`/`panY` offsets identically to the 2D canvas cell.

### B. Interactive 8-Page Booklet Page-Flipper in 3D & 2D
- **3D Booklet Reader Kinematics (`src/utils/miniZineFold.js`, `src/components/Zine3DViewer.js`)**:
  - Extend `computeMiniZineFoldState(progress, dimensions)` and `Zine3DViewer` to support an optional `bookletSpread` parameter (`0` to `4` corresponding to `Cover 1`, `Spread 2–3`, `Spread 4–5`, `Spread 6–7`, `Back Cover 8`) when at Step 8 (`progress = 3`).
  - Smoothly animate the 4 folded booklet leaves opening around the central spine `(x = 0, z = 0)` and position the camera straight-on so users can inspect every spread in 3D.
- **3D & 2D Reader Controls (`index.html`, `src/components/UI/UIManager.js`, `src/components/BookletPreview.js`)**:
  - Add an interactive **Booklet Page Bar** (`Cover 1`, `2–3`, `4–5`, `6–7`, `Back 8` + `Flip Prev` / `Flip Next`) that appears in the 3D Fold modal when Step 8 (`Booklet`) is active, and add matching spread jump pills to the 2D `Booklet` tab.
  - Support Left/Right keyboard arrow keys to turn pages when viewing the finished booklet.

### C. Printable Cut-Slit & Fold Registration Marks on Exported PDFs
- **Display & Export Guide Controls (`index.html`, `src/components/UI/UIManager.js`, `src/core/StateStore.js`)**:
  - Add an **"Include guides in PDF"** toggle switch inside the `Display Guides` panel (`#bake-export-guides`) so users can explicitly include or exclude cut/fold registration marks on exported PDFs and printouts.
- **High-Precision Press Marks (`src/services/ExportService.js`)**:
  - Enhance `_drawPressMarksToCanvas()` and `buildSheetsHtml()` to draw:
    - Dashed valley/mountain fold lines across panel boundaries,
    - Center horizontal cut slit (`#e02424`) strictly between the two inner columns (`25%` to `75%`) with bold stop-point ticks at both inner vertical creases and a crisp scissor icon (`✂`) badge,
    - Corner crop/trim registration ticks around the sheet perimeter.

### D. Undo / Redo History & Local Session Recovery
- **Redo Stack Fix & Action Tooltips (`src/core/AppController.js`, `src/core/UndoManager.js`, `src/components/UI/UIManager.js`)**:
  - Update `AppController.handleUndo()` to pass the current state snapshot into `this.undoManager.undo(currentSnapshot)` so undone actions can always be redone via `Ctrl+Y` / `Ctrl+Shift+Z` or the Redo button.
  - Expose `nextUndoDescription` and `nextRedoDescription` from `UndoManager` to dynamically update `#undo-btn` and `#redo-btn` tooltips (`Undo: Rotate Page 2 (Ctrl+Z)`).
- **Session Recovery (`src/services/PersistenceService.js`, `src/core/AppController.js`)**:
  - Persist `pageTransforms` and `guideToggles` in `PersistenceService` and show a subtle non-intrusive toast when a previous zine session is automatically restored on launch.

---

## 3. Verification Plan
- **Unit & Kinematics Tests**:
  - Verify `miniZineFold.spec.js` passes for all 8 fold steps (`progress = 0..3`) and booklet spread states (`spread = 0..4`).
  - Verify `UndoManager` undo/redo round-trip preserves `allPageImages`, `pageRotations`, `pageZooms`, and `pageTransforms`.
- **Lint & Build Verification**:
  - Run `lint_applet` (`eslint src`) and `compile_applet` (`vite build`) to confirm zero lint or build issues.
