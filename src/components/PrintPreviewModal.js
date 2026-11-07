/**
 * PrintPreviewModal.js
 * High-fidelity read-only print preview modal displaying the exact imposition sheet
 * as it will be printed, including active cut-slit marks, fold lines, and per-page crop/zoom.
 */
import DOMPurify from 'dompurify';
import { resolvePaperSize, PAPER_SIZES } from '../utils/config.js';

export class PrintPreviewModal {
  /**
   * @param {Object} options
   * @param {HTMLElement} options.modalEl
   * @param {Function} options.onPrint
   * @param {Function} options.onExportPdf
   */
  constructor(options = {}) {
    this.modalEl = options.modalEl;
    this.onPrint = options.onPrint || (() => {});
    this.onExportPdf = options.onExportPdf || (() => {});

    this.isOpen = false;
    this.zoomMode = 'fit'; // 'fit' | '100' | number (e.g. 0.8)
    this.currentScale = 1;
    this.latestSheetHtml = '';
    this.latestDims = { width: 279.4, height: 215.9 };

    this._bindElements();
    this._attachEvents();
  }

  _bindElements() {
    if (!this.modalEl) { return; }
    this.backdropEl = this.modalEl.querySelector('#print-preview-backdrop');
    this.closeBtn = this.modalEl.querySelector('#print-preview-close');
    this.cancelBtn = this.modalEl.querySelector('#print-preview-cancel');
    this.confirmPrintBtn = this.modalEl.querySelector('#print-preview-confirm-print');
    this.downloadPdfBtn = this.modalEl.querySelector('#print-preview-download-pdf');
    this.viewportEl = this.modalEl.querySelector('#print-preview-viewport');
    this.stageEl = this.modalEl.querySelector('#print-preview-stage');
    this.paperBadgeEl = this.modalEl.querySelector('#print-preview-paper-badge');
    this.specReadoutEl = this.modalEl.querySelector('#print-preview-spec-readout');
    this.marksTagEl = this.modalEl.querySelector('#print-preview-marks-tag');
    this.zoomFitBtn = this.modalEl.querySelector('#print-preview-zoom-fit');
    this.zoom100Btn = this.modalEl.querySelector('#print-preview-zoom-100');
    this.zoomOutBtn = this.modalEl.querySelector('#print-preview-zoom-out');
    this.zoomInBtn = this.modalEl.querySelector('#print-preview-zoom-in');
    this.zoomReadoutEl = this.modalEl.querySelector('#print-preview-zoom-readout');
  }

  _attachEvents() {
    this.closeBtn?.addEventListener('click', () => this.close());
    this.cancelBtn?.addEventListener('click', () => this.close());
    this.backdropEl?.addEventListener('click', () => this.close());

    this.confirmPrintBtn?.addEventListener('click', () => {
      this.close();
      this.onPrint();
    });

    this.downloadPdfBtn?.addEventListener('click', () => {
      this.close();
      this.onExportPdf();
    });

    this.zoomFitBtn?.addEventListener('click', () => this.setZoom('fit'));
    this.zoom100Btn?.addEventListener('click', () => this.setZoom('100'));
    this.zoomOutBtn?.addEventListener('click', () => this.stepZoom(-0.15));
    this.zoomInBtn?.addEventListener('click', () => this.stepZoom(0.15));

    window.addEventListener('resize', () => {
      if (this.isOpen && this.zoomMode === 'fit') {
        this._updateFitScale();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (!this.isOpen) { return; }
      if (e.key === 'Escape') {
        e.preventDefault();
        this.close();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        this.close();
        this.onPrint();
      }
    });
  }

  /**
   * Opens the print preview modal with the provided state & export services.
   * @param {Object} data
   * @param {string} data.sheetsHtml
   * @param {Object} data.dimensions { width, height }
   * @param {Object} data.state
   */
  open({ sheetsHtml, dimensions, state }) {
    if (!this.modalEl) { return; }
    this.isOpen = true;
    this.latestSheetHtml = sheetsHtml;
    this.latestDims = dimensions || { width: 279.4, height: 215.9 };
    this.state = state;

    this.modalEl.classList.remove('hidden');
    document.body.classList.add('print-preview-open');

    this._updatePaperReadout(state, dimensions);
    this._renderSheetContent();

    this.setZoom('fit');

    // Focus primary print button
    setTimeout(() => {
      this.confirmPrintBtn?.focus();
    }, 50);
  }

  close() {
    if (!this.isOpen) { return; }
    this.isOpen = false;
    this.modalEl?.classList.add('hidden');
    document.body.classList.remove('print-preview-open');
  }

  _updatePaperReadout(state, dims) {
    const paperKey = state?.paperSize || 'letter';
    const paperDef = resolvePaperSize(paperKey, state?.customPaper) || PAPER_SIZES.letter;
    const paperName = paperKey === 'custom' ? 'Custom Paper' : paperDef.label;
    const marginMm = state?.margin || 0;

    const widthIn = (dims.width / 25.4).toFixed(1);
    const heightIn = (dims.height / 25.4).toFixed(1);

    if (this.paperBadgeEl) {
      this.paperBadgeEl.textContent = `${paperName} · Landscape`;
    }

    if (this.specReadoutEl) {
      this.specReadoutEl.innerHTML = `
        <span><strong>Size:</strong> ${dims.width.toFixed(1)} × ${dims.height.toFixed(1)} mm (${widthIn} × ${heightIn} in)</span>
        <span class="preview-spec-divider">•</span>
        <span><strong>Margin:</strong> ${marginMm} mm</span>
        <span class="preview-spec-divider">•</span>
        <span><strong>Print Imposition:</strong> 8-Page Mini Zine</span>
      `;
    }

    const marksEnabled = state?.guideToggles?.includeInExport !== false;
    if (this.marksTagEl) {
      this.marksTagEl.textContent = marksEnabled ? 'Registration & Cut Marks Active' : 'Clean Print (Marks Off)';
      this.marksTagEl.classList.toggle('is-active', marksEnabled);
    }
  }

  _renderSheetContent() {
    if (!this.stageEl) { return; }
    const paperColor = this.state?.paperColor || '#ffffff';
    // Clean and mount the raw imposition sheet HTML
    const sanitized = DOMPurify.sanitize(this.latestSheetHtml, {
      ADD_TAGS: ['style'],
      WHOLE_DOCUMENT: false
    });

    this.stageEl.innerHTML = `
      <div class="print-preview-sheet-frame" style="width: ${this.latestDims.width}mm; height: ${this.latestDims.height}mm; background: ${paperColor};">
        ${sanitized}
      </div>
    `;
  }

  setZoom(mode) {
    this.zoomMode = mode;
    this.zoomFitBtn?.classList.toggle('is-active', mode === 'fit');
    this.zoom100Btn?.classList.toggle('is-active', mode === '100');

    if (mode === 'fit') {
      this._updateFitScale();
    } else if (mode === '100') {
      this._applyScale(1.0);
    } else if (typeof mode === 'number') {
      this._applyScale(mode);
    }
  }

  stepZoom(delta) {
    const newScale = Math.max(0.25, Math.min(2.5, this.currentScale + delta));
    this.zoomMode = newScale;
    this.zoomFitBtn?.classList.remove('is-active');
    this.zoom100Btn?.classList.remove('is-active');
    this._applyScale(newScale);
  }

  _updateFitScale() {
    if (!this.viewportEl || !this.stageEl) { return; }
    const viewportRect = this.viewportEl.getBoundingClientRect();
    const availableW = Math.max(100, viewportRect.width - 48);
    const availableH = Math.max(100, viewportRect.height - 48);

    // 1mm ~ 3.7795px at 96 DPI
    const sheetPxW = this.latestDims.width * 3.7795;
    const sheetPxH = this.latestDims.height * 3.7795;

    const scaleW = availableW / sheetPxW;
    const scaleH = availableH / sheetPxH;
    const fitScale = Math.min(scaleW, scaleH);

    this._applyScale(fitScale);
  }

  _applyScale(scale) {
    this.currentScale = scale;
    if (this.stageEl) {
      this.stageEl.style.transform = `scale(${scale})`;
    }
    if (this.zoomReadoutEl) {
      this.zoomReadoutEl.textContent = `${Math.round(scale * 100)}%`;
    }
  }
}
