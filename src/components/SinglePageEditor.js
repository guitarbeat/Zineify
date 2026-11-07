/**
 * SinglePageEditor.js
 * Illustrator / Photoshop-style single-page artboard editor expanded inside the main workspace
 * with direct click-to-type tool, drag-and-drop bounding box with 4 corner resize handles,
 * typography inspector drawer, and 1–8 page switcher buttons.
 */

const FONT_FAMILY_CSS = {
  sans: '"Plus Jakarta Sans", sans-serif',
  serif: '"Fraunces", Georgia, serif',
  mono: '"Space Mono", monospace',
  handwriting: '"Caveat", cursive, sans-serif'
};

const PAGE_ROLE_NAMES = [
  '1 · Front Cover',
  '2 · Inside Left',
  '3 · Page 3',
  '4 · Page 4',
  '5 · Page 5',
  '6 · Page 6',
  '7 · Inside Right',
  '8 · Back Cover'
];

export class SinglePageEditor {
  constructor(options = {}) {
    this.container = options.container;
    this.state = options.state || null;
    this.onStateMutated = options.onStateMutated || (() => {});

    this.onAddText = options.onAddText || ((pageIndex, props) => {
      if (!this.state?.addPageText) { return null; }
      const created = this.state.addPageText(pageIndex, props);
      this.onStateMutated(`Added text on Page ${pageIndex + 1}`);
      return created;
    });

    this.onUpdateText = options.onUpdateText || ((pageIndex, stickerId, patch, recordUndo = false) => {
      if (!this.state?.updatePageText) { return; }
      this.state.updatePageText(pageIndex, stickerId, patch);
      this.onStateMutated(recordUndo ? `Updated text on Page ${pageIndex + 1}` : null);
    });

    this.onRemoveText = options.onRemoveText || ((pageIndex, stickerId) => {
      if (!this.state?.removePageText) { return; }
      this.state.removePageText(pageIndex, stickerId);
      this.onStateMutated(`Removed text from Page ${pageIndex + 1}`);
    });

    this.onPageSwitch = options.onPageSwitch || (() => {});
    this.onClose = options.onClose || (() => {});
    this.onPageAction = options.onPageAction || (() => {});

    this.isOpen = false;
    this.pageIndex = 0;
    this.selectedStickerId = null;
    this.editingStickerId = null;
    this.toolMode = 'select'; // 'select' | 'text'
    this.snapEnabled = true;
    this.gridVisible = true;
    this.stateData = null;

    this._resizeObserver = null;
    this._buildDOM();
    this._attachEvents();
  }

  _buildDOM() {
    if (!this.container) { return; }

    this.container.innerHTML = `
      <div class="spe-shell">
        <!-- Top Artboard Bar -->
        <div class="spe-topbar">
          <div class="spe-topbar-left">
            <button type="button" class="spe-back-btn" data-spe-action="close" title="Return to 8-page imposition sheet (Esc)">
              <span class="material-symbols-outlined icon-compact" aria-hidden="true">arrow_back</span>
              <span>8-Page Sheet</span>
            </button>
            <div class="spe-divider-v" aria-hidden="true"></div>
            <div class="spe-tool-group" role="group" aria-label="Artboard tools">
              <button type="button" class="spe-tool-btn is-active" data-spe-tool="select" title="Select, Move & Resize Tool (V)">
                <span class="material-symbols-outlined icon-compact" aria-hidden="true">near_me</span>
                <span>Move / Resize</span>
              </button>
              <button type="button" class="spe-tool-btn" data-spe-tool="text" title="Type Tool (T) — Click anywhere on the page to type">
                <span class="material-symbols-outlined icon-compact" aria-hidden="true">title</span>
                <span>Click to Type</span>
              </button>
              <button type="button" class="spe-add-text-cta" data-spe-action="add-center-text" title="Add a new text box to this page">
                <span class="material-symbols-outlined icon-compact" aria-hidden="true">add_box</span>
                <span>+ Text Box</span>
              </button>
            </div>
            <div class="spe-divider-v" aria-hidden="true"></div>
            <div class="spe-tool-group" role="group" aria-label="Grid and alignment snapping">
              <button type="button" class="spe-tool-btn is-active" data-spe-action="toggle-snap" aria-pressed="true" title="Toggle Snap to Alignment Guides & Grid (Hold Alt while dragging to bypass)">
                <span class="material-symbols-outlined icon-compact" aria-hidden="true">grid_Goldenratio</span>
                <span>Snap</span>
              </button>
              <button type="button" class="spe-tool-btn is-active" data-spe-action="toggle-grid" aria-pressed="true" title="Toggle visual alignment grid & safe margins on artboard">
                <span class="material-symbols-outlined icon-compact" aria-hidden="true">grid_4x4</span>
                <span>Grid</span>
              </button>
            </div>
          </div>

          <!-- Center Page Switcher (1–8) -->
          <div class="spe-page-switcher" role="navigation" aria-label="Switch page (1 to 8)">
            <button type="button" class="spe-page-nav-btn" data-spe-action="prev-page" title="Previous page" aria-label="Previous page">
              <span class="material-symbols-outlined icon-compact" aria-hidden="true">chevron_left</span>
            </button>
            <div class="spe-page-pills" data-spe-page-pills></div>
            <button type="button" class="spe-page-nav-btn" data-spe-action="next-page" title="Next page" aria-label="Next page">
              <span class="material-symbols-outlined icon-compact" aria-hidden="true">chevron_right</span>
            </button>
          </div>
        </div>

        <!-- Main Workspace Body: Center Upright Artboard + Right Edit Drawer -->
        <div class="spe-workspace">
          <div class="spe-artboard-viewport" data-spe-viewport>
            <div class="spe-artboard-stage" data-spe-artboard>
              <div class="spe-artboard-bg" data-spe-artboard-bg>
                <img class="spe-artboard-img hidden" data-spe-artboard-img draggable="false" alt="Page artwork" />
                <div class="spe-artboard-empty" data-spe-artboard-empty>
                  <span class="material-symbols-outlined text-3xl opacity-40">article</span>
                  <span class="spe-empty-role" data-spe-empty-role>Page 1</span>
                  <span class="spe-empty-hint">Click with Type tool or "+ Text Box" to add typography, or upload artwork</span>
                </div>
              </div>
              <div class="spe-artboard-grid-overlay" data-spe-grid-overlay aria-hidden="true">
                <div class="spe-grid-safe-margin"></div>
                <div class="spe-grid-center-v"></div>
                <div class="spe-grid-center-h"></div>
              </div>
              <div class="spe-artboard-smart-guides" data-spe-smart-guides aria-hidden="true"></div>
              <div class="spe-artboard-text-layer" data-spe-text-layer></div>
            </div>
            <div class="spe-tool-hint hidden" data-spe-tool-hint>
              <span class="material-symbols-outlined icon-compact">ads_click</span>
              <span>Click anywhere on the page artboard to place text</span>
            </div>
          </div>

          <!-- Right Inspector Edit Drawer -->
          <aside class="spe-drawer" aria-label="Page and typography properties">
            <div class="spe-drawer-section">
              <div class="spe-drawer-header">
                <span class="spe-drawer-title" data-spe-page-heading>Page 1 · Front Cover</span>
                <span class="spe-role-badge">Upright View</span>
              </div>
              <div class="spe-quick-actions">
                <button type="button" class="spe-quick-btn" data-spe-page-op="replace" title="Upload or replace image on this page">
                  <span class="material-symbols-outlined icon-compact">upload_file</span>
                  <span>Image</span>
                </button>
                <button type="button" class="spe-quick-btn" data-spe-page-op="crop" title="Toggle Fit / Fill crop">
                  <span class="material-symbols-outlined icon-compact">fit_screen</span>
                  <span data-spe-crop-label>Fit</span>
                </button>
                <button type="button" class="spe-quick-btn" data-spe-page-op="rotate" title="Rotate image 90°">
                  <span class="material-symbols-outlined icon-compact">rotate_90_degrees_cw</span>
                  <span>90°</span>
                </button>
              </div>
            </div>

            <!-- Selected Text Box Inspector -->
            <div class="spe-drawer-section spe-inspector-pane" data-spe-inspector>
              <div class="spe-drawer-header">
                <span class="spe-drawer-title">Text Properties</span>
                <button type="button" class="spe-delete-layer-btn" data-spe-action="delete-selected" title="Delete selected text box (Delete)">
                  <span class="material-symbols-outlined icon-compact">delete</span>
                  <span>Delete</span>
                </button>
              </div>

              <div class="spe-inspector-body" data-spe-inspector-controls>
                <label class="spe-field">
                  <span class="spe-field-label">Text Content</span>
                  <textarea class="spe-textarea" data-spe-input="text" rows="2" placeholder="Type your zine text..."></textarea>
                </label>

                <div class="spe-field">
                  <div class="flex items-center justify-between">
                    <span class="spe-field-label">Snap Align on Page</span>
                    <span class="spe-pos-readout tabular-nums" data-spe-pos-readout>X: 18% · Y: 34%</span>
                  </div>
                  <div class="spe-style-bar" role="group" aria-label="Align text box on page">
                    <button type="button" class="spe-style-btn" data-spe-snap-pos="left" title="Snap to Left Safe Margin">
                      <span class="material-symbols-outlined icon-compact">align_horizontal_left</span>
                    </button>
                    <button type="button" class="spe-style-btn" data-spe-snap-pos="center-x" title="Snap to Horizontal Center of Page">
                      <span class="material-symbols-outlined icon-compact">align_horizontal_center</span>
                    </button>
                    <button type="button" class="spe-style-btn" data-spe-snap-pos="right" title="Snap to Right Safe Margin">
                      <span class="material-symbols-outlined icon-compact">align_horizontal_right</span>
                    </button>
                    <button type="button" class="spe-style-btn" data-spe-snap-pos="top" title="Snap to Top Safe Margin">
                      <span class="material-symbols-outlined icon-compact">align_vertical_top</span>
                    </button>
                    <button type="button" class="spe-style-btn" data-spe-snap-pos="center-y" title="Snap to Vertical Center of Page">
                      <span class="material-symbols-outlined icon-compact">align_vertical_center</span>
                    </button>
                    <button type="button" class="spe-style-btn" data-spe-snap-pos="bottom" title="Snap to Bottom Safe Margin">
                      <span class="material-symbols-outlined icon-compact">align_vertical_bottom</span>
                    </button>
                  </div>
                </div>

                <div class="spe-field-row">
                  <label class="spe-field flex-1">
                    <span class="spe-field-label">Font Family</span>
                    <select class="spe-select" data-spe-input="fontFamily" aria-label="Font family">
                      <option value="sans">Sans (Plus Jakarta)</option>
                      <option value="serif">Serif (Fraunces)</option>
                      <option value="mono">Monospace (Space Mono)</option>
                      <option value="handwriting">Handwritten (Caveat)</option>
                    </select>
                  </label>
                </div>

                <div class="spe-field">
                  <div class="flex items-center justify-between">
                    <span class="spe-field-label">Size (Drag corner handles or slide)</span>
                    <span class="spe-size-readout tabular-nums" data-spe-size-readout>22 px</span>
                  </div>
                  <div class="spe-size-row">
                    <input type="range" class="spe-range" data-spe-input="fontSize" min="10" max="84" step="1" value="22" />
                    <button type="button" class="spe-style-btn" data-spe-action="toggle-bold" title="Bold text">
                      <strong>B</strong>
                    </button>
                  </div>
                </div>

                <div class="spe-field">
                  <span class="spe-field-label">Text Alignment</span>
                  <div class="spe-style-bar" role="group" aria-label="Text alignment">
                    <button type="button" class="spe-style-btn is-active" data-spe-align="left" title="Align Left">
                      <span class="material-symbols-outlined icon-compact">format_align_left</span>
                    </button>
                    <button type="button" class="spe-style-btn" data-spe-align="center" title="Align Center">
                      <span class="material-symbols-outlined icon-compact">format_align_center</span>
                    </button>
                    <button type="button" class="spe-style-btn" data-spe-align="right" title="Align Right">
                      <span class="material-symbols-outlined icon-compact">format_align_right</span>
                    </button>
                  </div>
                </div>

                <div class="spe-field">
                  <span class="spe-field-label">Text Color</span>
                  <div class="spe-color-row">
                    <input type="color" class="spe-color-picker" data-spe-input="color" value="#111827" aria-label="Text color" />
                    <div class="spe-swatches">
                      <button type="button" class="spe-swatch" data-spe-text-color="#111827" style="background:#111827" title="Ink Black"></button>
                      <button type="button" class="spe-swatch" data-spe-text-color="#ffffff" style="background:#ffffff" title="Pure White"></button>
                      <button type="button" class="spe-swatch" data-spe-text-color="#e02424" style="background:#e02424" title="Zine Crimson"></button>
                      <button type="button" class="spe-swatch" data-spe-text-color="#d97706" style="background:#d97706" title="Amber"></button>
                      <button type="button" class="spe-swatch" data-spe-text-color="#2563eb" style="background:#2563eb" title="Cobalt Blue"></button>
                      <button type="button" class="spe-swatch" data-spe-text-color="#059669" style="background:#059669" title="Emerald"></button>
                    </div>
                  </div>
                </div>

                <div class="spe-field">
                  <div class="flex items-center justify-between">
                    <span class="spe-field-label">Background Box</span>
                    <label class="spe-field-label-inline">
                      <input type="checkbox" data-spe-input="bgEnabled" checked />
                      <span>Show Fill</span>
                    </label>
                  </div>
                  <div class="spe-color-row" data-spe-bg-row>
                    <div class="spe-swatches">
                      <button type="button" class="spe-swatch" data-spe-bg-color="rgba(255,255,255,0.92)" style="background:#ffffff" title="White Pill"></button>
                      <button type="button" class="spe-swatch" data-spe-bg-color="rgba(17,24,39,0.92)" style="background:#111827" title="Dark Pill"></button>
                      <button type="button" class="spe-swatch" data-spe-bg-color="#fef3c7" style="background:#fef3c7" title="Warm Cream"></button>
                      <button type="button" class="spe-swatch" data-spe-bg-color="#fee2e2" style="background:#fee2e2" title="Soft Rose"></button>
                      <button type="button" class="spe-swatch" data-spe-bg-color="#dbeafe" style="background:#dbeafe" title="Ice Blue"></button>
                    </div>
                  </div>
                </div>
              </div>

              <div class="spe-inspector-empty hidden" data-spe-inspector-empty>
                <p>Select a text box on the artboard or click anywhere with the <strong>Click to Type</strong> tool to add text.</p>
              </div>
            </div>

            <!-- Text Layers List on Current Page -->
            <div class="spe-drawer-section spe-layers-section flex-1 flex flex-col min-h-0">
              <div class="spe-drawer-header">
                <span class="spe-drawer-title">Text Layers on Page</span>
                <span class="spe-layer-count tabular-nums" data-spe-layer-count>0</span>
              </div>
              <div class="spe-layer-list" data-spe-layer-list></div>
            </div>
          </aside>
        </div>
      </div>
    `;

    this.artboardEl = this.container.querySelector('[data-spe-artboard]');
    this.artboardBgEl = this.container.querySelector('[data-spe-artboard-bg]');
    this.artboardImgEl = this.container.querySelector('[data-spe-artboard-img]');
    this.artboardEmptyEl = this.container.querySelector('[data-spe-artboard-empty]');
    this.emptyRoleEl = this.container.querySelector('[data-spe-empty-role]');
    this.gridOverlayEl = this.container.querySelector('[data-spe-grid-overlay]');
    this.smartGuidesEl = this.container.querySelector('[data-spe-smart-guides]');
    this.textLayerEl = this.container.querySelector('[data-spe-text-layer]');
    this.viewportEl = this.container.querySelector('[data-spe-viewport]');
    this.toolHintEl = this.container.querySelector('[data-spe-tool-hint]');
    this.pagePillsEl = this.container.querySelector('[data-spe-page-pills]');
    this.pageHeadingEl = this.container.querySelector('[data-spe-page-heading]');
    this.cropLabelEl = this.container.querySelector('[data-spe-crop-label]');
    this.snapToggleBtn = this.container.querySelector('[data-spe-action="toggle-snap"]');
    this.gridToggleBtn = this.container.querySelector('[data-spe-action="toggle-grid"]');

    this.inspectorControlsEl = this.container.querySelector('[data-spe-inspector-controls]');
    this.inspectorEmptyEl = this.container.querySelector('[data-spe-inspector-empty]');
    this.deleteSelectedBtn = this.container.querySelector('[data-spe-action="delete-selected"]');
    this.textInput = this.container.querySelector('[data-spe-input="text"]');
    this.posReadout = this.container.querySelector('[data-spe-pos-readout]');
    this.fontSelect = this.container.querySelector('[data-spe-input="fontFamily"]');
    this.sizeInput = this.container.querySelector('[data-spe-input="fontSize"]');
    this.sizeReadout = this.container.querySelector('[data-spe-size-readout]');
    this.boldBtn = this.container.querySelector('[data-spe-action="toggle-bold"]');
    this.colorInput = this.container.querySelector('[data-spe-input="color"]');
    this.bgCheck = this.container.querySelector('[data-spe-input="bgEnabled"]');
    this.bgRow = this.container.querySelector('[data-spe-bg-row]');
    this.layerListEl = this.container.querySelector('[data-spe-layer-list]');
    this.layerCountEl = this.container.querySelector('[data-spe-layer-count]');

    if (typeof ResizeObserver !== 'undefined' && this.viewportEl) {
      this._resizeObserver = new ResizeObserver(() => {
        if (this.isOpen) {
          this._fitArtboardToViewport();
          this._renderTextBoxes();
        }
      });
      this._resizeObserver.observe(this.viewportEl);
    }
  }

  _attachEvents() {
    if (!this.container) { return; }

    this.container.addEventListener('click', (e) => {
      const actionBtn = e.target.closest('[data-spe-action]');
      if (actionBtn) {
        const action = actionBtn.getAttribute('data-spe-action');
        if (action === 'close') {
          this.close();
        } else if (action === 'prev-page') {
          this.switchPage((this.pageIndex + 7) % 8);
        } else if (action === 'next-page') {
          this.switchPage((this.pageIndex + 1) % 8);
        } else if (action === 'add-center-text') {
          this._createNewStickerAt(24, 38);
        } else if (action === 'delete-selected') {
          if (this.selectedStickerId) {
            this.onRemoveText(this.pageIndex, this.selectedStickerId);
            this.selectedStickerId = null;
            this.editingStickerId = null;
            this.refresh();
          }
        } else if (action === 'toggle-bold') {
          const stk = this._getSelectedSticker();
          if (stk) {
            this.onUpdateText(this.pageIndex, stk.id, { isBold: !stk.isBold }, true);
            this.refresh();
          }
        } else if (action === 'toggle-snap') {
          this.snapEnabled = !this.snapEnabled;
          this.snapToggleBtn?.classList.toggle('is-active', this.snapEnabled);
          this.snapToggleBtn?.setAttribute('aria-pressed', String(this.snapEnabled));
        } else if (action === 'toggle-grid') {
          this.gridVisible = !this.gridVisible;
          this.gridToggleBtn?.classList.toggle('is-active', this.gridVisible);
          this.gridToggleBtn?.setAttribute('aria-pressed', String(this.gridVisible));
          this.gridOverlayEl?.classList.toggle('hidden', !this.gridVisible);
        }
        return;
      }

      const snapPosBtn = e.target.closest('[data-spe-snap-pos]');
      if (snapPosBtn) {
        const snapTarget = snapPosBtn.getAttribute('data-spe-snap-pos');
        const stk = this._getSelectedSticker();
        if (stk && this.artboardEl) {
          const artboardRect = this.artboardEl.getBoundingClientRect();
          const boxEl = this.textLayerEl?.querySelector(`[data-sticker-id="${stk.id}"]`);
          const boxRect = boxEl ? boxEl.getBoundingClientRect() : null;
          const boxWPct = boxRect && artboardRect.width > 0
            ? (boxRect.width / artboardRect.width) * 100
            : 24;
          const boxHPct = boxRect && artboardRect.height > 0
            ? (boxRect.height / artboardRect.height) * 100
            : 10;

          let nextX = stk.x;
          let nextY = stk.y;
          const flashGuides = [];

          if (snapTarget === 'left') {
            nextX = 8;
            flashGuides.push({ axis: 'v', pos: 8, label: 'Left Margin' });
          } else if (snapTarget === 'center-x') {
            nextX = Math.max(0, Math.min(92, Math.round((50 - boxWPct / 2) * 10) / 10));
            flashGuides.push({ axis: 'v', pos: 50, label: 'Center X' });
          } else if (snapTarget === 'right') {
            nextX = Math.max(0, Math.min(92, Math.round((92 - boxWPct) * 10) / 10));
            flashGuides.push({ axis: 'v', pos: 92, label: 'Right Margin' });
          } else if (snapTarget === 'top') {
            nextY = 6;
            flashGuides.push({ axis: 'h', pos: 6, label: 'Top Margin' });
          } else if (snapTarget === 'center-y') {
            nextY = Math.max(0, Math.min(92, Math.round((50 - boxHPct / 2) * 10) / 10));
            flashGuides.push({ axis: 'h', pos: 50, label: 'Center Y' });
          } else if (snapTarget === 'bottom') {
            nextY = Math.max(0, Math.min(92, Math.round((94 - boxHPct) * 10) / 10));
            flashGuides.push({ axis: 'h', pos: 94, label: 'Bottom Margin' });
          }

          this.onUpdateText(this.pageIndex, stk.id, { x: nextX, y: nextY }, true);
          this.refresh();
          this._renderSmartGuides(flashGuides);
          clearTimeout(this._flashGuideTimer);
          this._flashGuideTimer = setTimeout(() => {
            this._clearSmartGuides();
          }, 650);
        }
        return;
      }

      const toolBtn = e.target.closest('[data-spe-tool]');
      if (toolBtn) {
        this.setToolMode(toolBtn.getAttribute('data-spe-tool'));
        return;
      }

      const pagePill = e.target.closest('[data-spe-page-index]');
      if (pagePill) {
        const idx = parseInt(pagePill.getAttribute('data-spe-page-index'), 10);
        if (!Number.isNaN(idx)) {
          this.switchPage(idx);
        }
        return;
      }

      const pageOpBtn = e.target.closest('[data-spe-page-op]');
      if (pageOpBtn) {
        const op = pageOpBtn.getAttribute('data-spe-page-op');
        this.onPageAction(this.pageIndex, op);
        return;
      }

      const alignBtn = e.target.closest('[data-spe-align]');
      if (alignBtn) {
        const align = alignBtn.getAttribute('data-spe-align');
        const stk = this._getSelectedSticker();
        if (stk) {
          this.onUpdateText(this.pageIndex, stk.id, { align }, true);
          this.refresh();
        }
        return;
      }

      const textSwatch = e.target.closest('[data-spe-text-color]');
      if (textSwatch) {
        const color = textSwatch.getAttribute('data-spe-text-color');
        const stk = this._getSelectedSticker();
        if (stk) {
          this.onUpdateText(this.pageIndex, stk.id, { color }, true);
          this.refresh();
        }
        return;
      }

      const bgSwatch = e.target.closest('[data-spe-bg-color]');
      if (bgSwatch) {
        const bg = bgSwatch.getAttribute('data-spe-bg-color');
        const stk = this._getSelectedSticker();
        if (stk) {
          this.onUpdateText(this.pageIndex, stk.id, { bg, bgEnabled: true }, true);
          this.refresh();
        }
        return;
      }

      const layerRow = e.target.closest('[data-spe-layer-id]');
      if (layerRow) {
        const id = layerRow.getAttribute('data-spe-layer-id');
        if (e.target.closest('[data-spe-layer-delete]')) {
          this.onRemoveText(this.pageIndex, id);
          if (this.selectedStickerId === id) {
            this.selectedStickerId = null;
          }
          this.refresh();
        } else {
          this.selectedStickerId = id;
          this.editingStickerId = null;
          this.refresh();
        }
      }
    });

    // Click on artboard background: either place text in 'text' tool mode, or deselect in 'select' mode
    this.artboardEl?.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.spe-textbox')) {
        return;
      }
      const rect = this.artboardEl.getBoundingClientRect();
      const xPct = Math.max(2, Math.min(82, Math.round(((e.clientX - rect.left) / rect.width) * 100)));
      const yPct = Math.max(2, Math.min(86, Math.round(((e.clientY - rect.top) / rect.height) * 100)));

      if (this.toolMode === 'text') {
        e.preventDefault();
        this._createNewStickerAt(xPct, yPct, true);
      } else {
        this.selectedStickerId = null;
        this.editingStickerId = null;
        this.refresh();
      }
    });

    // Inspector live inputs
    this.textInput?.addEventListener('input', (e) => {
      const stk = this._getSelectedSticker();
      if (!stk) { return; }
      this.onUpdateText(this.pageIndex, stk.id, { text: e.target.value || ' ' }, false);
      this._renderTextBoxes();
      this._renderLayerList();
    });

    this.fontSelect?.addEventListener('change', (e) => {
      const stk = this._getSelectedSticker();
      if (!stk) { return; }
      this.onUpdateText(this.pageIndex, stk.id, { fontFamily: e.target.value }, true);
      this.refresh();
    });

    this.sizeInput?.addEventListener('input', (e) => {
      const stk = this._getSelectedSticker();
      if (!stk) { return; }
      const fontSize = parseInt(e.target.value, 10) || 22;
      if (this.sizeReadout) {
        this.sizeReadout.textContent = `${fontSize} px`;
      }
      this.onUpdateText(this.pageIndex, stk.id, { fontSize }, false);
      this._renderTextBoxes();
    });

    this.colorInput?.addEventListener('input', (e) => {
      const stk = this._getSelectedSticker();
      if (!stk) { return; }
      this.onUpdateText(this.pageIndex, stk.id, { color: e.target.value }, false);
      this._renderTextBoxes();
    });

    this.bgCheck?.addEventListener('change', (e) => {
      const stk = this._getSelectedSticker();
      if (!stk) { return; }
      this.onUpdateText(this.pageIndex, stk.id, { bgEnabled: e.target.checked }, true);
      this.refresh();
    });

    // Keyboard shortcuts when SinglePageEditor is open
    window.addEventListener('keydown', (e) => {
      if (!this.isOpen) { return; }
      const activeTag = document.activeElement?.tagName;
      const isTyping = activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT' || document.activeElement?.isContentEditable;

      if (e.key === 'Escape') {
        if (this.editingStickerId) {
          this.editingStickerId = null;
          this.refresh();
        } else if (this.toolMode === 'text') {
          this.setToolMode('select');
        } else {
          this.close();
        }
        return;
      }

      if (isTyping) { return; }

      if (e.key === 'v' || e.key === 'V') {
        e.preventDefault();
        this.setToolMode('select');
      } else if (e.key === 't' || e.key === 'T') {
        e.preventDefault();
        this.setToolMode('text');
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && this.selectedStickerId) {
        e.preventDefault();
        this.onRemoveText(this.pageIndex, this.selectedStickerId);
        this.selectedStickerId = null;
        this.refresh();
      }
    });
  }

  _syncStateDataFromStore() {
    if (!this.state) {
      return;
    }
    this.stateData = {
      paperColor: this.state.paperColor || '#ffffff',
      blankPageUrl: this.state._blankPageUrl || null,
      pageImages: this.state.allPageImages || [],
      pageFlips: this.state.pageFlips || {},
      pageRotations: this.state.pageRotations || {},
      pageZooms: this.state.pageZooms || {},
      pageTransforms: this.state.pageTransforms || {},
      pageTexts: this.state.pageTexts || {},
      paperDimensions: this.stateData?.paperDimensions || { width: 279.4, height: 215.9 }
    };
  }

  open(pageIndexOrOpts = 0, opts = {}) {
    if (!this.container) { return; }
    this.isOpen = true;

    if (typeof pageIndexOrOpts === 'object' && pageIndexOrOpts !== null) {
      this.pageIndex = pageIndexOrOpts.pageIndex ?? 0;
      this.stateData = pageIndexOrOpts.stateData || this.stateData;
      this.toolMode = pageIndexOrOpts.toolMode || pageIndexOrOpts.initialTool || 'select';
      opts = {
        selectId: pageIndexOrOpts.stickerId ?? pageIndexOrOpts.selectId ?? null,
        initialTool: this.toolMode
      };
    } else {
      this.pageIndex = Number.isFinite(pageIndexOrOpts) ? pageIndexOrOpts : 0;
      this.toolMode = opts.initialTool || opts.toolMode || 'select';
    }

    this._syncStateDataFromStore();

    const stickers = this._getPageStickers();
    const targetStickerId = opts.selectId ?? opts.stickerId ?? null;
    if (targetStickerId && stickers.some((s) => s.id === targetStickerId)) {
      this.selectedStickerId = targetStickerId;
    } else if (stickers.length > 0) {
      this.selectedStickerId = stickers[stickers.length - 1].id;
    } else {
      this.selectedStickerId = null;
    }
    this.editingStickerId = null;

    const previewArea = document.getElementById('preview-area');
    previewArea?.classList.add('hidden');
    const stageView = document.getElementById('stage-sheet-view');
    stageView?.classList.add('is-single-page-editing');
    const canvasBody = this.container.closest('.snap-card-body--canvas');
    canvasBody?.classList.add('is-single-page-editing');

    this.container.classList.remove('hidden');
    this.setToolMode(this.toolMode);
    this.refresh();

    requestAnimationFrame(() => {
      if (this.isOpen) {
        this._fitArtboardToViewport();
        this._renderTextBoxes();
      }
    });
  }

  close() {
    if (!this.isOpen) { return; }
    this.isOpen = false;
    this.editingStickerId = null;
    this._clearSmartGuides();
    this.container?.classList.add('hidden');

    const stageView = document.getElementById('stage-sheet-view');
    stageView?.classList.remove('is-single-page-editing');
    const canvasBody = this.container?.closest('.snap-card-body--canvas');
    canvasBody?.classList.remove('is-single-page-editing');
    const previewArea = document.getElementById('preview-area');
    previewArea?.classList.remove('hidden');

    this.onClose();
  }

  switchPage(pageIndex) {
    this.pageIndex = Math.max(0, Math.min(7, pageIndex));
    this._syncStateDataFromStore();
    const stickers = this._getPageStickers();
    this.selectedStickerId = stickers.length > 0 ? stickers[stickers.length - 1].id : null;
    this.editingStickerId = null;
    this.onPageSwitch(this.pageIndex);
    this.refresh();
  }

  setToolMode(mode) {
    this.toolMode = mode === 'text' ? 'text' : 'select';
    this.container?.querySelectorAll('[data-spe-tool]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.getAttribute('data-spe-tool') === this.toolMode);
    });
    this.artboardEl?.classList.toggle('is-text-tool', this.toolMode === 'text');
    this.artboardEl?.classList.toggle('is-text-cursor', this.toolMode === 'text');
    this.toolHintEl?.classList.toggle('hidden', this.toolMode !== 'text');
  }

  updateStateData(stateData) {
    this.stateData = stateData;
    if (this.isOpen) {
      this.refresh();
    }
  }

  refresh() {
    if (!this.isOpen) { return; }
    this._syncStateDataFromStore();
    if (!this.stateData) { return; }
    this._fitArtboardToViewport();
    this._renderPagePills();
    this._renderArtboardBackground();
    this._renderTextBoxes();
    this._renderInspector();
    this._renderLayerList();
  }

  _getPageStickers() {
    return this.stateData?.pageTexts?.[this.pageIndex] || [];
  }

  _getSelectedSticker() {
    const stickers = this._getPageStickers();
    return stickers.find((s) => s.id === this.selectedStickerId) || null;
  }

  _createNewStickerAt(x, y, startInlineEdit = false) {
    const created = this.onAddText(this.pageIndex, {
      text: 'Double-click or type',
      x,
      y,
      fontSize: 24,
      fontFamily: 'sans',
      align: 'left',
      color: '#111827',
      bg: 'rgba(255,255,255,0.92)',
      bgEnabled: true,
      isBold: true
    });
    if (created?.id) {
      this.selectedStickerId = created.id;
      this.editingStickerId = startInlineEdit ? created.id : null;
    }
    this.setToolMode('select');
    this.refresh();
    if (!startInlineEdit && this.textInput) {
      this.textInput.focus();
      this.textInput.select();
    }
  }

  _fitArtboardToViewport() {
    if (!this.viewportEl || !this.artboardEl) { return; }
    const rect = this.viewportEl.getBoundingClientRect();
    const availW = Math.max(180, rect.width - 36);
    const availH = Math.max(180, rect.height - 32);

    // Single zine panel aspect ratio (width / 4) / (height / 2)
    const sheetW = this.stateData?.paperDimensions?.width || 279.4;
    const sheetH = this.stateData?.paperDimensions?.height || 215.9;
    const panelW = sheetW / 4;
    const panelH = sheetH / 2;
    const aspect = panelW / panelH;

    let widthPx = availH * aspect;
    let heightPx = availH;
    if (widthPx > availW) {
      widthPx = availW;
      heightPx = availW / aspect;
    }

    this.artboardEl.style.width = `${Math.round(widthPx)}px`;
    this.artboardEl.style.height = `${Math.round(heightPx)}px`;
  }

  _renderPagePills() {
    if (!this.pagePillsEl) { return; }
    const pillsHtml = [];
    for (let i = 0; i < 8; i++) {
      const isActive = i === this.pageIndex;
      const hasTexts = (this.stateData?.pageTexts?.[i]?.length || 0) > 0;
      const shortLabel = i === 0 ? '1 Cover' : (i === 7 ? '8 Back' : String(i + 1));
      pillsHtml.push(`
        <button type="button"
          class="spe-page-pill ${isActive ? 'is-active' : ''} ${hasTexts ? 'has-text-layers' : ''}"
          data-spe-page-index="${i}"
          aria-pressed="${isActive}"
          title="${PAGE_ROLE_NAMES[i]}">
          <span>${shortLabel}</span>
          ${hasTexts ? '<span class="spe-pill-dot" aria-hidden="true"></span>' : ''}
        </button>
      `);
    }
    this.pagePillsEl.innerHTML = pillsHtml.join('');

    if (this.pageHeadingEl) {
      this.pageHeadingEl.textContent = `Page ${PAGE_ROLE_NAMES[this.pageIndex] || (this.pageIndex + 1)}`;
    }
    if (this.emptyRoleEl) {
      this.emptyRoleEl.textContent = `Page ${PAGE_ROLE_NAMES[this.pageIndex] || (this.pageIndex + 1)}`;
    }
  }

  _renderArtboardBackground() {
    if (!this.artboardBgEl || !this.artboardImgEl || !this.artboardEmptyEl) { return; }
    const paperColor = this.stateData?.paperColor || '#ffffff';
    if (this.artboardEl) {
      this.artboardEl.style.backgroundColor = paperColor;
    }
    this.artboardBgEl.style.backgroundColor = paperColor;

    const rawUrl = this.stateData?.pageImages?.[this.pageIndex] || null;
    const isBlankPage = Boolean(rawUrl && this.stateData?.blankPageUrl && rawUrl === this.stateData.blankPageUrl);
    const url = isBlankPage ? null : rawUrl;
    const transform = this.stateData?.pageTransforms?.[this.pageIndex] || {};
    const isFill = Boolean(this.stateData?.pageZooms?.[this.pageIndex]) || transform.fit === 'fill' || transform.fit === 'cover';
    const zoom = Number.isFinite(transform.zoom) ? Math.max(1, Math.min(2.5, transform.zoom)) : 1;
    const scale = zoom > 1 ? zoom : (isFill ? 1.08 : 1);
    const panX = Number.isFinite(transform.pan?.x) ? transform.pan.x * 0.35 : 0;
    const panY = Number.isFinite(transform.pan?.y) ? transform.pan.y * 0.35 : 0;
    const rotation = Number.isFinite(this.stateData?.pageRotations?.[this.pageIndex])
      ? this.stateData.pageRotations[this.pageIndex]
      : (this.stateData?.pageFlips?.[this.pageIndex] ? 180 : 0);

    if (this.cropLabelEl) {
      this.cropLabelEl.textContent = isFill ? 'Fill' : 'Fit';
    }

    if (url) {
      this.artboardImgEl.src = url;
      this.artboardImgEl.classList.remove('hidden');
      this.artboardEmptyEl.classList.add('hidden');
      this.artboardImgEl.style.objectFit = isFill ? 'cover' : 'contain';
      this.artboardImgEl.style.transform = `translate(${panX}%, ${panY}%) rotate(${rotation}deg) scale(${scale})`;
    } else {
      this.artboardImgEl.removeAttribute('src');
      this.artboardImgEl.classList.add('hidden');
      this.artboardEmptyEl.classList.remove('hidden');
    }
  }

  _renderTextBoxes() {
    if (!this.textLayerEl || !this.artboardEl) { return; }
    const stickers = this._getPageStickers();
    const artboardW = this.artboardEl.clientWidth || 360;
    const scaleRatio = artboardW / 360;

    this.textLayerEl.replaceChildren();

    stickers.forEach((stk) => {
      const isSelected = stk.id === this.selectedStickerId;
      const isEditing = stk.id === this.editingStickerId;

      const box = document.createElement('div');
      box.className = `spe-textbox ${isSelected ? 'is-selected' : ''} ${isEditing ? 'is-editing' : ''}`;
      box.setAttribute('data-sticker-id', stk.id);
      box.style.left = `${stk.x}%`;
      box.style.top = `${stk.y}%`;

      const scaledFontPx = Math.max(10, Math.round((stk.fontSize || 22) * scaleRatio));
      box.style.fontSize = `${scaledFontPx}px`;
      box.style.fontFamily = FONT_FAMILY_CSS[stk.fontFamily] || FONT_FAMILY_CSS.sans;
      box.style.fontWeight = stk.isBold ? '700' : '500';
      box.style.textAlign = stk.align || 'left';
      box.style.color = stk.color || '#111827';
      const showBg = stk.bgEnabled !== false && stk.bg !== 'transparent';
      box.style.backgroundColor = showBg ? (stk.bg || 'rgba(255,255,255,0.92)') : 'transparent';

      const contentEl = document.createElement('div');
      contentEl.className = 'spe-textbox-content';
      contentEl.textContent = stk.text || 'Text';
      if (isEditing) {
        contentEl.contentEditable = 'true';
        contentEl.spellcheck = false;
      }
      box.appendChild(contentEl);

      // Illustrator-style 4 corner resize handles + top badge when selected
      if (isSelected) {
        ['nw', 'ne', 'sw', 'se'].forEach((dir) => {
          const handle = document.createElement('span');
          handle.className = `spe-resize-handle spe-resize-handle--${dir}`;
          handle.setAttribute('data-resize-dir', dir);
          handle.title = 'Drag corner to resize text';
          box.appendChild(handle);
        });
      }

      // Pointerdown for selecting, moving, or resizing
      box.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        const resizeHandle = e.target.closest('[data-resize-dir]');
        if (resizeHandle) {
          this._startCornerResize(e, stk, box, resizeHandle.getAttribute('data-resize-dir'));
          return;
        }

        if (this.editingStickerId === stk.id) {
          return;
        }

        const wasSelected = this.selectedStickerId === stk.id;
        this.selectedStickerId = stk.id;
        this._renderInspector();
        this._renderLayerList();
        this.textLayerEl.querySelectorAll('.spe-textbox').forEach((el) => {
          el.classList.toggle('is-selected', el === box);
        });
        if (!wasSelected) {
          this._renderTextBoxes();
          const newBox = this.textLayerEl.querySelector(`[data-sticker-id="${stk.id}"]`);
          if (newBox) {
            this._startBoxMove(e, stk, newBox);
          }
          return;
        }

        this._startBoxMove(e, stk, box);
      });

      // Double click to edit inline right on the artboard
      box.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        this.selectedStickerId = stk.id;
        this.editingStickerId = stk.id;
        this._renderTextBoxes();
        const activeContent = this.textLayerEl.querySelector(`[data-sticker-id="${stk.id}"] .spe-textbox-content`);
        if (activeContent) {
          activeContent.focus();
          const range = document.createRange();
          range.selectNodeContents(activeContent);
          const sel = window.getSelection();
          sel?.removeAllRanges();
          sel?.addRange(range);
        }
      });

      if (isEditing) {
        contentEl.addEventListener('input', () => {
          const newText = contentEl.innerText || ' ';
          if (this.textInput) {
            this.textInput.value = newText;
          }
          this.onUpdateText(this.pageIndex, stk.id, { text: newText }, false);
          this._renderLayerList();
        });
        contentEl.addEventListener('blur', () => {
          this.editingStickerId = null;
          this.refresh();
        });
      }

      this.textLayerEl.appendChild(box);
    });
  }

  _computeSnapPosition(rawX, rawY, boxWPct, boxHPct, activeStickerId, bypassSnap = false) {
    const clampedRawX = Math.max(0, Math.min(92, rawX));
    const clampedRawY = Math.max(0, Math.min(92, rawY));

    if (!this.snapEnabled || bypassSnap) {
      return {
        x: Math.round(clampedRawX),
        y: Math.round(clampedRawY),
        guides: []
      };
    }

    const SNAP_THRESHOLD = 2.0; // Percentage distance threshold for magnetic alignment
    const GRID_STEP = 2; // 2% grid step when not locked to a major guide
    const guides = [];

    const vTargets = [
      { pos: 50, label: 'Center X' },
      { pos: 8, label: 'Left Margin' },
      { pos: 92, label: 'Right Margin' },
      { pos: 33.33, label: '1/3 Grid' },
      { pos: 66.67, label: '2/3 Grid' },
      { pos: 25, label: '1/4 Grid' },
      { pos: 75, label: '3/4 Grid' }
    ];

    const hTargets = [
      { pos: 50, label: 'Center Y' },
      { pos: 6, label: 'Top Margin' },
      { pos: 94, label: 'Bottom Margin' },
      { pos: 33.33, label: '1/3 Grid' },
      { pos: 66.67, label: '2/3 Grid' },
      { pos: 25, label: '1/4 Grid' },
      { pos: 75, label: '3/4 Grid' }
    ];

    // Also include other text boxes on the same page as alignment targets
    const artboardRect = this.artboardEl?.getBoundingClientRect();
    if (artboardRect && artboardRect.width > 0 && artboardRect.height > 0 && this.textLayerEl) {
      this.textLayerEl.querySelectorAll('.spe-textbox').forEach((otherEl) => {
        const otherId = otherEl.getAttribute('data-sticker-id');
        if (!otherId || otherId === activeStickerId) { return; }
        const r = otherEl.getBoundingClientRect();
        const oLeft = ((r.left - artboardRect.left) / artboardRect.width) * 100;
        const oTop = ((r.top - artboardRect.top) / artboardRect.height) * 100;
        const oW = (r.width / artboardRect.width) * 100;
        const oH = (r.height / artboardRect.height) * 100;

        vTargets.push(
          { pos: oLeft, label: 'Align Left' },
          { pos: oLeft + oW / 2, label: 'Align Center' },
          { pos: oLeft + oW, label: 'Align Right' }
        );
        hTargets.push(
          { pos: oTop, label: 'Align Top' },
          { pos: oTop + oH / 2, label: 'Align Middle' },
          { pos: oTop + oH, label: 'Align Bottom' }
        );
      });
    }

    // Check X anchors: left edge, horizontal center, right edge
    const xAnchors = [
      { offset: 0 },
      { offset: boxWPct / 2 },
      { offset: boxWPct }
    ];
    let bestVMatch = null;
    for (const target of vTargets) {
      for (const anchor of xAnchors) {
        const candidateEdge = clampedRawX + anchor.offset;
        const dist = Math.abs(candidateEdge - target.pos);
        if (dist <= SNAP_THRESHOLD && (!bestVMatch || dist < bestVMatch.dist)) {
          bestVMatch = {
            dist,
            snappedX: Math.max(0, Math.min(92, target.pos - anchor.offset)),
            guidePos: target.pos,
            label: target.label
          };
        }
      }
    }

    let finalX;
    if (bestVMatch) {
      finalX = Math.round(bestVMatch.snappedX * 10) / 10;
      guides.push({ axis: 'v', pos: bestVMatch.guidePos, label: bestVMatch.label });
    } else {
      finalX = Math.round(clampedRawX / GRID_STEP) * GRID_STEP;
    }

    // Check Y anchors: top edge, vertical middle, bottom edge
    const yAnchors = [
      { offset: 0 },
      { offset: boxHPct / 2 },
      { offset: boxHPct }
    ];
    let bestHMatch = null;
    for (const target of hTargets) {
      for (const anchor of yAnchors) {
        const candidateEdge = clampedRawY + anchor.offset;
        const dist = Math.abs(candidateEdge - target.pos);
        if (dist <= SNAP_THRESHOLD && (!bestHMatch || dist < bestHMatch.dist)) {
          bestHMatch = {
            dist,
            snappedY: Math.max(0, Math.min(92, target.pos - anchor.offset)),
            guidePos: target.pos,
            label: target.label
          };
        }
      }
    }

    let finalY;
    if (bestHMatch) {
      finalY = Math.round(bestHMatch.snappedY * 10) / 10;
      guides.push({ axis: 'h', pos: bestHMatch.guidePos, label: bestHMatch.label });
    } else {
      finalY = Math.round(clampedRawY / GRID_STEP) * GRID_STEP;
    }

    return { x: finalX, y: finalY, guides };
  }

  _renderSmartGuides(guides = []) {
    if (!this.smartGuidesEl) { return; }
    if (!guides.length) {
      this.smartGuidesEl.replaceChildren();
      return;
    }

    const html = guides.map((g) => {
      if (g.axis === 'v') {
        return `
          <div class="spe-smart-guide-line spe-smart-guide-line--v" style="left: ${g.pos}%;">
            ${g.label ? `<span class="spe-smart-guide-badge">${g.label}</span>` : ''}
          </div>
        `;
      }
      return `
        <div class="spe-smart-guide-line spe-smart-guide-line--h" style="top: ${g.pos}%;">
          ${g.label ? `<span class="spe-smart-guide-badge">${g.label}</span>` : ''}
        </div>
      `;
    }).join('');

    this.smartGuidesEl.innerHTML = html;
  }

  _clearSmartGuides() {
    if (this.smartGuidesEl) {
      this.smartGuidesEl.replaceChildren();
    }
  }

  _startBoxMove(e, stk, boxEl) {
    e.preventDefault();
    const artboardRect = this.artboardEl.getBoundingClientRect();
    const boxRect = boxEl.getBoundingClientRect();
    const boxWPct = artboardRect.width > 0 ? (boxRect.width / artboardRect.width) * 100 : 20;
    const boxHPct = artboardRect.height > 0 ? (boxRect.height / artboardRect.height) * 100 : 10;

    const startX = e.clientX;
    const startY = e.clientY;
    const origX = stk.x;
    const origY = stk.y;
    let currentX = origX;
    let currentY = origY;
    let moved = false;

    boxEl.setPointerCapture?.(e.pointerId);
    boxEl.classList.add('is-dragging');

    const onMove = (moveEvt) => {
      const dx = moveEvt.clientX - startX;
      const dy = moveEvt.clientY - startY;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
        moved = true;
      }
      const rawX = origX + (dx / artboardRect.width) * 100;
      const rawY = origY + (dy / artboardRect.height) * 100;
      const snapResult = this._computeSnapPosition(
        rawX,
        rawY,
        boxWPct,
        boxHPct,
        stk.id,
        moveEvt.altKey || moveEvt.shiftKey
      );
      currentX = snapResult.x;
      currentY = snapResult.y;

      boxEl.style.left = `${currentX}%`;
      boxEl.style.top = `${currentY}%`;
      if (this.posReadout) {
        this.posReadout.textContent = `X: ${Math.round(currentX)}% · Y: ${Math.round(currentY)}%`;
      }
      this._renderSmartGuides(snapResult.guides);
    };

    const onUp = (upEvt) => {
      boxEl.releasePointerCapture?.(upEvt.pointerId);
      boxEl.classList.remove('is-dragging');
      this._clearSmartGuides();
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);

      if (moved) {
        this.onUpdateText(this.pageIndex, stk.id, { x: currentX, y: currentY }, true);
        this.refresh();
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }

  _startCornerResize(e, stk, boxEl, dir) {
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const origSize = stk.fontSize || 22;
    const artboardW = this.artboardEl.clientWidth || 360;
    const scaleRatio = artboardW / 360;
    const signX = dir.includes('e') ? 1 : -1;
    const signY = dir.includes('s') ? 1 : -1;

    boxEl.setPointerCapture?.(e.pointerId);

    const onMove = (moveEvt) => {
      const dx = (moveEvt.clientX - startX) * signX;
      const dy = (moveEvt.clientY - startY) * signY;
      const delta = (dx + dy) * 0.18;
      const nextSize = Math.max(10, Math.min(84, Math.round(origSize + delta)));
      boxEl.style.fontSize = `${Math.round(nextSize * scaleRatio)}px`;
      if (this.sizeInput) {
        this.sizeInput.value = String(nextSize);
      }
      if (this.sizeReadout) {
        this.sizeReadout.textContent = `${nextSize} px`;
      }
    };

    const onUp = (upEvt) => {
      boxEl.releasePointerCapture?.(upEvt.pointerId);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);

      const dx = (upEvt.clientX - startX) * signX;
      const dy = (upEvt.clientY - startY) * signY;
      const delta = (dx + dy) * 0.18;
      const finalSize = Math.max(10, Math.min(84, Math.round(origSize + delta)));
      this.onUpdateText(this.pageIndex, stk.id, { fontSize: finalSize }, true);
      this.refresh();
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }

  _renderInspector() {
    const stk = this._getSelectedSticker();
    if (!stk) {
      this.inspectorControlsEl?.classList.add('hidden');
      this.inspectorEmptyEl?.classList.remove('hidden');
      if (this.deleteSelectedBtn) {
        this.deleteSelectedBtn.disabled = true;
      }
      return;
    }

    this.inspectorControlsEl?.classList.remove('hidden');
    this.inspectorEmptyEl?.classList.add('hidden');
    if (this.deleteSelectedBtn) {
      this.deleteSelectedBtn.disabled = false;
    }

    if (this.textInput && document.activeElement !== this.textInput) {
      this.textInput.value = stk.text || '';
    }
    if (this.fontSelect) {
      this.fontSelect.value = stk.fontFamily || 'sans';
    }
    if (this.sizeInput) {
      this.sizeInput.value = String(stk.fontSize || 22);
    }
    if (this.sizeReadout) {
      this.sizeReadout.textContent = `${stk.fontSize || 22} px`;
    }
    if (this.posReadout) {
      this.posReadout.textContent = `X: ${Math.round(stk.x)}% · Y: ${Math.round(stk.y)}%`;
    }
    if (this.boldBtn) {
      this.boldBtn.classList.toggle('is-active', Boolean(stk.isBold));
    }
    if (this.colorInput && /^#[0-9a-fA-F]{6}$/.test(stk.color || '')) {
      this.colorInput.value = stk.color;
    }
    const bgEnabled = stk.bgEnabled !== false && stk.bg !== 'transparent';
    if (this.bgCheck) {
      this.bgCheck.checked = bgEnabled;
    }
    this.bgRow?.classList.toggle('opacity-40', !bgEnabled);

    this.container?.querySelectorAll('[data-spe-align]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.getAttribute('data-spe-align') === (stk.align || 'left'));
    });
  }

  _renderLayerList() {
    if (!this.layerListEl) { return; }
    const stickers = this._getPageStickers();
    if (this.layerCountEl) {
      this.layerCountEl.textContent = String(stickers.length);
    }

    if (stickers.length === 0) {
      this.layerListEl.innerHTML = '<div class="spe-layer-empty">No text layers on this page yet.</div>';
      return;
    }

    this.layerListEl.innerHTML = stickers.map((stk) => {
      const isSelected = stk.id === this.selectedStickerId;
      const preview = (stk.text || 'Text').replace(/\s+/g, ' ').slice(0, 28);
      return `
        <div class="spe-layer-item ${isSelected ? 'is-active' : ''}" data-spe-layer-id="${stk.id}">
          <span class="material-symbols-outlined icon-compact opacity-60">title</span>
          <span class="spe-layer-name">${preview}</span>
          <span class="spe-layer-meta">${stk.fontFamily || 'sans'} · ${stk.fontSize || 22}px</span>
          <button type="button" class="spe-layer-del" data-spe-layer-delete title="Remove text layer">
            <span class="material-symbols-outlined icon-compact">close</span>
          </button>
        </div>
      `;
    }).join('');
  }
}
