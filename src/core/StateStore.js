/**
 * StateStore.js
 * Centralized state management for the Zine-ify application
 */
export class StateStore {
  constructor() {
    this.allPageImages = new Array(8).fill(null);
    this._blankPageUrl = null;
    this.pageFlips = {}; // { pageIndex: boolean }
    this.pageRotations = {}; // { pageIndex: 0 | 90 | 180 | 270 }
    this.pageZooms = {}; // { pageIndex: boolean }
    this.pageTransforms = {}; // { pageIndex: { rotation, fit, crop, pan, zoom } }
    this.pageNumberVisibility = {};
    this.selectedPageIndex = null;
    this.layoutPresetId = 'mini-8';
    this.guideToggles = {
      fold: true,
      cut: true,
      boundaries: true,
      numbers: true,
      arrows: false,
      safeArea: false,
      margins: true,
      includeInExport: true,
    };
    this.printSettings = { duplex: true, scale: 'fit', bleed: 0, trim: 0 };
    this.projectMeta = { name: 'Untitled zine', createdAt: Date.now(), updatedAt: Date.now() };
    this.gridSize = { rows: 2, cols: 4 };
    this.uploadedFiles = [];
    this.totalPages = 0;
    this.fileQueue = [];
    this.isProcessingQueue = false;
    this.workflowPreviewed = false;
    this.workflowExported = false;
    this.paperSize = 'letter';
    this.orientation = 'landscape';
    this.paperColor = '#ffffff';
    this.pageTexts = {};
    this.margin = 0;
    this.customPaper = { width: 215.9, height: 279.4 };
  }

  getPageRotation(index) {
    if (Number.isFinite(this.pageRotations?.[index])) {
      return ((this.pageRotations[index] % 360) + 360) % 360;
    }
    return this.pageFlips?.[index] ? 180 : 0;
  }

  getFilledPageCount() {
    for (let i = this.allPageImages.length - 1; i >= 0; i--) {
      if (this.allPageImages[i] && this.allPageImages[i] !== this._blankPageUrl) {
        return i + 1;
      }
    }
    return 0;
  }

  getRealFilledSlotCount() {
    let count = 0;
    for (let i = 0; i < this.allPageImages.length; i++) {
      if (this.allPageImages[i] && this.allPageImages[i] !== this._blankPageUrl) {
        count++;
      }
    }
    return count;
  }

  getNonEmptySlotCount() {
    let count = 0;
    for (let i = 0; i < this.allPageImages.length; i++) {
      if (this.allPageImages[i]) {
        count++;
      }
    }
    return count;
  }

  getRequiredPageCapacity() {
    const { rows, cols } = this.gridSize;
    const slotsPerSheet = rows * cols;
    return Math.max(slotsPerSheet, Math.ceil(Math.max(this.totalPages, 1) / slotsPerSheet) * slotsPerSheet);
  }

  isMiniZineLayout() {
    return (this.gridSize.rows === 2 && this.gridSize.cols === 4);
  }

  resetWorkflowStatus() {
    this.workflowPreviewed = false;
    this.workflowExported = false;
  }

  markExported() {
    this.workflowExported = true;
  }

  markPreviewed() {
    this.workflowPreviewed = true;
    this.workflowExported = false;
  }

  updatePaperSettings({ paperSize, customPaper }) {
    if (paperSize) { this.paperSize = paperSize; }
    this.orientation = 'landscape';
    if (customPaper && customPaper.width > 0 && customPaper.height > 0) {
      this.customPaper = { ...customPaper };
    }
    this.projectMeta.updatedAt = Date.now();
  }

  setGuideToggle(key, enabled) {
    if (Object.prototype.hasOwnProperty.call(this.guideToggles, key)) {
      this.guideToggles[key] = Boolean(enabled);
      this.projectMeta.updatedAt = Date.now();
    }
  }

  selectPage(pageIndex) {
    this.selectedPageIndex = Number.isInteger(pageIndex) ? pageIndex : null;
  }

  setLayoutPreset(presetId, gridSize) {
    this.layoutPresetId = presetId || 'custom';
    if (gridSize?.rows && gridSize?.cols) { this.gridSize = { rows: gridSize.rows, cols: gridSize.cols }; }
    this.projectMeta.updatedAt = Date.now();
  }

  getPageTransform(pageIndex) {
    const existing = this.pageTransforms?.[pageIndex] || {};
    const isZoomed = Boolean(this.pageZooms?.[pageIndex]);
    const fit = existing.fit === 'cover' || existing.fit === 'fill' || (!existing.fit && isZoomed)
      ? 'fill'
      : 'fit';
    const zoom = Number.isFinite(existing.zoom) ? Math.max(1, Math.min(2.5, existing.zoom)) : 1;
    const panX = Number.isFinite(existing.pan?.x) ? Math.max(-100, Math.min(100, existing.pan.x)) : 0;
    const panY = Number.isFinite(existing.pan?.y) ? Math.max(-100, Math.min(100, existing.pan.y)) : 0;
    return {
      rotation: this.getPageRotation(pageIndex),
      fit,
      crop: existing.crop || null,
      pan: { x: panX, y: panY },
      zoom
    };
  }

  setPageTransform(pageIndex, patch = {}) {
    const current = this.getPageTransform(pageIndex);
    const nextFit = patch.fit !== undefined
      ? (patch.fit === 'fill' || patch.fit === 'cover' ? 'fill' : 'fit')
      : current.fit;
    const nextZoom = patch.zoom !== undefined
      ? Math.round(Math.max(1, Math.min(2.5, Number(patch.zoom) || 1)) * 100) / 100
      : current.zoom;
    const nextPanX = patch.pan?.x !== undefined
      ? Math.round(Math.max(-100, Math.min(100, Number(patch.pan.x) || 0)))
      : current.pan.x;
    const nextPanY = patch.pan?.y !== undefined
      ? Math.round(Math.max(-100, Math.min(100, Number(patch.pan.y) || 0)))
      : current.pan.y;

    this.pageTransforms[pageIndex] = {
      ...current,
      ...patch,
      fit: nextFit,
      zoom: nextZoom,
      pan: { x: nextPanX, y: nextPanY }
    };
    this.pageZooms[pageIndex] = (nextFit === 'fill');
    this.projectMeta.updatedAt = Date.now();
    return this.pageTransforms[pageIndex];
  }

  resetPageTransform(pageIndex, { resetFit = false } = {}) {
    const current = this.getPageTransform(pageIndex);
    return this.setPageTransform(pageIndex, {
      fit: resetFit ? 'fit' : current.fit,
      zoom: 1,
      pan: { x: 0, y: 0 }
    });
  }

  setPaperColor(hex) {
    if (typeof hex === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(hex)) {
      this.paperColor = hex;
    } else {
      this.paperColor = '#ffffff';
    }
    this.projectMeta.updatedAt = Date.now();
  }

  getPageTexts(pageIndex) {
    return Array.isArray(this.pageTexts?.[pageIndex]) ? this.pageTexts[pageIndex] : [];
  }

  addPageText(pageIndex, sticker = {}) {
    if (!this.pageTexts) { this.pageTexts = {}; }
    if (!Array.isArray(this.pageTexts[pageIndex])) {
      this.pageTexts[pageIndex] = [];
    }
    const id = sticker.id || `txt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const bgEnabled = sticker.bgEnabled !== undefined
      ? Boolean(sticker.bgEnabled)
      : (sticker.bg !== 'transparent');
    const newSticker = {
      id,
      text: sticker.text || 'Text',
      x: Number.isFinite(sticker.x) ? Math.max(0, Math.min(94, sticker.x)) : 25,
      y: Number.isFinite(sticker.y) ? Math.max(0, Math.min(94, sticker.y)) : 35,
      fontSize: Number.isFinite(sticker.fontSize) ? Math.max(10, Math.min(84, sticker.fontSize)) : 22,
      fontFamily: sticker.fontFamily || 'sans', // 'sans' | 'serif' | 'mono' | 'handwriting'
      align: sticker.align || 'left', // 'left' | 'center' | 'right'
      color: sticker.color || '#111827',
      bg: sticker.bg || 'rgba(255,255,255,0.92)',
      bgEnabled,
      isBold: sticker.isBold !== undefined ? Boolean(sticker.isBold) : true,
      rotation: Number.isFinite(sticker.rotation) ? ((sticker.rotation % 360) + 360) % 360 : 0
    };
    this.pageTexts[pageIndex].push(newSticker);
    this.projectMeta.updatedAt = Date.now();
    return newSticker;
  }

  updatePageText(pageIndex, stickerId, patch = {}) {
    const list = this.pageTexts?.[pageIndex];
    if (!Array.isArray(list)) { return null; }
    const index = list.findIndex((item) => item.id === stickerId);
    if (index === -1) { return null; }
    const current = list[index];
    const updated = {
      ...current,
      ...patch,
      fontFamily: patch.fontFamily || current.fontFamily || 'sans',
      align: patch.align || current.align || 'left',
      x: Number.isFinite(patch.x) ? Math.max(0, Math.min(94, patch.x)) : current.x,
      y: Number.isFinite(patch.y) ? Math.max(0, Math.min(94, patch.y)) : current.y,
      fontSize: Number.isFinite(patch.fontSize) ? Math.max(10, Math.min(84, patch.fontSize)) : current.fontSize,
      rotation: Number.isFinite(patch.rotation) ? ((patch.rotation % 360) + 360) % 360 : (current.rotation || 0)
    };
    list[index] = updated;
    this.projectMeta.updatedAt = Date.now();
    return updated;
  }

  removePageText(pageIndex, stickerId) {
    const list = this.pageTexts?.[pageIndex];
    if (!Array.isArray(list)) { return; }
    this.pageTexts[pageIndex] = list.filter((item) => item.id !== stickerId);
    this.projectMeta.updatedAt = Date.now();
  }

  toProjectJSON() {
    return {
      version: 1,
      layoutPresetId: this.layoutPresetId,
      gridSize: { ...this.gridSize },
      pageFlips: { ...this.pageFlips },
      pageZooms: { ...this.pageZooms },
      pageTransforms: structuredClone(this.pageTransforms),
      pageTexts: structuredClone(this.pageTexts),
      pageNumberVisibility: { ...this.pageNumberVisibility },
      selectedPageIndex: this.selectedPageIndex,
      guideToggles: { ...this.guideToggles },
      printSettings: { ...this.printSettings },
      paperSize: this.paperSize,
      orientation: this.orientation,
      paperColor: this.paperColor,
      margin: this.margin,
      projectMeta: { ...this.projectMeta },
      pageCount: this.totalPages
    };
  }

  restoreProjectJSON(project = {}) {
    if (project.layoutPresetId) { this.layoutPresetId = project.layoutPresetId; }
    if (project.gridSize) { this.gridSize = { ...this.gridSize, ...project.gridSize }; }
    this.pageFlips = { ...project.pageFlips };
    this.pageRotations = { ...(project.pageRotations || {}) };
    this.pageZooms = { ...project.pageZooms };
    this.pageTransforms = structuredClone(project.pageTransforms || {});
    this.pageTexts = structuredClone(project.pageTexts || {});
    this.pageNumberVisibility = { ...project.pageNumberVisibility };
    this.selectedPageIndex = Number.isInteger(project.selectedPageIndex) ? project.selectedPageIndex : null;
    this.guideToggles = { ...this.guideToggles, ...project.guideToggles };
    this.printSettings = { ...this.printSettings, ...project.printSettings };
    if (project.paperSize) { this.paperSize = project.paperSize; }
    this.orientation = 'landscape';
    if (project.paperColor) { this.paperColor = project.paperColor; }
    if (Number.isFinite(project.margin)) { this.margin = project.margin; }
    if (project.customPaper) { this.customPaper = { ...this.customPaper, ...project.customPaper }; }
    this.projectMeta = { ...this.projectMeta, ...project.projectMeta, updatedAt: Date.now() };
  }
}
