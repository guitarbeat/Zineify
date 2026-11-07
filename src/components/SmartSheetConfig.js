import DOMPurify from 'dompurify';
import {
  PAPER_SIZES,
  MARGIN_MIN,
  MARGIN_MAX,
  UNITS,
  toMm,

  formatDimension,
  resolvePaperSize,
} from '../utils/config.js';

const PAPER_SIZES_ARRAY = Object.entries(PAPER_SIZES);

const DEFAULT_ROWS = 2;
const DEFAULT_COLS = 4;

const PAPER_RECOMMENDATIONS = {
  'a4': { best: 'landscape', reason: 'Optimal for mini-zine folding' },
  'letter': { best: 'landscape', reason: 'Standard US format, good margins' },
  'a3': { best: 'landscape', reason: 'Great for double-mini format' },
  'legal': { best: 'landscape', reason: 'Extra height for longer content' },
  'a5': { best: 'landscape', reason: 'Compact format, great for cards' }
};

export class SmartSheetConfig {
  constructor(container, options = {}) {
    this.container = container;
    this.options = {
      initialRows: DEFAULT_ROWS,
      initialCols: DEFAULT_COLS,
      initialPaper: 'letter',
      initialOrientation: 'landscape',
      initialPaperColor: '#ffffff',
      initialUnit: 'in',
      onChange: () => {},
      ...options
    };

    const seedPaper = PAPER_SIZES[this.options.initialPaper] || PAPER_SIZES.letter;

    this.state = {
      rows: Number(this.options.initialRows) || DEFAULT_ROWS,
      cols: Number(this.options.initialCols) || DEFAULT_COLS,
      layoutPresetId: 'mini-8',
      paperSize: this.options.initialPaper,
      orientation: this.options.initialOrientation,
      paperColor: this.options.initialPaperColor || '#ffffff',
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
    const currentPaper = resolvePaperSize(paperSize, this.state.customPaper);
    const paperWidth = currentPaper.width;
    const paperHeight = currentPaper.height;
    const landscapeW = fmt(Math.max(paperWidth, paperHeight));
    const landscapeH = fmt(Math.min(paperWidth, paperHeight));

    const paperLabel = isCustom ? 'Custom' : (PAPER_SIZES[paperSize]?.label || paperSize.toUpperCase());

    const summaryEl = document.getElementById('settings-summary-accessory');
    if (summaryEl) {
      summaryEl.textContent = `${paperLabel} • 8-Page Mini`;
    }

    document.querySelectorAll('.smart-sheet-unit-btn').forEach((btn) => {
      const isActive = btn.dataset.unit === unit;
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-pressed', String(isActive));
    });

    const fragment = DOMPurify.sanitize(`
      <div class="smart-sheet-config smart-sheet-body-controls">
              <div class="smart-sheet-inline-row">
                <select class="smart-sheet-select" data-field="paperSize" aria-label="Paper size">
                  ${PAPER_SIZES_ARRAY.map(([key, p]) => `
                    <option value="${key}" ${paperSize === key ? 'selected' : ''}>
                      ${p.label} (${fmt(p.width)}×${fmt(p.height)}${unitDef.label})
                    </option>
                  `).join('')}
                  <option value="custom" ${isCustom ? 'selected' : ''}>Custom size…</option>
                </select>
                <div class="smart-sheet-unit-seg" role="group" aria-label="Measurement units">
                  <button type="button" class="smart-sheet-unit-btn ${unit === 'in' ? 'is-active' : ''}" data-unit="in" aria-pressed="${unit === 'in'}">in</button>
                  <button type="button" class="smart-sheet-unit-btn ${unit === 'mm' ? 'is-active' : ''}" data-unit="mm" aria-pressed="${unit === 'mm'}">mm</button>
                </div>
              </div>

              ${isCustom ? `
              <div class="smart-sheet-custom-size">
                <label class="smart-sheet-custom-field">
                  <span class="smart-sheet-custom-caption">W</span>
                  <input type="number" class="smart-sheet-custom-input" data-field="customWidth"
                    min="1" step="${unitDef.inputStep}"
                    value="${formatDimension(this.state.customPaper.width, unit)}"
                    aria-label="Custom width in ${unitDef.label}" />
                </label>
                <span class="smart-sheet-custom-x">×</span>
                <label class="smart-sheet-custom-field">
                  <span class="smart-sheet-custom-caption">H</span>
                  <input type="number" class="smart-sheet-custom-input" data-field="customHeight"
                    min="1" step="${unitDef.inputStep}"
                    value="${formatDimension(this.state.customPaper.height, unit)}"
                    aria-label="Custom height in ${unitDef.label}" />
                </label>
                <span class="smart-sheet-custom-unit">${unitDef.label}</span>
              </div>
              ` : `
              <div class="smart-sheet-dim-tag" title="Landscape ${landscapeW} × ${landscapeH} ${unitDef.label}">
                <span>${landscapeW} × ${landscapeH} ${unitDef.label} (Landscape)</span>
              </div>
              `}

              <span class="smart-sheet-paper-recommend sr-only ${isRecommended && !isCustom ? 'is-visible' : ''}">
                ${recommendation?.reason || ''}
              </span>

              <div class="smart-sheet-margin-inline-row">
                <span class="smart-sheet-label">Margin</span>
                <input
                  type="range"
                  class="smart-sheet-margin-slider"
                  data-field="margin"
                  min="${MARGIN_MIN}"
                  max="${MARGIN_MAX}"
                  step="0.5"
                  value="${margin}"
                  aria-label="Sheet margin in ${unitDef.label}" />
                <div class="smart-sheet-margin-stepper">
                  <button type="button" class="smart-sheet-stepper-btn" data-margin-delta="-1" aria-label="Decrease margin" ${margin <= MARGIN_MIN ? 'disabled' : ''}>
                    <span class="material-symbols-outlined">remove</span>
                  </button>
                  <span class="smart-sheet-margin-value">
                    <span data-margin-display>${formatDimension(margin, unit)}</span><span class="smart-sheet-times">${unitDef.label}</span>
                  </span>
                  <button type="button" class="smart-sheet-stepper-btn" data-margin-delta="1" aria-label="Increase margin" ${margin >= MARGIN_MAX ? 'disabled' : ''}>
                    <span class="material-symbols-outlined">add</span>
                  </button>
                </div>
              </div>

              <div class="smart-sheet-paper-color-row">
                <span class="smart-sheet-label">Paper color</span>
                <div class="smart-sheet-color-picker-wrap">
                  <input type="color" class="smart-sheet-color-input" data-field="paperColor" value="${this.state.paperColor || '#ffffff'}" aria-label="Paper color picker" />
                  <input type="text" class="smart-sheet-color-hex" data-field="paperColorHex" value="${this.state.paperColor || '#ffffff'}" maxlength="7" spellcheck="false" aria-label="Hex color" />
                  <button type="button" class="smart-sheet-color-reset" data-action="resetColor" title="Reset to white (#ffffff)" ${this.state.paperColor === '#ffffff' ? 'disabled' : ''}>
                    White
                  </button>
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

    const cardSettings = document.getElementById('card-settings');
    if (cardSettings) {
      cardSettings.addEventListener('click', (e) => {
        const unitBtn = e.target.closest('.smart-sheet-unit-btn');
        if (unitBtn && !this.container.contains(unitBtn)) {
          this.setUnit(unitBtn.dataset.unit);
        }
      });
    }
  }

  handleClick(e) {
    const unitBtn = e.target.closest('.smart-sheet-unit-btn');
    if (unitBtn) {
      this.setUnit(unitBtn.dataset.unit);
      return;
    }

    const marginBtn = e.target.closest('[data-margin-delta]');
    if (marginBtn) {
      const sign = parseInt(marginBtn.dataset.marginDelta, 10) || 0;
      const unitDef = UNITS[this.state.unit] || UNITS.mm;
      const stepMm = toMm(unitDef.marginStep, this.state.unit);
      this.setMargin(this.state.margin + sign * stepMm);
      return;
    }

    if (e.target.closest('[data-action="resetColor"]')) {
      this.setPaperColor('#ffffff');
    }
  }

  handleChange(e) {
    if (e.target.matches('.smart-sheet-select')) {
      this.setPaperSize(e.target.value);
      return;
    }

    if (e.target.matches('[data-field="customWidth"], [data-field="customHeight"]')) {
      this.setCustomDimension(e.target.dataset.field, e.target.value);
      return;
    }

    if (e.target.matches('[data-field="paperColor"]')) {
      this.setPaperColor(e.target.value);
      return;
    }

    if (e.target.matches('[data-field="paperColorHex"]')) {
      const hex = e.target.value.trim();
      if (/^#[0-9a-fA-F]{6}$/.test(hex) || /^#[0-9a-fA-F]{3}$/.test(hex)) {
        this.setPaperColor(hex);
      } else {
        e.target.value = this.state.paperColor || '#ffffff';
      }
    }
  }

  handleInput(e) {
    if (e.target.matches('.smart-sheet-margin-slider')) {
      // Live-update the displayed value while dragging without a full re-render.
      const value = this.clampMargin(parseFloat(e.target.value));
      this.state.margin = value;
      const display = this.container.querySelector('[data-margin-display]');
      if (display) {display.textContent = formatDimension(value, this.state.unit);}
      const summaryEl = document.getElementById('settings-summary-accessory');
      if (summaryEl) {
        const isCustom = this.state.paperSize === 'custom';
        const paperLabel = isCustom ? 'Custom' : (PAPER_SIZES[this.state.paperSize]?.label || this.state.paperSize.toUpperCase());
        summaryEl.textContent = `${paperLabel} • ${this.state.rows}×${this.state.cols}`;
      }
      this.emitChange();
      return;
    }

    if (e.target.matches('[data-field="paperColor"]')) {
      const hexInput = this.container.querySelector('[data-field="paperColorHex"]');
      if (hexInput) { hexInput.value = e.target.value; }
      this.setPaperColor(e.target.value, false);
      return;
    }

    if (e.target.matches('[data-field="paperColorHex"]')) {
      const hex = e.target.value.trim();
      if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
        const picker = this.container.querySelector('[data-field="paperColor"]');
        if (picker) { picker.value = hex; }
        this.setPaperColor(hex, false);
      }
    }
  }

  setPaperColor(color, reRender = true) {
    this.state.paperColor = color || '#ffffff';
    if (reRender) {
      this.render();
    }
    this.emitChange();
  }

  clampMargin(value) {
    if (Number.isNaN(value)) {return MARGIN_MIN;}
    return Math.min(MARGIN_MAX, Math.max(MARGIN_MIN, value));
  }

  setMargin(margin) {
    this.state.margin = this.clampMargin(margin);
    this.render();
    this.emitChange();
  }

  setOrientation(_orientation) {
    this.state.orientation = 'landscape';
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
    this.state.orientation = 'landscape';
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
      paperColor: this.state.paperColor,
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
