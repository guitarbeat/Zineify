import DOMPurify from 'dompurify';
import { test, expect } from '@playwright/test';
import { SmartSheetConfig } from '../../../src/components/SmartSheetConfig.js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
import { MARGIN_MAX, MARGIN_MIN, UNITS, PAPER_SIZES, toMm, LAYOUT_PRESETS } from '../../../src/utils/config.js';

test.describe('SmartSheetConfig Component', () => {
  let dom;
  let container;
  let originalWindow;
  let originalDocument;

  test.beforeEach(() => {
    dom = new JSDOM('<!DOCTYPE html><div id="container"></div>');

    // Save original globals if they exist in node test env
    originalWindow = global.window;
    originalDocument = global.document;

    global.window = dom.window;
    global.document = dom.window.document;
    const purify = DOMPurify(dom.window);
    DOMPurify.sanitize = purify.sanitize;

    container = document.getElementById('container');
  });

  test.afterEach(() => {
    global.window = originalWindow;
    global.document = originalDocument;
  });

  test('initializes with default options', () => {
    const config = new SmartSheetConfig(container);
    expect(config.state.paperSize).toBe('letter');
    expect(config.state.orientation).toBe('landscape');
    expect(config.state.unit).toBe('in');
    expect(config.state.margin).toBe(0);
    expect(config.state.customPaper.width).toBe(PAPER_SIZES.letter.width);
    expect(config.state.customPaper.height).toBe(PAPER_SIZES.letter.height);

    // Check initial render
    expect(container.querySelector('.smart-sheet-config')).toBeTruthy();
    expect(container.querySelector('select[data-field="paperSize"]').value).toBe('letter');
    expect(container.querySelector('.smart-sheet-orientation-btn[data-value="landscape"]').classList.contains('is-active')).toBe(true);
    expect(container.querySelector('.smart-sheet-unit-btn[data-unit="in"]').classList.contains('is-active')).toBe(true);
  });

  test('initializes with custom options', () => {
    const config = new SmartSheetConfig(container, {
      initialPaper: 'a4',
      initialOrientation: 'portrait',
      initialUnit: 'mm'
    });
    expect(config.state.paperSize).toBe('a4');
    expect(config.state.orientation).toBe('portrait');
    expect(config.state.unit).toBe('mm');
    expect(config.state.customPaper.width).toBe(PAPER_SIZES.a4.width);

    expect(container.querySelector('select[data-field="paperSize"]').value).toBe('a4');
    expect(container.querySelector('.smart-sheet-orientation-btn[data-value="portrait"]').classList.contains('is-active')).toBe(true);
  });

  test('emits onChange when unit is changed', () => {
    let emitted = null;
    const config = new SmartSheetConfig(container, {
      onChange: (state) => { emitted = state; }
    });

    const mmBtn = container.querySelector('.smart-sheet-unit-btn[data-unit="mm"]');
    mmBtn.click();

    expect(config.state.unit).toBe('mm');
    expect(emitted.unit).toBe('mm');
  });

  test('ignores setting invalid unit or same unit', () => {
    let callCount = 0;
    const config = new SmartSheetConfig(container, {
      initialUnit: 'mm',
      onChange: () => { callCount++; }
    });

    // Same unit
    config.setUnit('mm');
    expect(callCount).toBe(0);

    // Invalid unit
    config.setUnit('invalid-unit');
    expect(callCount).toBe(0);
    expect(config.state.unit).toBe('mm');
  });

  test('emits onChange when orientation is changed', () => {
    let emitted = null;
    const config = new SmartSheetConfig(container, {
      initialOrientation: 'landscape',
      onChange: (state) => { emitted = state; }
    });

    const portraitBtn = container.querySelector('.smart-sheet-orientation-btn[data-value="portrait"]');
    portraitBtn.click();

    expect(config.state.orientation).toBe('portrait');
    expect(emitted.orientation).toBe('portrait');
  });

  test('ignores invalid orientation', () => {
    let emitted = null;
    const config = new SmartSheetConfig(container, {
      initialOrientation: 'landscape',
      onChange: (state) => { emitted = state; }
    });

    config.setOrientation('invalid-orientation');
    expect(config.state.orientation).toBe('landscape');
    expect(emitted).toBeNull();
  });

  test('changes paper size and updates recommendation', () => {
    let emitted = null;
    const config = new SmartSheetConfig(container, {
      initialPaper: 'letter',
      onChange: (state) => { emitted = state; }
    });

    const select = container.querySelector('select[data-field="paperSize"]');
    select.value = 'a4';
    select.dispatchEvent(new dom.window.Event('change', { bubbles: true }));

    expect(config.state.paperSize).toBe('a4');
    expect(emitted.paperSize).toBe('a4');

    // A4 best orientation is portrait, should auto-update
    expect(config.state.orientation).toBe('portrait');
    expect(emitted.orientation).toBe('portrait');
  });

  test('shows custom paper inputs when "custom" is selected', () => {
    const config = new SmartSheetConfig(container, { initialPaper: 'letter' });

    // Initially custom inputs should not exist
    expect(container.querySelector('.smart-sheet-custom-size')).toBeFalsy();

    const select = container.querySelector('select[data-field="paperSize"]');
    select.value = 'custom';
    select.dispatchEvent(new dom.window.Event('change', { bubbles: true }));

    expect(config.state.paperSize).toBe('custom');

    // Custom inputs should now exist
    expect(container.querySelector('.smart-sheet-custom-size')).toBeTruthy();
    const widthInput = container.querySelector('[data-field="customWidth"]');
    const heightInput = container.querySelector('[data-field="customHeight"]');
    expect(widthInput).toBeTruthy();
    expect(heightInput).toBeTruthy();
  });

  test('updates custom dimensions on width/height change', () => {
    let emitted = null;
    const config = new SmartSheetConfig(container, {
      initialPaper: 'custom',
      initialUnit: 'mm',
      onChange: (state) => { emitted = state; }
    });

    const widthInput = container.querySelector('[data-field="customWidth"]');
    widthInput.value = '300';
    widthInput.dispatchEvent(new dom.window.Event('change', { bubbles: true }));

    expect(config.state.customPaper.width).toBe(300);
    expect(emitted.customPaper.width).toBe(300);

    const heightInput = container.querySelector('[data-field="customHeight"]');
    heightInput.value = '400';
    heightInput.dispatchEvent(new dom.window.Event('change', { bubbles: true }));

    expect(config.state.customPaper.height).toBe(400);
    expect(emitted.customPaper.height).toBe(400);
  });

  test('handles invalid/non-numeric values for custom dimensions', () => {
    const config = new SmartSheetConfig(container, {
      initialPaper: 'custom',
      initialUnit: 'mm'
    });

    const widthInput = container.querySelector('[data-field="customWidth"]');
    widthInput.value = 'invalid';
    widthInput.dispatchEvent(new dom.window.Event('change', { bubbles: true }));

    // Non-finite mm defaults to 1
    expect(config.state.customPaper.width).toBe(1);

    const heightInput = container.querySelector('[data-field="customHeight"]');
    heightInput.value = '-50';
    heightInput.dispatchEvent(new dom.window.Event('change', { bubbles: true }));

    // Clamped to minimum of 1
    expect(config.state.customPaper.height).toBe(1);
  });

  test('handles layout preset selection', () => {
    let emitted = null;
    const config = new SmartSheetConfig(container, {
      onChange: (state) => { emitted = state; }
    });

    // Find a preset button (e.g., mini-8 or standard-4)
    const presetBtn = container.querySelector('[data-preset="standard-4"]');
    if (presetBtn) {
      presetBtn.click();
      expect(config.state.layoutPresetId).toBe('standard-4');
      expect(config.state.rows).toBe(LAYOUT_PRESETS['standard-4'].sheetGrid.rows);
      expect(config.state.cols).toBe(LAYOUT_PRESETS['standard-4'].sheetGrid.cols);
      expect(emitted.layoutPresetId).toBe('standard-4');
    }
  });

  test('keeps the fixed mini-zine layout without a preset picker', () => {
    const config = new SmartSheetConfig(container);

    expect(config.state.layoutPresetId).toBe('mini-8');
    expect(config.state.rows).toBe(2);
    expect(config.state.cols).toBe(4);
    expect(container.querySelector('[data-preset]')).toBeNull();
  });

  test('ignores legacy custom row/col inputs', () => {
    let emitted = null;
    const config = new SmartSheetConfig(container, {
      onChange: (state) => { emitted = state; }
    });

    let rowsInput = document.createElement('input');
    rowsInput.dataset.field = 'rows';
    rowsInput.value = '3';
    container.appendChild(rowsInput);
    rowsInput.dispatchEvent(new dom.window.Event('change', { bubbles: true }));

    expect(config.state.rows).toBe(2);
    expect(config.state.layoutPresetId).toBe('mini-8');

    let colsInput = document.createElement('input');
    colsInput.dataset.field = 'cols';
    colsInput.value = '5';
    container.appendChild(colsInput);
    colsInput.dispatchEvent(new dom.window.Event('change', { bubbles: true }));

    expect(config.state.cols).toBe(4);
    expect(emitted).toBeNull();
  });

  test('keeps fixed row/col values when legacy inputs contain invalid values', () => {
    const config = new SmartSheetConfig(container);

    // Max clamp test
    let rowsInput = document.createElement('input');
    rowsInput.dataset.field = 'rows';
    rowsInput.value = '20';
    container.appendChild(rowsInput);
    rowsInput.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    expect(config.state.rows).toBe(2);

    // Min clamp test
    rowsInput = document.createElement('input');
    rowsInput.dataset.field = 'rows';
    rowsInput.value = '-5';
    container.appendChild(rowsInput);
    rowsInput.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    expect(config.state.rows).toBe(2);

    // NaN fallback test
    rowsInput = document.createElement('input');
    rowsInput.dataset.field = 'rows';
    rowsInput.value = 'not-a-number';
    container.appendChild(rowsInput);
    rowsInput.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    expect(config.state.rows).toBe(2);
    expect(config.state.cols).toBe(4);
  });

  test('handles margin slider input and clamps', () => {
    let emitted = null;
    const config = new SmartSheetConfig(container, {
      onChange: (state) => { emitted = state; }
    });

    const slider = container.querySelector('.smart-sheet-margin-slider');

    // Valid value
    slider.value = '10';
    slider.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    expect(config.state.margin).toBe(10);
    expect(emitted.margin).toBe(10);

    // Clamp to min
    slider.value = '-5';
    slider.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    expect(config.state.margin).toBe(MARGIN_MIN);

    // Clamp to max
    slider.value = `${MARGIN_MAX + 10}`;
    slider.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    expect(config.state.margin).toBe(MARGIN_MAX);
  });

  test('clampMargin fallback handles NaN and boundary values', () => {
    const config = new SmartSheetConfig(container);

    expect(config.clampMargin(NaN)).toBe(MARGIN_MIN);
    expect(config.clampMargin(-100)).toBe(MARGIN_MIN);
    expect(config.clampMargin(1000)).toBe(MARGIN_MAX);
    expect(config.clampMargin(5)).toBe(5);
  });

  test('handles margin stepper buttons', () => {
    const config = new SmartSheetConfig(container, {
      initialUnit: 'mm'
    });
    config.setMargin(10);

    const increaseBtn = container.querySelector('[data-margin-delta="1"]');
    increaseBtn.click();

    const stepMm = toMm(UNITS['mm'].marginStep, 'mm');
    expect(config.state.margin).toBe(10 + stepMm);

    const decreaseBtn = container.querySelector('[data-margin-delta="-1"]');
    decreaseBtn.click();
    expect(config.state.margin).toBe(10);
  });

  test('ignores clicks and changes on non-matching elements', () => {
    const config = new SmartSheetConfig(container);

    // Click container root directly
    container.click();
    expect(config.state.paperSize).toBe('letter');

    // Change event on an unrelated input
    const dummyInput = document.createElement('input');
    container.appendChild(dummyInput);
    dummyInput.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    expect(config.state.paperSize).toBe('letter');

    // Input event on an unrelated input
    dummyInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    expect(config.state.margin).toBe(0);
  });

  test('getState and setState function correctly', () => {
    const config = new SmartSheetConfig(container);

    const state = config.getState();
    expect(state.paperSize).toBe('letter');
    expect(state.totalSlots).toBe(8);

    config.setState({ paperSize: 'a4', orientation: 'portrait' });
    expect(config.state.paperSize).toBe('a4');
    expect(config.state.orientation).toBe('portrait');

    const select = container.querySelector('select[data-field="paperSize"]');
    expect(select.value).toBe('a4');
  });


  test("handles invalid initialPaper and initialUnit fallbacks in constructor", () => {
    const config = new SmartSheetConfig(container, {
      initialPaper: "invalid-paper-size",
      initialUnit: "invalid-unit"
    });

    expect(config.state.paperSize).toBe("invalid-paper-size");
    expect(config.state.unit).toBe("in");
    // customPaper seeded from letter since invalid-paper-size was not in PAPER_SIZES
    expect(config.state.customPaper.width).toBe(215.9);
    expect(config.state.customPaper.height).toBe(279.4);
  });

  test("paper recommendation badge visibility and text rendering", () => {
    // a4 best is portrait
    const config = new SmartSheetConfig(container, {
      initialPaper: "a4",
      initialOrientation: "portrait"
    });

    let recommendEl = container.querySelector(".smart-sheet-paper-recommend");
    expect(recommendEl.classList.contains("is-visible")).toBe(true);
    expect(recommendEl.textContent).toContain("Optimal for mini-zine folding");

    // Change orientation to landscape -> recommendation is-visible should be false
    const landscapeBtn = container.querySelector(".smart-sheet-orientation-btn[data-value=\"landscape\"]");
    landscapeBtn.click();
    recommendEl = container.querySelector(".smart-sheet-paper-recommend");
    expect(recommendEl.classList.contains("is-visible")).toBe(false);

    // Custom paper size -> recommendation is-visible should be false
    const select = container.querySelector("select[data-field=\"paperSize\"]");
    select.value = "custom";
    select.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    recommendEl = container.querySelector(".smart-sheet-paper-recommend");
    expect(recommendEl.classList.contains("is-visible")).toBe(false);
  });

  test("disables margin stepper buttons at boundaries", () => {
    const config = new SmartSheetConfig(container);

    // At MARGIN_MIN (0)
    config.setMargin(MARGIN_MIN);
    let decBtn = container.querySelector("[data-margin-delta=\"-1\"]");
    let incBtn = container.querySelector("[data-margin-delta=\"1\"]");
    expect(decBtn.hasAttribute("disabled")).toBe(true);
    expect(incBtn.hasAttribute("disabled")).toBe(false);

    // At MARGIN_MAX (25)
    config.setMargin(MARGIN_MAX);
    decBtn = container.querySelector("[data-margin-delta=\"-1\"]");
    incBtn = container.querySelector("[data-margin-delta=\"1\"]");
    expect(decBtn.hasAttribute("disabled")).toBe(false);
    expect(incBtn.hasAttribute("disabled")).toBe(true);
  });

  test("handles stepper click with NaN or missing data-margin-delta", () => {
    const config = new SmartSheetConfig(container, { initialUnit: "mm" });
    config.setMargin(10);

    const btn = document.createElement("button");
    btn.className = "smart-sheet-stepper-btn";
    btn.dataset.marginDelta = "not-a-number";
    container.appendChild(btn);

    btn.click();
    // sign is 0, so margin remains 10
    expect(config.state.margin).toBe(10);
  });

  test('handles default onChange options callback', () => {
    const config = new SmartSheetConfig(container);
    // Call methods that trigger emitChange without custom onChange
    config.setMargin(5);
    config.setOrientation('portrait');
    config.setPaperSize('a4');
    expect(config.state.margin).toBe(5);
    expect(config.state.orientation).toBe('portrait');
    expect(config.state.paperSize).toBe('a4');
  });

  test('handles customHeight setting in setCustomDimension', () => {
    let emitted = null;
    const config = new SmartSheetConfig(container, {
      initialPaper: 'custom',
      initialUnit: 'mm',
      onChange: (state) => { emitted = state; }
    });

    config.setCustomDimension('customHeight', '500');
    expect(config.state.customPaper.height).toBe(500);
    expect(emitted.customPaper.height).toBe(500);
  });

  test('handles handleInput margin slider without display element', () => {
    const config = new SmartSheetConfig(container);
    const slider = container.querySelector('.smart-sheet-margin-slider');

    // Remove the display element
    const display = container.querySelector('[data-margin-display]');
    if (display) {
      display.remove();
    }

    slider.value = '15';
    slider.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    expect(config.state.margin).toBe(15);
  });

  test('does not expose the removed variable-layout preset API', () => {
    const config = new SmartSheetConfig(container);

    expect(config.setPreset).toBeUndefined();
    expect(config.getState().totalSlots).toBe(8);
  });

  test("handles margin stepper button clicks with unit conversions (in/cm)", () => {
    const config = new SmartSheetConfig(container, {
      initialUnit: "in"
    });
    config.setMargin(10);

    const increaseBtn = container.querySelector("[data-margin-delta='1']");
    increaseBtn.click();

    expect(config.state.margin).toBe(10 + toMm(UNITS["in"].marginStep, "in"));
  });

  test("handles click on nested child element inside stepper button", () => {
    const config = new SmartSheetConfig(container, { initialUnit: "mm" });
    config.setMargin(10);

    const increaseBtn = container.querySelector("[data-margin-delta='1']");
    const childSpan = increaseBtn.querySelector(".material-symbols-outlined");

    childSpan.click();
    expect(config.state.margin).toBe(10 + toMm(UNITS.mm.marginStep, "mm"));
  });

  test("handles custom paper dimension inputs change events", () => {
    let emitted = null;
    const config = new SmartSheetConfig(container, {
      initialPaper: "custom",
      initialUnit: "mm",
      onChange: (state) => { emitted = state; }
    });

    const widthInput = container.querySelector("input[data-field='customWidth']");
    widthInput.value = "150";
    widthInput.dispatchEvent(new dom.window.Event("change", { bubbles: true }));

    expect(config.state.customPaper.width).toBe(150);
    expect(emitted.customPaper.width).toBe(150);

    const heightInput = container.querySelector("input[data-field='customHeight']");
    heightInput.value = "invalid-num";
    heightInput.dispatchEvent(new dom.window.Event("change", { bubbles: true }));

    expect(config.state.customPaper.height).toBe(1);
    expect(emitted.customPaper.height).toBe(1);
  });

  test("renders custom paper inputs correctly when unit is changed", () => {
    const config = new SmartSheetConfig(container, {
      initialPaper: "custom",
      initialUnit: "mm"
    });

    config.setCustomDimension("customWidth", "254");

    config.setUnit("in");
    const widthInput = container.querySelector("input[data-field='customWidth']");
    expect(widthInput.value).toBe("10");
  });

  test("handles setState partial updates and emits correct state structure", () => {
    let emitted = null;
    const config = new SmartSheetConfig(container, {
      onChange: (state) => { emitted = state; }
    });

    config.setState({ rows: 4, cols: 5 });
    expect(config.state.rows).toBe(4);
    expect(config.state.cols).toBe(5);
    expect(emitted.totalSlots).toBe(20);
  });
  test('destroy clears the container', () => {
    const config = new SmartSheetConfig(container);
    expect(container.innerHTML).not.toBe('');

    config.destroy();
    expect(container.innerHTML).toBe('');
  });
});
