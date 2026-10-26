# Implementation Plan: Card-Body Draggable Layout & Top-Bar Removal

The user requested: *"I don't want a draggable top bar.. maybe just have the body be draggable??"* and confirmed in clarifying questions: *"Remove top bars and let card bodies themselves be draggable"*.

## Proposed Changes

### 1. Remove Top Bars & Integrate Clean Section Headings
- Remove the `.snap-card-handle` header bars from the sidebar cards (`#card-upload`, `#card-settings`, `#card-display`).
- Place clean, subtle inline section titles (e.g. `<h3 class="card-section-title">Add pages</h3>`) directly at the top of each card's body.
- Retain the essential action controls in `#card-zine` (Undo, Redo, Page count chip) seamlessly integrated into its canvas card.
- By eliminating the 4 separate top bars, we reclaim ~140px of vertical space, completely resolving the vertical crowding and bottom clipping.

### 2. Configure Card Bodies as Direct Drag Handles
- In `src/utils/gridStack.js`, update GridStack's `handle` option to target the card surface (`.snap-card, .brand-panel`).
- Set GridStack's `cancel` selector to ignore clicks and drags on interactive elements (`button, input, select, textarea, label, [role="button"], .upload-box, .smart-sheet-unit-btn, .smart-sheet-orientation-btn, .smart-sheet-stepper-btn, .workspace-config-toggle`).
- Style the cards with `cursor: grab` on background areas and `cursor: default`/`pointer` on interactive controls, giving smooth drag-and-drop rearrangement without needing a dedicated top handle bar.

### 3. Layout Fit & CSS Polish
- In `src/styles/layout.css` and `src/styles/components.css`:
  - Style the integrated `.card-section-title` in Fraunces display serif with refined font size and spacing.
  - Ensure card bodies maintain `overflow-y: auto` with smooth internal scrolling when needed on ultra-short viewports.
  - Verify card dimensions and row heights fit the screen cleanly without any overlapping or clipping.

## Verification Plan

### Automated Verification
- Run `npm run lint` (`lint_applet`) to ensure clean code and zero syntax/import errors.
- Run `npm run build` (`compile_applet`) to verify the production bundle builds without errors.

### Manual / Browser Verification
- Verify that cards can be dragged and rearranged by grabbing anywhere on the card body background.
- Verify that clicking buttons, file upload drop zone, paper size select dropdown, orientation buttons, margin slider, and toggles functions normally without accidentally triggering card drag.
- Confirm that the sidebar panels fit cleanly into the screen viewport without card clipping or overlaps.
