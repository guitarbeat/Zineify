# Implementation Plan: Dedicated 8-Page Mini Zine & 2-Panel Redesign

Refactor Zine-ify from a multi-preset grid generator into a streamlined, high-usability creator dedicated solely to single-sheet 8-page mini zines. Eliminate unnecessary grid/preset switcher complexity and unify the fragmented cards into a balanced two-panel workspace.

## Proposed Changes

### 1. Workspace Layout: Unified Two-Panel Architecture
- Replace the 4 fragmented GridStack cards (`upload`, `settings`, `display`, `canvas`) with a responsive two-panel layout:
  - **Left Panel (Controls Sidebar)**:
    - **Page Management**: Drop zone for PDF/images, "Browse" button, and quick-slot actions ("Sample Zine", "+ Blank", "Fill Empty", "Start Over").
    - **Paper & Margins**: Retain the complete paper size dropdown (Letter, A4, Tabloid, Legal, A3, A5, Custom) with the unit toggle (`in` / `mm`) and margin slider.
    - **Display Toggles**: Clean switches for "Page numbers" and "Cut & fold guides".
  - **Right Panel (Zine Canvas)**:
    - Dedicated, full-height stage for the 8-page imposition sheet (2×4 grid).
    - Top bar streamlined to just the two essential actions: **Preview Fold** (opens the 3D/booklet modal) and **Export PDF** (plus subtle Theme toggle).
    - Remove the Print/Upright view toggle (locks to standard print imposition view for folding) and remove redundant direct print button.

### 2. Feature Removal & 8-Page Mini Specialization
- **Remove Multi-Format Presets**:
  - Remove `16-Page (4×4)`, `Quarter (2×2)`, and `Custom` buttons from `SmartSheetConfig.js`.
  - Remove manual row/column steppers and custom grid size pickers.
  - Fix grid size permanently to 2 rows × 4 columns (8 pages) in `StateStore.js` and `AppController.js`.
- **Remove Redundant Controls & Headers**:
  - Remove duplicated headers and collapsible accordion clutter that caused extra empty space at the bottom of the screen.
  - Simplify summary badges to accurately reflect the 8-page zine state.

### 3. Canvas & CSS Optimization
- Update `src/styles/layout.css` and `src/styles/components.css` to remove legacy GridStack card styling and adopt a flex/grid two-panel container that stretches to 100% of the viewport with no awkward dead space.
- Ensure the 8-page sheet auto-scales crisply with margins and fold lines clearly visible.

## Verification Plan

### Automated Tests & Checks
1. Run `lint_applet` to ensure zero ESLint errors or unresolved imports.
2. Run `compile_applet` to confirm the Vite build completes without errors.

### Manual Verification
1. Load sample zine: Verify 8 pages populate in correct 2×4 mini-zine imposition (pages 5, 4, 3, 2 inverted on top row; pages 6, 7, 8, 1 upright on bottom row).
2. Paper options: Switch paper between Letter and A4; adjust margin slider; verify live updates to sheet.
3. Canvas actions: Click "Preview Fold" to verify 3D/booklet modal opens; click "Export PDF" to test single-sheet export.
4. Responsiveness: Verify two-panel split fits the screen cleanly with no bottom whitespace gap.
