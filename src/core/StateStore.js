/**
 * StateStore.js
 * Centralized state management for the Zine-ify application
 */
export class StateStore {
  constructor() {
    this.allPageImages = new Array(8).fill(null);
    this._blankPageUrl = null;
    this.pageFlips = {}; // { pageIndex: boolean }
    this.pageZooms = {}; // { pageIndex: boolean }
    this.pageTransforms = {}; // { pageIndex: { rotation, fit, crop, pan, zoom } }
    this.pageNumberVisibility = {};
    this.selectedPageIndex = null;
    this.layoutPresetId = 'mini-8';
    this.guideToggles = { fold: true, cut: true, boundaries: true, numbers: true, arrows: false, safeArea: false, margins: true };
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
    this.margin = 0;
  }

  getFilledPageCount() {
    for (let i = this.allPageImages.length - 1; i >= 0; i--) {
      if (this.allPageImages[i] && this.allPageImages[i] !== this._blankPageUrl) {
        return i + 1;
      }
    }
    return 0;
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

  updatePaperSettings({ paperSize, orientation }) {
    if (paperSize) {this.paperSize = paperSize;}
    if (orientation) {this.orientation = orientation;}
    this.projectMeta.updatedAt = Date.now();
  }

  selectPage(pageIndex) {
    this.selectedPageIndex = Number.isInteger(pageIndex) ? pageIndex : null;
  }

  setLayoutPreset(presetId, gridSize) {
    this.layoutPresetId = presetId || 'custom';
    if (gridSize?.rows && gridSize?.cols) {this.gridSize = { rows: gridSize.rows, cols: gridSize.cols };}
    this.projectMeta.updatedAt = Date.now();
  }

  setPageTransform(pageIndex, patch = {}) {
    this.pageTransforms[pageIndex] = { rotation: 0, fit: 'fit', crop: null, pan: { x: 0, y: 0 }, zoom: 1, ...this.pageTransforms[pageIndex], ...patch };
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
      pageNumberVisibility: { ...this.pageNumberVisibility },
      selectedPageIndex: this.selectedPageIndex,
      guideToggles: { ...this.guideToggles },
      printSettings: { ...this.printSettings },
      paperSize: this.paperSize,
      orientation: this.orientation,
      margin: this.margin,
      projectMeta: { ...this.projectMeta },
      pageCount: this.totalPages
    };
  }

  restoreProjectJSON(project = {}) {
    if (project.layoutPresetId) {this.layoutPresetId = project.layoutPresetId;}
    if (project.gridSize) {this.gridSize = { ...this.gridSize, ...project.gridSize };}
    this.pageFlips = { ...project.pageFlips };
    this.pageZooms = { ...project.pageZooms };
    this.pageTransforms = structuredClone(project.pageTransforms || {});
    this.pageNumberVisibility = { ...project.pageNumberVisibility };
    this.selectedPageIndex = Number.isInteger(project.selectedPageIndex) ? project.selectedPageIndex : null;
    this.guideToggles = { ...this.guideToggles, ...project.guideToggles };
    this.printSettings = { ...this.printSettings, ...project.printSettings };
    if (project.paperSize) {this.paperSize = project.paperSize;}
    if (project.orientation) {this.orientation = project.orientation;}
    if (Number.isFinite(project.margin)) {this.margin = project.margin;}
    this.projectMeta = { ...this.projectMeta, ...project.projectMeta, updatedAt: Date.now() };
  }
}
