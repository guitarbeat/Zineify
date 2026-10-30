import mitt from 'mitt';
import { createIcons, FolderOpen, Upload } from 'lucide';
import {
  GRID_DIMENSION_MAX,
  GRID_DIMENSION_MIN,
  PAPER_SIZES,
  ZINE_TEMPLATES,
  resolvePaperSize
} from '../../utils/config.js';
import { debounce, parseBoundedInteger } from '../../utils/helpers.js';

import { SmartSheetConfig } from '../SmartSheetConfig.js';
import { ModalManager } from './ModalManager.js';
import { DragAndDropHandler } from './DragAndDropHandler.js';
import { LayoutRenderer } from './LayoutRenderer.js';
import { PAGE_CELL_TEMPLATE, createUploadedFileItem } from './Templates.js';

const DEFAULT_GRID_ROWS = 2;
const DEFAULT_GRID_COLS = 4;

const FOLD_STEPS = [
  { value: 0, status: 'Flat Sheet', helper: 'Drag to orbit · Scroll to zoom · Keys 1–6 jump to steps' },
  { value: 0.5, status: 'Creasing', helper: 'Step 2: Crease sheet in half and into quarters' },
  { value: 1, status: 'Folded Strip', helper: 'Step 3: Fold lengthwise (hotdog style)' },
  { value: 1.5, status: 'Center Slit', helper: 'Step 4: Cut center crease between inner panels' },
  { value: 2, status: 'Diamond Open', helper: 'Step 5: Push outer ends inward into a diamond' },
  { value: 3, status: 'Booklet', helper: 'Step 6: Wrap pages around into finished 8-page zine' }
];

export class UIManager {
  constructor() {
    this.emitter = mitt();
    this.elements = {};
    this.pageNumbersVisible = true;
    this.activePageIndex = null;
    this.selectedPageIndex = null;
    this.targetSlotIndex = null;
    this.canvasViewMode = 'print';
    this.guideToggles = {
      cut: true,
      fold: true,
      cropMarks: true,
      bleed: false,
      numbers: true,
      includeInExport: true,
      bakeCutMarks: true,
      bakeFoldGuides: true,
      bakeCropMarks: true
    };

    this.init();
  }

  init() {
    this.cacheElements();
    createIcons({ icons: { FolderOpen, Upload } });
    this.modal = new ModalManager(this.elements, this.emitter);
    this.dnd = new DragAndDropHandler(this.elements, this.emitter);
    this.renderer = new LayoutRenderer(this.elements.zineSheetsContainer, PAGE_CELL_TEMPLATE);

    this.initSmartSheetConfig();
    this.syncPaperSettings({ paperSize: 'letter', orientation: 'landscape' });
    this.setupEventListeners();
    this.syncResponsiveUI();

    const savedTheme = typeof window !== 'undefined' ? localStorage.getItem('zine-theme') : null;
    if (savedTheme) {
      document.documentElement.setAttribute('data-theme', savedTheme);
    }
    this._syncThemeIcon();

    const savedControls = localStorage.getItem('zine-page-controls');
    const showControls = savedControls !== 'false';
    if (this.elements.pageControlsCheckbox) {
      this.elements.pageControlsCheckbox.checked = showControls;
    }
    this._applyPageControlsVisibility(showControls);
  }

  initSmartSheetConfig() {
    const container = document.getElementById('smart-sheet-config-container');
    if (!container) { return; }

    let prevRows = DEFAULT_GRID_ROWS;
    let prevCols = DEFAULT_GRID_COLS;
    let prevPreset = 'mini-8';

    this.smartSheetConfig = new SmartSheetConfig(container, {
      initialRows: DEFAULT_GRID_ROWS,
      initialCols: DEFAULT_GRID_COLS,
      onChange: ({ rows, cols, layoutPresetId, paperSize, orientation, margin, customPaper }) => {
        if (Number.isFinite(rows) && Number.isFinite(cols)) {
          if (this.elements.gridRows) { this.elements.gridRows.value = rows; }
          if (this.elements.gridCols) { this.elements.gridCols.value = cols; }
          this.updateGridTotalBadge(rows, cols);
          if (rows !== prevRows || cols !== prevCols || layoutPresetId !== prevPreset) {
            prevRows = rows;
            prevCols = cols;
            prevPreset = layoutPresetId || 'custom';
            this.emitter.emit('gridSizeChanged', { rows, cols, layoutPresetId });
          }
        }
        this.emitter.emit('paperSizeChanged', { paperSize, customPaper });
        this.emitter.emit('orientationChanged', { orientation });
        this.emitter.emit('marginChanged', { margin });
      }
    });
  }

  on(event, handler) {
    this.emitter.on(event, handler);
  }

  off(event, handler) {
    this.emitter.off(event, handler);
  }

  setStatus(message, tone = 'info') {
    if (this.elements.uploadStatus) {
      this.elements.uploadStatus.textContent = message;
      this.elements.uploadStatus.dataset.tone = tone;
    }
  }

  updateUploadedFilesList(files) {
    if (!this.elements.uploadedFilesList) {
      return;
    }
    this.elements.uploadedFilesList.textContent = '';
    if (files.length === 0) {
      this.elements.uploadedFilesList.classList.add('hidden');
      return;
    }
    this.elements.uploadedFilesList.classList.remove('hidden');

    const title = document.createElement('p');
    title.className = 'rail-section-title';
    title.textContent = `Uploaded Files (${files.length})`;
    this.elements.uploadedFilesList.appendChild(title);

    const wrapper = document.createElement('div');
    wrapper.className = 'uploaded-files-stack';
    files.forEach((file, index) => {
      const item = createUploadedFileItem(file, () => this.emitter.emit('removeUploadedFile', index));
      wrapper.appendChild(item);
    });
    this.elements.uploadedFilesList.appendChild(wrapper);
  }

  updatePagePreview(index, url) {
    const cell = this._getPageCell(index);
    if (!cell) {
      return;
    }

    const img = cell.querySelector('.page-content-img');
    const placeholder = cell.querySelector('.page-placeholder');
    if (img) {
      img.src = url || '';
      img.classList.toggle('hidden', !url);
    }
    if (placeholder) {
      placeholder.classList.toggle('hidden', Boolean(url));
    }
    cell.classList.toggle('has-page', Boolean(url));
    const baseLabel = (cell.getAttribute('aria-label') || '').replace(/, (empty slot|has content)$/, '');
    if (baseLabel) {
      cell.setAttribute('aria-label', url ? `${baseLabel}, has content` : `${baseLabel}, empty slot`);
    }
  }

  setPageFlip(index, enabled) {
    const cell = this._getPageCell(index);
    if (!cell) { return; }
    cell.classList.toggle('is-flipped', Boolean(enabled));
    const deg = enabled ? 180 : 0;
    cell.style.setProperty('--page-image-rotation', `${deg}deg`);
    const rotBadge = cell.querySelector('.page-rotation-badge');
    if (rotBadge) {
      rotBadge.textContent = deg > 0 ? `${deg}°` : '';
      rotBadge.classList.toggle('hidden', deg === 0);
    }
  }

  setPageRotation(index, degrees = 0) {
    const cell = this._getPageCell(index);
    if (!cell) { return; }
    const norm = ((Number(degrees) || 0) % 360 + 360) % 360;
    cell.classList.toggle('is-flipped', norm === 180);
    cell.style.setProperty('--page-image-rotation', `${norm}deg`);
    const rotBadge = cell.querySelector('.page-rotation-badge');
    if (rotBadge) {
      rotBadge.textContent = norm > 0 ? `${norm}°` : '';
      rotBadge.classList.toggle('hidden', norm === 0);
    }
  }

  setPageZoom(index, enabled) {
    const cell = this._getPageCell(index);
    cell?.classList.toggle('page-zoomed', Boolean(enabled));
  }

  toggle3DModal(show) {
    this.modal.toggle3DModal(show);
  }

  setFoldProgressControl(value) {
    const parsedValue = typeof value === 'number' ? value : parseFloat(value || '0');
    const progress = Number.isFinite(parsedValue) ? parsedValue : 0;
    if (this.elements.foldSlider) {
      this.elements.foldSlider.value = progress;
    }
    this.syncFoldStepUi(progress);
  }

  syncFoldStepUi(progress) {
    const currentStep = FOLD_STEPS.reduce((closest, step) => (
      Math.abs(step.value - progress) < Math.abs(closest.value - progress) ? step : closest
    ), FOLD_STEPS[0]);

    if (this.elements.foldStatus) {
      this.elements.foldStatus.textContent = currentStep.status;
    }
    if (this.elements.foldHelper) {
      this.elements.foldHelper.textContent = currentStep.helper;
    }

    this.elements.foldStepButtons?.forEach((button) => {
      const isActive = Number(button.dataset.foldValue) === currentStep.value;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', String(isActive));
    });
  }

  toggleMobileRail(show) {
    document.body.classList.toggle('mobile-rail-open', Boolean(show));
    const rail = document.getElementById('control-rail');
    const overlay = document.getElementById('mobile-rail-overlay');
    if (rail) {
      rail.classList.toggle('is-open', Boolean(show));
      rail.setAttribute('aria-hidden', !show);
    }
    if (overlay) {
      if (show) {
        overlay.classList.remove('hidden');
      } else {
        overlay.classList.add('hidden');
      }
      overlay.setAttribute('aria-hidden', !show);
    }
  }

  triggerFileUpload(slotIndex = null) {
    this.targetSlotIndex = Number.isFinite(slotIndex) ? slotIndex : null;
    this.elements.pdfUpload?.click();
  }

  handleIncomingFiles(payload, explicitSlotIndex = null) {
    const isPayloadObj = payload && !Array.isArray(payload) && Array.isArray(payload.files);
    const files = isPayloadObj ? payload.files : payload;
    const baseSlotIndex = Number.isFinite(explicitSlotIndex)
      ? explicitSlotIndex
      : (isPayloadObj && Number.isFinite(payload.targetSlotIndex)
        ? payload.targetSlotIndex
        : this.targetSlotIndex);

    this.targetSlotIndex = null;
    if (!files?.length) { return; }
    files.forEach((file, offset) => {
      const slotIndex = Number.isFinite(baseSlotIndex) ? baseSlotIndex + offset : null;
      this.emitter.emit('fileSelected', { file, targetSlotIndex: slotIndex });
    });
  }

  selectPageCell(index) {
    const parsed = Number.isFinite(index) ? index : null;
    this.selectedPageIndex = parsed;
    const cells = this.elements.zineSheetsContainer?.querySelectorAll('.page-cell');
    cells?.forEach((cell) => {
      const idx = parseInt(cell.getAttribute('data-page-index'), 10);
      const isSelected = parsed !== null && idx === parsed;
      cell.classList.toggle('active', isSelected);
      cell.classList.toggle('is-selected', isSelected);
    });
  }

  setCanvasViewMode(mode = 'print') {
    const nextMode = mode === 'reading' ? 'reading' : 'print';
    this.canvasViewMode = nextMode;
    this.elements.previewArea?.classList.toggle('reading-view-mode', nextMode === 'reading');
    const buttons = this.elements.canvasViewModeToggle?.querySelectorAll('[data-view-mode]');
    buttons?.forEach((btn) => {
      const isActive = btn.dataset.viewMode === nextMode;
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-pressed', String(isActive));
    });
  }

  syncFormatPresetUi(layoutPresetId = 'mini-8', rows = 2, cols = 4) {
    if (this.elements.gridRows) {
      this.elements.gridRows.value = rows;
    }
    if (this.elements.gridCols) {
      this.elements.gridCols.value = cols;
    }
    this.updateGridTotalBadge(rows, cols);
    if (this.smartSheetConfig) {
      const current = this.smartSheetConfig.getState();
      const resolvedPreset = (rows === 2 && cols === 4)
        ? 'mini-8'
        : (rows === 4 && cols === 4)
          ? 'double-16'
          : (rows === 2 && cols === 2)
            ? 'quarter-4'
            : (layoutPresetId || 'custom');
      if (current.rows !== rows || current.cols !== cols || current.layoutPresetId !== resolvedPreset) {
        Object.assign(this.smartSheetConfig.state, {
          rows,
          cols,
          layoutPresetId: resolvedPreset
        });
        this.smartSheetConfig.render();
      }
    }
  }

  updateWorkspaceState({
    placedCount = 0,
    realFilledCount = placedCount,
    nonEmptySlotCount = placedCount,
    totalSlots = 8,
    rows = 2,
    cols = 4,
    layoutPresetId = 'mini-8',
    paperSize = 'letter',
    canUndo = false,
    canRedo = false
  } = {}) {
    const hasAnySlotContent = nonEmptySlotCount > 0 || placedCount > 0;

    if (this.elements.previewArea) {
      this.elements.previewArea.classList.toggle('is-empty', !hasAnySlotContent);
    }

    if (this.elements.previewCountChip) {
      const filled = Number.isFinite(realFilledCount) ? realFilledCount : placedCount;
      const cap = Number.isFinite(totalSlots) && totalSlots > 0 ? totalSlots : rows * cols;
      this.elements.previewCountChip.textContent = `${filled}/${cap} pages`;
      const uploadSummary = document.getElementById('upload-summary-accessory');
      if (uploadSummary) {
        uploadSummary.textContent = `${filled}/${cap} pages`;
      }
      const settingsSummary = document.getElementById('settings-summary-accessory');
      if (settingsSummary) {
        const paperLabel = paperSize ? (paperSize.charAt(0).toUpperCase() + paperSize.slice(1)) : 'Letter';
        settingsSummary.textContent = `${paperLabel} • 8-Page Mini`;
      }
    }

    if (this.elements.clearAllBtn) {
      this.elements.clearAllBtn.style.display = hasAnySlotContent ? '' : 'none';
      this.elements.clearAllBtn.classList.toggle('is-hidden', !hasAnySlotContent);
    }
    if (this.elements.exportPdfBtn) {
      this.elements.exportPdfBtn.disabled = !hasAnySlotContent;
    }
    if (this.elements.printBtn) {
      this.elements.printBtn.disabled = !hasAnySlotContent;
    }
    if (this.elements.view3dBtn) {
      this.elements.view3dBtn.disabled = !hasAnySlotContent;
    }
    if (this.elements.undoBtn) {
      this.elements.undoBtn.disabled = !canUndo;
    }
    if (this.elements.redoBtn) {
      this.elements.redoBtn.disabled = !canRedo;
    }

    this.syncFormatPresetUi(layoutPresetId, rows, cols);
  }

  applySheetGuideAttributes(guideToggles = this.guideToggles) {
    this.guideToggles = { ...this.guideToggles, ...guideToggles };
    const sheets = this.elements.zineSheetsContainer?.querySelectorAll('.print-sheet');
    sheets?.forEach((sheet) => {
      sheet.setAttribute('data-guide-cut', String(this.guideToggles.cut !== false));
      sheet.setAttribute('data-guide-fold', String(this.guideToggles.fold !== false));
      sheet.setAttribute('data-guide-crop', String(this.guideToggles.cropMarks !== false));
      sheet.setAttribute('data-guide-bleed', String(Boolean(this.guideToggles.bleed)));
    });
  }

  renderPaperSizeOptions() {
    if (!this.elements.paperSizeSelect) {
      return;
    }

    this.elements.paperSizeSelect.textContent = '';
    Object.entries(PAPER_SIZES).forEach(([key, paper]) => {
      const option = document.createElement('option');
      option.value = key;
      option.textContent = paper.label;
      this.elements.paperSizeSelect.appendChild(option);
    });
  }

  bindAppController(controller) {
    this.controller = controller;
  }

  syncPaperSettings({ paperSize, orientation } = {}) {
    if (paperSize) {
      if (this.elements.paperSizeSelect?.tagName === 'SELECT') {
        this.elements.paperSizeSelect.value = paperSize;
      }
      if (this.smartSheetConfig) {
        this.smartSheetConfig.setState({ paperSize });
      }
    }

    if (orientation) {
      if (this.elements.orientationToggle?.classList?.contains('orientation-seg')) {
        this.elements.orientationToggle.querySelectorAll('.orientation-seg-btn').forEach((btn) => {
          const isActive = btn.dataset.value === orientation;
          btn.classList.toggle('is-active', isActive);
          btn.setAttribute('aria-pressed', String(isActive));
        });
      }
      if (this.smartSheetConfig) {
        this.smartSheetConfig.setState({ orientation });
      }
    }
  }

  _syncOrientationVisibility(rows, cols) {
    if (this.smartSheetConfig) { return; }
    const isMini8 = rows === 2 && cols === 4;
    const wrapper = this.elements.orientationToggle?.closest('.workspace-config-field');
    if (wrapper) {
      wrapper.style.display = isMini8 ? 'none' : '';
    }
    const labelEl = document.getElementById('orientation-label');
    if (labelEl && labelEl.closest('.workspace-config-field')) {
      labelEl.closest('.workspace-config-field').style.display = isMini8 ? 'none' : '';
    }
  }

  normalizeGridInputs() {
    const rows = parseBoundedInteger(this.elements.gridRows?.value, { min: GRID_DIMENSION_MIN, max: GRID_DIMENSION_MAX, fallback: DEFAULT_GRID_ROWS });
    const cols = parseBoundedInteger(this.elements.gridCols?.value, { min: GRID_DIMENSION_MIN, max: GRID_DIMENSION_MAX, fallback: DEFAULT_GRID_COLS });
    if (this.elements.gridRows) { this.elements.gridRows.value = rows; }
    if (this.elements.gridCols) { this.elements.gridCols.value = cols; }
    return { rows, cols };
  }

  updateGridTotalBadge(rows, cols) {
    if (this.elements.gridTotal) {
      this.elements.gridTotal.textContent = `${rows * cols} slots`;
    }
  }

  syncResponsiveUI() {
    const isMobile = window.matchMedia('(max-width: 1023px)').matches;
    this.elements.previewArea?.classList.toggle('is-mobile', isMobile);
    if (!isMobile && document.body.classList.contains('mobile-rail-open')) {
      this.toggleMobileRail(false);
    }
  }

  _getPageCell(index) {
    if (!this.pageCellCache) {
      const cells = this.elements.zineSheetsContainer?.querySelectorAll('.page-cell');
      if (cells && cells.length > 0) {
        this.pageCellCache = new Map();
        cells.forEach((cell) => {
          const idx = parseInt(cell.getAttribute('data-page-index'), 10);
          if (!isNaN(idx)) {
            this.pageCellCache.set(idx, cell);
          }
        });
      } else {
        return this.elements.zineSheetsContainer?.querySelector(`[data-page-index="${index}"]`) || null;
      }
    }
    return this.pageCellCache?.get(parseInt(index, 10)) || null;
  }

  getPaperDimensions(paperSizeKey, orientation, customPaper) {
    const paper = resolvePaperSize(paperSizeKey, customPaper);
    const landscape = orientation === 'landscape';
    return landscape
      ? { width: Math.max(paper.width, paper.height), height: Math.min(paper.width, paper.height) }
      : { width: Math.min(paper.width, paper.height), height: Math.max(paper.width, paper.height) };
  }

  _applyPageControlsVisibility(show) {
    this.elements.previewArea?.classList.toggle('hide-page-controls', !show);
    localStorage.setItem('zine-page-controls', String(show));
  }

  cacheElements() {
    const $ = (selector) => document.querySelector(selector);

    this.elements = {
      workspaceMain: $('#workspace-main'),
      unifiedDropZone: $('#unified-drop-zone'),
      uploadZone: $('#upload-zone'),
      browseFilesBtn: $('#browse-files-btn'),
      uploadStatus: $('#upload-status'),
      uploadedFilesList: $('#uploaded-files-list'),
      previewArea: $('#preview-area'),
      previewCountChip: $('#preview-count-chip'),
      zineSheetsContainer: $('#zine-sheets-container'),
      paperSizeSelect: $('#paper-size-select'),
      orientationToggle: $('#orientation-toggle'),
      marginInput: $('#margin-input'),
      pageNumbersCheckbox: $('#show-page-numbers'),
      pageControlsCheckbox: $('#show-page-controls'),
      toggleCutMarks: $('#toggle-cut-marks'),
      resetLayoutBtn: $('#reset-layout-btn'),
      gridRows: $('#grid-rows'),
      gridCols: $('#grid-cols'),
      gridTotal: $('#grid-total'),
      openRailSheetBtn: $('#open-rail-sheet-btn'),
      closeRailSheetBtn: $('#close-rail-sheet-btn'),
      mobileRailOverlay: $('#mobile-rail-overlay'),
      commandDeckContainer: $('#command-deck'),
      pdfUpload: $('#pdf-upload'),
      progressContainer: $('#progress-container'),
      progressBarWrap: $('#progress-bar-wrap'),
      progressFill: $('#progress-fill'),
      progressText: $('#progress-text'),
      progressSubtext: $('#progress-subtext'),
      zine3dModal: $('#zine-3d-modal'),
      zine3dContainer: $('#zine-3d-container'),
      close3dBtn: $('#close-3d-btn'),
      foldSlider: $('#fold-slider'),
      foldStatus: $('#fold-status'),
      foldHelper: $('#fold-helper'),
      foldStepButtons: document.querySelectorAll('.fold-step-btn'),
      pagePickerGrid: $('#page-picker-grid'),
      pagePickerCount: $('#page-picker-count'),
      pagePickerClose: $('#page-picker-close'),
      pagePickerModal: $('#page-picker-modal'),
      pagePickerBackdrop: $('#page-picker-backdrop'),
      pagePickerCancel: $('#page-picker-cancel'),
      cardZine: $('#card-zine'),
      foldViewerCard: $('#card-fold-viewer'),
      foldBookletCard: $('#card-fold-booklet'),
      foldGuideCard: $('#card-fold-guide'),
      foldTabButtons: document.querySelectorAll('[data-fold-tab]'),
      foldTabPanes: document.querySelectorAll('[data-fold-pane]'),
      pagePickerConfirm: $('#page-picker-confirm'),
      pagePickerSubtitle: $('#page-picker-subtitle'),
      pagePickerSelectFirst: $('#page-picker-select-first'),
      pagePickerSelectLast: $('#page-picker-select-last'),
      pagePickerSelectEven: $('#page-picker-select-even'),
      pagePickerSelectOdd: $('#page-picker-select-odd'),
      pagePickerClear: $('#page-picker-clear'),
      bookletPreviewContainer: $('#booklet-preview-container'),
      bookletPrevBtn: $('#booklet-prev-btn'),
      bookletNextBtn: $('#booklet-next-btn'),
      bookletStatus: $('#booklet-status'),
      clearAllBtn: $('#clear-all-btn'),
      exportPdfBtn: $('#exportPdfBtn'),
      printBtn: $('#print-btn'),
      view3dBtn: $('#view3dBtn'),
      undoBtn: $('#undo-btn'),
      redoBtn: $('#redo-btn'),
      themeToggleBtn: $('#theme-toggle'),
      themeIcon: $('#theme-icon'),
      loadSampleZineBtn: $('#load-sample-zine-btn'),
      canvasLoadSampleBtn: $('#canvas-load-sample-btn'),
      addBlankPageBtn: $('#add-blank-page-btn'),
      fillEmptySlotsBtn: $('#fill-empty-slots-btn'),
      canvasViewModeToggle: $('#canvas-view-mode-toggle'),
      emptySheetBanner: $('#empty-sheet-banner'),
      stageTabSheet: $('#stage-tab-sheet'),
      stageTabFold: $('#stage-tab-fold')
    };
  }

  setupEventListeners() {
    this._setupPaperAndGridListeners();
    this._setupActionListeners();
    this._setupUploadListeners();
    this._setupRailAndFoldListeners();
    this._setupDisplayListeners();
    this._setupWindowListeners();
  }

  _syncDisplaySummaryAccessory() {
    const summaryEl = document.getElementById('display-summary-accessory');
    if (!summaryEl) { return; }
    const count = [
      this.elements.pageNumbersCheckbox?.checked !== false,
      this.elements.pageControlsCheckbox?.checked !== false,
      this.elements.toggleCutMarks?.checked !== false
    ].filter(Boolean).length;
    summaryEl.textContent = `${count}/3 guides`;
  }

  _setupDisplayListeners() {
    this.elements.toggleCutMarks?.addEventListener('change', (e) => {
      const checked = e.target.checked;
      this.guideToggles.cut = checked;
      this.guideToggles.fold = checked;
      this.guideToggles.cropMarks = checked;
      this.guideToggles.bakeCutMarks = checked;
      this.guideToggles.bakeFoldGuides = checked;
      this.guideToggles.bakeCropMarks = checked;
      this.applySheetGuideAttributes(this.guideToggles);
      this._syncDisplaySummaryAccessory();
      this.emitter.emit('guideToggleChanged', { key: 'cut', enabled: checked });
      this.emitter.emit('guideToggleChanged', { key: 'fold', enabled: checked });
    });

    this.elements.pageNumbersCheckbox?.addEventListener('change', () => {
      this._syncDisplaySummaryAccessory();
    });

    this.elements.pageControlsCheckbox?.addEventListener('change', () => {
      this._syncDisplaySummaryAccessory();
    });

    this.elements.resetLayoutBtn?.addEventListener('click', () => {
      if (typeof window !== 'undefined' && typeof window.__resetPanelLayout === 'function') {
        window.__resetPanelLayout();
      }
    });
  }

  _setupPaperAndGridListeners() {
    let lastGridState = { rows: DEFAULT_GRID_ROWS, cols: DEFAULT_GRID_COLS };
    const debouncedGridChange = debounce(() => {
      const { rows, cols } = this.normalizeGridInputs();

      this.updateGridTotalBadge(rows, cols);
      this._syncOrientationVisibility(rows, cols);

      if (lastGridState.rows !== rows || lastGridState.cols !== cols) {
        lastGridState = { rows, cols };
        this.emitter.emit('gridSizeChanged', { rows, cols });
      }
    }, 200);

    this.elements.gridRows?.addEventListener('input', debouncedGridChange);
    this.elements.gridCols?.addEventListener('input', debouncedGridChange);
    this.elements.gridRows?.addEventListener('change', debouncedGridChange);
    this.elements.gridCols?.addEventListener('change', debouncedGridChange);

    if (!this.smartSheetConfig) {
      this.elements.paperSizeSelect?.addEventListener('change', (event) => {
        this.emitter.emit('paperSizeChanged', { paperSize: event.target.value });
      });

      const orientationSegButtons = this.elements.orientationToggle?.querySelectorAll('.orientation-seg-btn');
      orientationSegButtons?.forEach((btn) => {
        btn.addEventListener('click', () => {
          const value = btn.dataset.value;
          orientationSegButtons.forEach((b) => {
            b.classList.toggle('is-active', b === btn);
            b.setAttribute('aria-pressed', String(b === btn));
          });
          this.emitter.emit('orientationChanged', { orientation: value });
        });
      });

      this.elements.marginInput?.closest('.stepper')?.querySelectorAll('.stepper-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const min = parseInt(this.elements.marginInput.min, 10) || 0;
          const max = parseInt(this.elements.marginInput.max, 10) || 25;
          const delta = parseInt(btn.dataset.delta, 10);
          const next = Math.min(max, Math.max(min, parseInt(this.elements.marginInput.value, 10) + delta));
          this.elements.marginInput.value = next;
          this.emitter.emit('marginChanged', { margin: next });
        });
      });

      this.elements.marginInput?.addEventListener('change', (e) => {
        const val = Math.min(25, Math.max(0, parseInt(e.target.value, 10) || 0));
        this.elements.marginInput.value = val;
        this.emitter.emit('marginChanged', { margin: val });
      });
    }
  }

  _setupActionListeners() {
    this.elements.pageNumbersCheckbox?.addEventListener('change', (event) => {
      this.pageNumbersVisible = event.target.checked;
      this.emitter.emit('pageNumbersToggled', this.pageNumbersVisible);
    });

    this.elements.pageControlsCheckbox?.addEventListener('change', (event) => {
      this._applyPageControlsVisibility(event.target.checked);
    });

    this.elements.exportPdfBtn?.addEventListener('click', () => this.emitter.emit('export'));
    this.elements.printBtn?.addEventListener('click', () => this.emitter.emit('print'));
    this.elements.view3dBtn?.addEventListener('click', () => {
      if (this.isFoldPreviewOpen()) {
        this.toggle3DModal(false);
      } else {
        this.emitter.emit('view3d');
      }
    });
    this.elements.close3dBtn?.addEventListener('click', () => this.toggle3DModal(false));
    this.elements.stageTabSheet?.addEventListener('click', () => this.toggle3DModal(false));
    this.elements.stageTabFold?.addEventListener('click', () => {
      if (!this.isFoldPreviewOpen()) {
        this.emitter.emit('view3d');
      }
    });
    this.elements.clearAllBtn?.addEventListener('click', () => this.emitter.emit('clearAll'));
    this.elements.undoBtn?.addEventListener('click', () => this.emitter.emit('undo'));
    this.elements.redoBtn?.addEventListener('click', () => this.emitter.emit('redo'));
    this.elements.themeToggleBtn?.addEventListener('click', () => this.toggleTheme());

    this.elements.loadSampleZineBtn?.addEventListener('click', () => {
      this.emitter.emit('loadSampleZineRequested');
    });
    this.elements.canvasLoadSampleBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.emitter.emit('loadSampleZineRequested');
    });
    this.elements.addBlankPageBtn?.addEventListener('click', () => {
      this.emitter.emit('addSingleBlankPageRequested');
    });
    this.elements.fillEmptySlotsBtn?.addEventListener('click', () => {
      this.emitter.emit('fillBlankSlotsRequested');
    });

    this.elements.canvasViewModeToggle?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-view-mode]');
      if (btn) {
        this.setCanvasViewMode(btn.dataset.viewMode);
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) {
        return;
      }
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) {
        return;
      }
      const focusedCell = document.activeElement?.closest?.('.page-cell');
      const activeIdx = focusedCell
        ? parseInt(focusedCell.getAttribute('data-page-index'), 10)
        : this.selectedPageIndex;

      if (!Number.isFinite(activeIdx) || activeIdx === null) {
        return;
      }

      const cell = this._getPageCell(activeIdx);
      const hasPage = cell?.classList.contains('has-page');

      if (e.key === 'Escape') {
        this.selectPageCell(null);
        return;
      }
      if (!hasPage) {
        return;
      }

      const key = e.key.toLowerCase();
      if (key === 'r') {
        e.preventDefault();
        this.emitter.emit('pageFlipped', activeIdx);
      } else if (key === 't') {
        e.preventDefault();
        this.emitter.emit('pageRotated', activeIdx);
      } else if (key === 'c') {
        e.preventDefault();
        this.emitter.emit('pageCropToggled', activeIdx);
      } else if (key === 'd') {
        e.preventDefault();
        this.emitter.emit('pageDuplicated', activeIdx);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        this.emitter.emit('pageRemoved', activeIdx);
      }
    });
  }

  _setupUploadListeners() {
    this.elements.uploadZone?.addEventListener('click', () => this.triggerFileUpload(null));
    this.elements.browseFilesBtn?.addEventListener('click', () => this.triggerFileUpload(null));
    this.elements.unifiedDropZone?.addEventListener('click', (event) => {
      if (event.target.closest('.page-cell') || event.target.closest('button')) {
        return;
      }
      this.selectPageCell(null);
    });
    this.elements.uploadZone?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        this.triggerFileUpload(null);
      }
    });

    this.dnd.setupEventListeners();
    this.emitter.on('filesDropped', (payload) => this.handleIncomingFiles(payload));

    this.elements.pdfUpload?.addEventListener('change', (event) => {
      const files = Array.from(event.target.files || []);
      const slotIdx = this.targetSlotIndex;
      this.handleIncomingFiles(files, slotIdx);
      event.target.value = '';
    });
  }

  _setupRailAndFoldListeners() {
    this.elements.openRailSheetBtn?.addEventListener('click', () => this.toggleMobileRail(true));
    this.elements.closeRailSheetBtn?.addEventListener('click', () => this.toggleMobileRail(false));
    this.elements.mobileRailOverlay?.addEventListener('click', () => this.toggleMobileRail(false));

    this.elements.foldSlider?.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value || '0');
      this.setFoldProgressControl(value);
      this.emitter.emit('foldProgress', value);
    });

    const foldStepButtonMap = new Map();
    this.elements.foldStepButtons?.forEach((button) => {
      if (button.dataset.stepIndex) {
        foldStepButtonMap.set(button.dataset.stepIndex, button);
      }
      button.setAttribute('aria-pressed', 'false');
      button.addEventListener('click', () => {
        const value = parseFloat(button.dataset.foldValue || '0');
        this.setFoldProgressControl(value);
        this.emitter.emit('foldProgress', value);
      });
    });

    document.addEventListener('keydown', (event) => {
      if (!this.isFoldPreviewOpen() || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
        return;
      }

      const stepButton = foldStepButtonMap.get(event.key);
      if (!stepButton) {
        return;
      }

      event.preventDefault();
      stepButton.click();
    });

    this.elements.foldTabButtons?.forEach((tabBtn) => {
      tabBtn.addEventListener('click', () => {
        this.setActiveFoldTab(tabBtn.dataset.foldTab);
      });
    });
  }

  setActiveFoldTab(mode = '3d') {
    const activeMode = ['3d', 'booklet', 'guide'].includes(mode) ? mode : '3d';
    this.elements.foldTabButtons?.forEach((btn) => {
      const isMatch = btn.dataset.foldTab === activeMode;
      btn.classList.toggle('is-active', isMatch);
      btn.setAttribute('aria-selected', String(isMatch));
    });

    this.elements.foldTabPanes?.forEach((pane) => {
      const isMatch = pane.dataset.foldPane === activeMode;
      pane.classList.toggle('is-active', isMatch);
      pane.classList.toggle('hidden', !isMatch);
    });

    if (this.elements.foldStatus) {
      this.elements.foldStatus.classList.toggle('hidden', activeMode !== '3d');
    }
    if (this.elements.bookletStatus) {
      this.elements.bookletStatus.classList.toggle('hidden', activeMode !== 'booklet');
    }

    this.emitter.emit('foldInspectorModeChanged', activeMode);
  }

  _setupWindowListeners() {
    window.addEventListener('resize', () => this.syncResponsiveUI());
  }

  toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('zine-theme', newTheme);
    this._syncThemeIcon();
  }

  _syncThemeIcon() {
    if (this.elements.themeIcon) {
      const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
      this.elements.themeIcon.textContent = currentTheme === 'light' ? 'dark_mode' : 'light_mode';
    }
  }

  isFoldPreviewOpen() {
    const modal = this.elements.zine3dModal || document.getElementById('zine-3d-modal');
    return Boolean(modal && !modal.classList.contains('hidden'));
  }

  generateLayout(numPages, templateType, paperSettings = {}) {
    this.pageCellCache = null;

    const template = typeof templateType === 'string'
      ? ZINE_TEMPLATES[templateType || 'mini-8']
      : (templateType || ZINE_TEMPLATES['mini-8']);

    const noop = () => {};
    const handlers = {
      onDragStart: noop,
      onDragOver: noop,
      onDragLeave: noop,
      onDrop: noop,
      onDragEnd: noop,
      onClick: (_, index) => {
        const cell = this._getPageCell(index);
        const hasPage = cell?.classList.contains('has-page');
        if (hasPage) {
          this.selectPageCell(this.selectedPageIndex === index ? null : index);
        } else {
          this.selectPageCell(index);
          this.triggerFileUpload(index);
        }
      },
      onReplace: (index) => {
        this.selectPageCell(index);
        this.triggerFileUpload(index);
      },
      onRotate: (index) => {
        this.selectPageCell(index);
        this.emitter.emit('pageRotated', index);
      },
      onFlip: (index) => {
        this.selectPageCell(index);
        this.emitter.emit('pageFlipped', index);
      },
      onCrop: (index) => {
        this.selectPageCell(index);
        this.emitter.emit('pageCropToggled', index);
      },
      onDuplicate: (index) => {
        this.selectPageCell(index);
        this.emitter.emit('pageDuplicated', index);
      },
      onRemove: (index) => {
        if (this.selectedPageIndex === index) {
          this.selectedPageIndex = null;
        }
        this.emitter.emit('pageRemoved', index);
      }
    };

    const dimensions = this.getPaperDimensions(
      paperSettings.paperSize || 'letter',
      paperSettings.orientation || 'landscape',
      paperSettings.customPaper
    );
    dimensions.margin = paperSettings.margin || 0;
    dimensions.paperSize = paperSettings.paperSize || 'letter';
    dimensions.orientation = paperSettings.orientation || 'landscape';

    this.dnd.destroySortables();

    this.renderer.render(
      numPages,
      template,
      {
        pageNumbersVisible: this.pageNumbersVisible,
        pageImages: paperSettings.pageImages,
        pageFlips: paperSettings.pageFlips,
        pageRotations: paperSettings.pageRotations,
        pageZooms: paperSettings.pageZooms,
        guideToggles: paperSettings.guideToggles || this.guideToggles
      },
      handlers,
      dimensions
    );

    if (this.selectedPageIndex !== null) {
      this.selectPageCell(this.selectedPageIndex);
    }

    this.elements.zineSheetsContainer.querySelectorAll('.zine-grid').forEach((grid) => {
      this.dnd.initSortable(grid);
    });
  }
}
