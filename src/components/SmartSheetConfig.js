import DOMPurify from 'dompurify';
import {
  PAPER_SIZES,
  MARGIN_MIN,
  MARGIN_MAX,
  UNITS,
  toMm,

  formatDimension,
  resolvePaperSize,
  LAYOUT_PRESETS
} from '../utils/config.js';

const FIXED_ROWS = 2;
const FIXED_COLS = 4;

const PAPER_RECOMMENDATIONS = {
  'a4': { best: 'portrait', reason: 'Optimal for mini-zine folding' },
  'letter': { best: 'landscape', reason: 'Standard US format, good margins' },
  'a3': { best: 'landscape', reason: 'Great for double-mini format' },
  'legal': { best: 'landscape', reason: 'Extra height for longer content' },
  'a5': { best: 'landscape', reason: 'Compact format, great for cards' }
};

export class SmartSheetConfig {
  constructor(container, options = {}) {
    this.container = container;
    this.options = {
      initialPaper: 'letter',
      initialOrientation: 'landscape',
      initialUnit: 'in',
      onChange: () => {},
      ...options
    };

    const seedPaper = PAPER_SIZES[this.options.initialPaper] || PAPER_SIZES.letter;

    this.state = {
      rows: FIXED_ROWS,
      cols: FIXED_COLS,
      layoutPresetId: 'mini-8',
      paperSize: this.options.initialPaper,
      orientation: this.options.initialOrientation,
      margin: 0,
      unit: UNITS[this.options.initialUnit] ? this.options.initialUnit : 'in',
      // Custom paper dimensions stored in mm; seeded from the initial paper.
      customPaper: { width: seedPaper.width, height: seedPaper.height }
    };

    this.render();
    this.attachEventListeners();
  }

  render() {
    const { paperSize, orientation, margin, unit } = this.state;
    const unitDef = UNITS[unit] || UNITS.mm;
    const recommendation = PAPER_RECOMMENDATIONS[paperSize];
    const isRecommended = orientation === recommendation?.best;
    const isCustom = paperSize === 'custom';

    const fmt = (mm) => formatDimension(mm, unit);
    const paper = resolvePaperSize(paperSize, this.state.customPaper);
    const landscapeW = fmt(Math.max(paper.width, paper.height));
    const landscapeH = fmt(Math.min(paper.width, paper.height));

    const fragment = DOMPurify.sanitize(`
      <div class="smart-sheet-config">
        <div class="smart-sheet-section">
          <div class="smart-sheet-header">
            <span class="smart-sheet-label">Paper Size</span>
            <div class="smart-sheet-unit-seg" role="group" aria-label="Measurement units">
              ${Object.entries(UNITS).map(([key, u]) => `
                <button type="button"
                  class="smart-sheet-unit-btn ${unit === key ? 'is-active' : ''}"
                  data-unit="${key}"
                  aria-pressed="${unit === key}">${u.label}</button>
              `).join('')}
            </div>
          </div>

          <div class="smart-sheet-header">
            <span class="smart-sheet-label">Orientation</span>
            <div class="smart-sheet-orientation-seg" role="group" aria-label="Page orientation">
              <button type="button"
                class="smart-sheet-orientation-btn ${orientation === 'portrait' ? 'is-active' : ''}"
                data-value="portrait"
                aria-pressed="${orientation === 'portrait'}">
                <span class="material-symbols-outlined">portrait</span>
                Portrait <span class="smart-sheet-dim">(${landscapeH}×${landscapeW})</span>
              </button>
              <button type="button"
                class="smart-sheet-orientation-btn ${orientation === 'landscape' ? 'is-active' : ''}"
                data-value="landscape"
                aria-pressed="${orientation === 'landscape'}">
                <span class="material-symbols-outlined">landscape</span>
                Landscape <span class="smart-sheet-dim">(${landscapeW}×${landscapeH})</span>
              </button>
            </div>
          </div>

          <span class="smart-sheet-paper-recommend ${isRecommended && !isCustom ? 'is-visible' : ''}">
            <span class="material-symbols-outlined">check_circle</span>
            ${recommendation?.reason || ''}
          </span>

          <select class="smart-sheet-select" data-field="paperSize">
            ${Object.entries(PAPER_SIZES).map(([key, p]) => `
              <option value="${key}" ${paperSize === key ? 'selected' : ''}>
                ${p.label} (${fmt(p.width)}×${fmt(p.height)}${unitDef.label})
              </option>
            `).join('')}
            <option value="custom" ${isCustom ? 'selected' : ''}>Custom size…</option>
          </select>

          ${isCustom ? `
          <div class="smart-sheet-custom-size">
            <label class="smart-sheet-custom-field">
              <span class="smart-sheet-custom-caption">Width</span>
              <input type="number" class="smart-sheet-custom-input" data-field="customWidth"
                min="1" step="${unitDef.inputStep}"
                value="${formatDimension(this.state.customPaper.width, unit)}"
                aria-label="Custom width in ${unitDef.label}" />
            </label>
            <span class="smart-sheet-custom-x">×</span>
            <label class="smart-sheet-custom-field">
              <span class="smart-sheet-custom-caption">Height</span>
              <input type="number" class="smart-sheet-custom-input" data-field="customHeight"
                min="1" step="${unitDef.inputStep}"
                value="${formatDimension(this.state.customPaper.height, unit)}"
                aria-label="Custom height in ${unitDef.label}" />
            </label>
            <span class="smart-sheet-custom-unit">${unitDef.label}</span>
          </div>
          ` : ''}
        </div>

        <div class="smart-sheet-section">
          <div class="smart-sheet-header">
            <span class="smart-sheet-label">Margin</span>
            <div class="smart-sheet-margin-stepper">
              <button type="button" class="smart-sheet-stepper-btn" data-margin-delta="-1" aria-label="Decrease margin" ${margin <= MARGIN_MIN ? 'disabled' : ''}>
                <span class="material-symbols-outlined">remove</span>
              </button>
              <span class="smart-sheet-margin-value">
                <span data-margin-display>${formatDimension(margin, unit)}</span>
                <span class="smart-sheet-times">${unitDef.label}</span>
              </span>
              <button type="button" class="smart-sheet-stepper-btn" data-margin-delta="1" aria-label="Increase margin" ${margin >= MARGIN_MAX ? 'disabled' : ''}>
                <span class="material-symbols-outlined">add</span>
              </button>
            </div>
          </div>

          <div class="smart-sheet-margin-control">
            <input
              type="range"
              class="smart-sheet-margin-slider"
              data-field="margin"
              min="${MARGIN_MIN}"
              max="${MARGIN_MAX}"
              step="0.5"
              value="${margin}"
              aria-label="Sheet margin in ${unitDef.label}" />
          </div>
        </div>
      </div>
    `, { RETURN_DOM_FRAGMENT: true });
    this.container.replaceChildren(fragment);
  }

  attachEventListeners() {
    this.container.addEventListener('click', this.handleClick.bind(this));
    this.container.addEventListener('change', this.handleChange.bind(this));
    this.container.addEventListener('input', this.handleInput.bind(this));
  }

  handleClick(e) {
    const presetBtn = e.target.closest('[data-preset]');
    if (presetBtn) {
      this.setPreset(presetBtn.dataset.preset);
      return;
    }

    const unitBtn = e.target.closest('.smart-sheet-unit-btn');
    if (unitBtn) {
      this.setUnit(unitBtn.dataset.unit);
      return;
    }

    const orientBtn = e.target.closest('.smart-sheet-orientation-btn');
    if (orientBtn) {
      this.setOrientation(orientBtn.dataset.value);
      return;
    }

    const marginBtn = e.target.closest('[data-margin-delta]');
    if (marginBtn) {
      const sign = parseInt(marginBtn.dataset.marginDelta, 10) || 0;
      const unitDef = UNITS[this.state.unit] || UNITS.mm;
      const stepMm = toMm(unitDef.marginStep, this.state.unit);
      this.setMargin(this.state.margin + sign * stepMm);
    }
  }

  handleChange(e) {
    if (e.target.matches('[data-field="rows"], [data-field="cols"]')) {
      const field = e.target.dataset.field;
      const value = Math.min(10, Math.max(1, Number.parseInt(e.target.value, 10) || 1));
      this.state[field] = value;
      this.state.layoutPresetId = 'custom';
      this.render();
      this.emitChange();
      return;
    }

    if (e.target.matches('.smart-sheet-select')) {
      this.setPaperSize(e.target.value);
      return;
    }

    if (e.target.matches('[data-field="customWidth"], [data-field="customHeight"]')) {
      this.setCustomDimension(e.target.dataset.field, e.target.value);
    }
  }

  handleInput(e) {
    if (e.target.matches('.smart-sheet-margin-slider')) {
      // Live-update the displayed value while dragging without a full re-render.
      const value = this.clampMargin(parseFloat(e.target.value));
      this.state.margin = value;
      const display = this.container.querySelector('[data-margin-display]');
      if (display) {display.textContent = formatDimension(value, this.state.unit);}
      this.emitChange();
    }
  }

  clampMargin(value) {
    if (Number.isNaN(value)) {return MARGIN_MIN;}
    return Math.min(MARGIN_MAX, Math.max(MARGIN_MIN, value));
  }

  setPreset(layoutPresetId) {
    const preset = LAYOUT_PRESETS[layoutPresetId];
    if (!preset) {return;}
    this.state.layoutPresetId = layoutPresetId;
    this.state.rows = preset.sheetGrid.rows;
    this.state.cols = preset.sheetGrid.cols;
    this.render();
    this.emitChange();
  }

  setMargin(margin) {
    this.state.margin = this.clampMargin(margin);
    this.render();
    this.emitChange();
  }

  setOrientation(orientation) {
    if (orientation !== 'portrait' && orientation !== 'landscape') { return; }
    this.state.orientation = orientation;
    this.render();
    this.emitChange();
  }

  setUnit(unit) {
    if (!UNITS[unit] || unit === this.state.unit) {return;}
    this.state.unit = unit;
    // Units only affect display; internal mm values are unchanged.
    this.render();
    this.emitChange();
  }

  setCustomDimension(field, rawValue) {
    const mm = toMm(rawValue, this.state.unit);
    const clamped = Math.max(1, Number.isFinite(mm) ? mm : 1);
    if (field === 'customWidth') {
      this.state.customPaper = { ...this.state.customPaper, width: clamped };
    } else {
      this.state.customPaper = { ...this.state.customPaper, height: clamped };
    }
    this.render();
    this.emitChange();
  }

  setPaperSize(paperSize) {
    // When switching to custom, seed dimensions from the currently shown paper.
    if (paperSize === 'custom') {
      const current = resolvePaperSize(this.state.paperSize, this.state.customPaper);
      this.state.customPaper = { width: current.width, height: current.height };
    }
    this.state.paperSize = paperSize;
    const recommendation = PAPER_RECOMMENDATIONS[paperSize];
    if (recommendation) {
      this.state.orientation = recommendation.best;
    }
    this.render();
    this.emitChange();
  }


  emitChange() {
    this.options.onChange({
      rows: this.state.rows,
      cols: this.state.cols,
      layoutPresetId: this.state.layoutPresetId,
      paperSize: this.state.paperSize,
      orientation: this.state.orientation,
      margin: this.state.margin,
      unit: this.state.unit,
      customPaper: { ...this.state.customPaper },
      totalSlots: this.state.rows * this.state.cols
    });
  }

  getState() {
    return { ...this.state, totalSlots: this.state.rows * this.state.cols };
  }

  setState(newState) {
    Object.assign(this.state, newState);
    this.render();
    this.emitChange();
  }

  destroy() {
    this.container.replaceChildren();
  }
}
