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
  {
    value: 0,
    status: 'Flat',
    helper: 'Start with the imposed sheet face up. Red marks the center slit; gray marks the crease grid.'
  },
  {
    value: 0.5,
    status: 'Creasing',
    helper: 'Crease the sheet across the short and long axes, then reopen it so every panel has a hinge.'
  },
  {
    value: 1,
    status: 'Folded Strip',
    helper: 'Fold the sheet lengthwise into a strip with the page artwork facing outward.'
  },
  {
    value: 1.5,
    status: 'Center Cut',
    helper: 'Cut only the center slit, stopping at the quarter folds. The red guide shows the cut span.'
  },
  {
    value: 2,
    status: 'Diamond Open',
    helper: 'Push the short ends together so the slit opens into a diamond and the page stacks swing inward.'
  },
  {
    value: 3,
    status: 'Booklet',
    helper: 'Press the panels into a booklet stack with the cover outside, then page through the reading preview.'
  }
];

export class UIManager {
  constructor() {
    this.emitter = mitt();
    this.elements = {};
    this.pageNumbersVisible = true;
    this.activePageIndex = null;

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
    if (!container) {return;}

    let lastGridState = { rows: DEFAULT_GRID_ROWS, cols: DEFAULT_GRID_COLS };

    this.smartSheetConfig = new SmartSheetConfig(container, {
      initialRows: DEFAULT_GRID_ROWS,
      initialCols: DEFAULT_GRID_COLS,
      onChange: ({ rows, cols, layoutPresetId, paperSize, orientation, margin, customPaper, _totalSlots }) => {
        if (this.elements.gridRows) {this.elements.gridRows.value = rows;}
        if (this.elements.gridCols) {this.elements.gridCols.value = cols;}
        this.updateGridTotalBadge(rows, cols);
        this._syncOrientationVisibility(rows, cols);

        // Only emit gridSizeChanged when grid dimensions actually changed
        if (lastGridState.rows !== rows || lastGridState.cols !== cols) {
          lastGridState = { rows, cols };
          this.emitter.emit('gridSizeChanged', { rows, cols });
        }

        this.emitter.emit('layoutPresetChanged', { layoutPresetId, rows, cols });
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
    const wrapper = document.createElement('div');
    wrapper.className = 'base-panel';
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
      placeholder.classList.toggle('hidden', !!url);
    }
    cell.classList.toggle('has-page', !!url);
    const baseLabel = (cell.getAttribute('aria-label') || '').replace(/, (empty slot|has content)$/, '');
    if (baseLabel) {
      cell.setAttribute('aria-label', url ? `${baseLabel}, has content` : `${baseLabel}, empty slot`);
    }
  }

  setPageFlip(index, enabled) {
    const cell = this._getPageCell(index);
    cell?.classList.toggle('is-flipped', !!enabled);
  }

  setPageZoom(index, enabled) {
    const cell = this._getPageCell(index);
    cell?.classList.toggle('page-zoomed', !!enabled);
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
    document.body.classList.toggle('mobile-rail-open', !!show);
    const rail = document.getElementById('control-rail');
    const overlay = document.getElementById('mobile-rail-overlay');
    if (rail) {
      rail.classList.toggle('is-open', !!show);
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

  triggerFileUpload() {
    this.elements.pdfUpload?.click();
  }

  handleIncomingFiles(files) {
    if (!files?.length) { return; }
    files.forEach((file) => this.emitter.emit('fileSelected', file));
  }

  updateWorkspaceState({ placedCount = 0 } = {}) {
    const hasPagesLoaded = placedCount > 0;
    if (this.elements.clearAllBtn) {
      this.elements.clearAllBtn.style.display = hasPagesLoaded ? '' : 'none';
    }
    if (this.elements.exportPdfBtn) {
      this.elements.exportPdfBtn.disabled = !hasPagesLoaded;
    }
    if (this.elements.view3dBtn) {
      this.elements.view3dBtn.disabled = !hasPagesLoaded;
    }
    if (this.elements.headerExportBtn) {
      this.elements.headerExportBtn.disabled = !hasPagesLoaded;
    }
    if (this.elements.headerPreviewBtn) {
      this.elements.headerPreviewBtn.disabled = !hasPagesLoaded;
    }
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
    if (this.smartSheetConfig) {return;}
    const isMini8 = rows === 2 && cols === 4;
    const wrapper = this.elements.orientationToggle?.closest('.workspace-config-field');
    if (wrapper) {
      wrapper.style.display = isMini8 ? 'none' : '';
    }
    const labelEl = document.getElementById('orientation-label');
    if (labelEl) {
      labelEl.closest('.workspace-config-field') && (labelEl.closest('.workspace-config-field').style.display = isMini8 ? 'none' : '');
    }
  }

  normalizeGridInputs() {
    if (this.smartSheetConfig) {
      const state = this.smartSheetConfig.getState();
      return { rows: state.rows, cols: state.cols };
    }
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
    // Close mobile rail when resizing to desktop
    if (!isMobile && document.body.classList.contains('mobile-rail-open')) {
      this.toggleMobileRail(false);
    }
  }

  _getPageCell(index) {
    if (!this.pageCellCache) {
      const cells = this.elements.zineSheetsContainer?.querySelectorAll('.page-cell');
      if (cells && cells.length > 0) {
        this.pageCellCache = new Map();
        cells.forEach(cell => {
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
      ? { width: paper.height, height: paper.width }
      : { width: paper.width, height: paper.height };
  }

  _applyPageControlsVisibility(show) {
    this.elements.previewArea?.classList.toggle('hide-page-controls', !show);
    localStorage.setItem('zine-page-controls', String(show));
  }

  cacheElements() {
    const $ = (selector) => document.querySelector(selector);

    this.elements = {
      unifiedDropZone: $('#unified-drop-zone'),
  uploadZone: $('#upload-zone'),
  browseFilesBtn: $('#browse-files-btn'),
  uploadStatus: $('#upload-status'),
      uploadedFilesList: $('#uploaded-files-list'),
      previewArea: $('#preview-area'),
      zineSheetsContainer: $('#zine-sheets-container'),
      paperSizeSelect: $('#paper-size-select'),
      orientationToggle: $('#orientation-toggle'),
      marginInput: $('#margin-input'),
      pageNumbersCheckbox: $('#show-page-numbers'),
      pageControlsCheckbox: $('#show-page-controls'),
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
      foldViewerCard: $('#card-fold-viewer'),
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
      view3dBtn: $('#view3dBtn'),
      headerExportBtn: $('#header-export-btn'),
      headerPreviewBtn: $('#header-preview-btn')
    };
  }

  setupEventListeners() {
    this._setupPaperAndGridListeners();
    this._setupActionListeners();
    this._setupUploadListeners();
    this._setupRailAndFoldListeners();
    this._setupWindowListeners();
  }

  _setupPaperAndGridListeners() {
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

      this.elements.gridRows?.closest('.workspace-config-split')?.querySelectorAll('.stepper-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const target = document.getElementById(btn.dataset.target);
          if (!target) { return; }
          const min = parseInt(target.min, 10) || 1;
          const max = parseInt(target.max, 10) || 10;
          const delta = parseInt(btn.dataset.delta, 10);
          const next = Math.min(max, Math.max(min, parseInt(target.value, 10) + delta));
          target.value = next;
          target.dispatchEvent(new Event('change', { bubbles: true }));
        });
      });

      let lastGridState = { rows: DEFAULT_GRID_ROWS, cols: DEFAULT_GRID_COLS };
      const debouncedGridChange = debounce(() => {
        const { rows, cols } = this.normalizeGridInputs();

        this.updateGridTotalBadge(rows, cols);
        this._syncOrientationVisibility(rows, cols);

        // Only emit gridSizeChanged when grid dimensions actually changed
        if (lastGridState.rows !== rows || lastGridState.cols !== cols) {
          lastGridState = { rows, cols };
          this.emitter.emit('gridSizeChanged', { rows, cols });
        }

      }, 300);

      this.elements.gridRows?.addEventListener('input', debouncedGridChange);
      this.elements.gridCols?.addEventListener('input', debouncedGridChange);
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
    this.elements.view3dBtn?.addEventListener('click', () => this.emitter.emit('view3d'));
    this.elements.headerExportBtn?.addEventListener('click', () => this.emitter.emit('export'));
    this.elements.headerPreviewBtn?.addEventListener('click', () => this.emitter.emit('view3d'));
    this.elements.clearAllBtn?.addEventListener('click', () => this.emitter.emit('clearAll'));
    this.elements.themeToggleBtn?.addEventListener('click', () => this.toggleTheme());
  }

  _setupUploadListeners() {
    this.elements.uploadZone?.addEventListener('click', () => this.triggerFileUpload());
    this.elements.browseFilesBtn?.addEventListener('click', () => this.triggerFileUpload());
    this.elements.uploadZone?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        this.triggerFileUpload();
      }
    });

    this.dnd.setupEventListeners();
    this.emitter.on('filesDropped', (files) => this.handleIncomingFiles(files));

    this.elements.pdfUpload?.addEventListener('change', (event) => {
      const files = Array.from(event.target.files || []);
      this.handleIncomingFiles(files);
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
    const foldViewerCard = this.elements.foldViewerCard;
    return foldViewerCard && !foldViewerCard.classList.contains('hidden');
  }

  generateLayout(numPages, templateType, paperSettings = {}) {
    this.pageCellCache = null;

    const template = typeof templateType === 'string'
      ? ZINE_TEMPLATES[templateType || 'mini-8']
      : (templateType || ZINE_TEMPLATES['mini-8']);

    const handlers = {
      onClick: (_, index) => {
        const cell = this._getPageCell(index);
        const hasPage = cell?.classList.contains('has-page');
        if (hasPage) {
          this.emitter.emit('pageRemoved', index);
        } else {
          this.triggerFileUpload();
        }
      },
      onFlip: (index) => this.emitter.emit('pageFlipped', index),
      onCrop: (index) => this.emitter.emit('pageCropToggled', index),
      onDuplicate: (index) => this.emitter.emit('pageDuplicated', index),
      onRemove: (index) => this.emitter.emit('pageRemoved', index)
    };

    const dimensions = this.getPaperDimensions(
      paperSettings.paperSize || 'letter',
      paperSettings.orientation || 'landscape',
      paperSettings.customPaper
    );
    dimensions.margin = paperSettings.margin || 0;

    this.dnd.destroySortables();

    this.renderer.render(
      numPages,
      template,
      {
        pageNumbersVisible: this.pageNumbersVisible,
        pageImages: paperSettings.pageImages,
        pageFlips: paperSettings.pageFlips,
        pageZooms: paperSettings.pageZooms
      },
      handlers,
      dimensions
    );

    // Attach Sortable to every rendered grid
    this.elements.zineSheetsContainer.querySelectorAll('.zine-grid').forEach(grid => {
      this.dnd.initSortable(grid);
    });
  }
}
