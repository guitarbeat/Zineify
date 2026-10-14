import DOMPurify from 'dompurify';
import { test, expect } from '@playwright/test';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

test.describe('FormValidationService Tests', () => {
  let initSettingsValidation;
  let clampFieldValue;
  let GRID_DIMENSION_MAX, GRID_DIMENSION_MIN, MARGIN_MAX;

  test.beforeEach(async () => {
    const { JSDOM } = require('jsdom');
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
    global.window = dom.window;
    global.document = dom.window.document;
    global.HTMLElement = dom.window.HTMLElement;

    const FormValidationService = await import('../../../src/services/FormValidationService.js');
    initSettingsValidation = FormValidationService.initSettingsValidation;
    clampFieldValue = FormValidationService.clampFieldValue;

    const config = await import('../../../src/utils/config.js');
    GRID_DIMENSION_MAX = config.GRID_DIMENSION_MAX;
    GRID_DIMENSION_MIN = config.GRID_DIMENSION_MIN;
    MARGIN_MAX = config.MARGIN_MAX;

    document.body.innerHTML = `
      <div id="test-container">
        <div id="settings-group">
          <input id="grid-rows" type="number" value="4" />
          <input id="grid-cols" type="number" value="2" />
          <input id="margin-input" type="number" value="10" />
          <select id="paper-size-select">
            <option value="A4">A4</option>
          </select>
          <div id="grid-total">8 slots</div>
        </div>
        <div id="demo-container"></div>
      </div>
    `;
  });

  test.afterEach(() => {
    delete global.window;
    delete global.document;
    delete global.HTMLElement;
  });

  test.describe('clampFieldValue', () => {
    test('clamps values below minimum to min', () => {
      const field = { value: '0' };
      clampFieldValue(field, 1, 10);
      expect(field.value).toBe(1);

      const fieldNegative = { value: '-5' };
      clampFieldValue(fieldNegative, 1, 10);
      expect(fieldNegative.value).toBe(1);
    });

    test('clamps values above maximum to max', () => {
      const field = { value: '15' };
      clampFieldValue(field, 1, 10);
      expect(field.value).toBe(10);
    });

    test('leaves valid values within range intact', () => {
      const field = { value: '5' };
      clampFieldValue(field, 1, 10);
      expect(field.value).toBe('5');
    });

    test('leaves boundary values intact', () => {
      const fieldMin = { value: '1' };
      clampFieldValue(fieldMin, 1, 10);
      expect(fieldMin.value).toBe('1');

      const fieldMax = { value: '10' };
      clampFieldValue(fieldMax, 1, 10);
      expect(fieldMax.value).toBe('10');
    });

    test('clamps non-numeric, empty, or NaN values to min', () => {
      const fieldInvalid = { value: 'abc' };
      clampFieldValue(fieldInvalid, 1, 10);
      expect(fieldInvalid.value).toBe(1);

      const fieldEmpty = { value: '' };
      clampFieldValue(fieldEmpty, 1, 10);
      expect(fieldEmpty.value).toBe(1);
    });

    test('works with DOM HTMLInputElement instances', () => {
      const input = document.createElement('input');

      input.value = '100';
      clampFieldValue(input, 1, 10);
      expect(input.value).toBe('10');

      input.value = '-10';
      clampFieldValue(input, 1, 10);
      expect(input.value).toBe('1');

      input.value = 'invalid';
      clampFieldValue(input, 1, 10);
      expect(input.value).toBe('1');

      input.value = '7';
      clampFieldValue(input, 1, 10);
      expect(input.value).toBe('7');
    });
  });

  test.describe('initSettingsValidation', () => {
    test('returns null if settings form is not found', () => {
      const emptyContainer = document.createElement('div');
      const validator = initSettingsValidation(emptyContainer);
      expect(validator).toBeNull();
    });

    test('initializes validator and clamps row value to MIN on invalid change', () => {
      const container = document.getElementById('test-container');
      let totalUpdated = false;
      const mockUiManager = {
        updateGridTotalBadge: (rows, cols) => {
          totalUpdated = true;
          const totalEl = document.getElementById('grid-total');
          if (totalEl) totalEl.textContent = `${rows * cols} slots`;
        }
      };

      const validator = initSettingsValidation(container, mockUiManager);
      expect(validator).not.toBeNull();

      const gridRowsInput = document.getElementById('grid-rows');
      gridRowsInput.value = GRID_DIMENSION_MIN - 1;

      const rowConfig = validator.fieldConfigs.get('grid-rows') || validator.fieldConfigs.get('#grid-rows');
      expect(rowConfig).toBeDefined();

      rowConfig.onValidationChange({ isValid: false }, gridRowsInput);

      expect(gridRowsInput.value).toBe(GRID_DIMENSION_MIN.toString());
      expect(totalUpdated).toBe(true);

      const totalEl = document.getElementById('grid-total');
      const rows = parseInt(gridRowsInput.value, 10);
      const cols = parseInt(document.getElementById('grid-cols').value, 10);
      expect(totalEl.textContent).toBe(`${rows * cols} slots`);
    });

    test('clamps row value to MAX on invalid change', () => {
      const container = document.getElementById('test-container');
      const validator = initSettingsValidation(container);

      const gridRowsInput = document.getElementById('grid-rows');
      gridRowsInput.value = GRID_DIMENSION_MAX + 1;

      const rowConfig = validator.fieldConfigs.get('grid-rows') || validator.fieldConfigs.get('#grid-rows');
      rowConfig.onValidationChange({ isValid: false }, gridRowsInput);

      expect(gridRowsInput.value).toBe(GRID_DIMENSION_MAX.toString());
    });

    test('clamps col value to MIN on invalid change', () => {
      const container = document.getElementById('test-container');
      const validator = initSettingsValidation(container);

      const gridColsInput = document.getElementById('grid-cols');
      gridColsInput.value = GRID_DIMENSION_MIN - 1;

      const colConfig = validator.fieldConfigs.get('grid-cols') || validator.fieldConfigs.get('#grid-cols');
      colConfig.onValidationChange({ isValid: false }, gridColsInput);

      expect(gridColsInput.value).toBe(GRID_DIMENSION_MIN.toString());
    });

    test('clamps margin value to MAX on invalid change', () => {
      const container = document.getElementById('test-container');
      const validator = initSettingsValidation(container);

      const marginInput = document.getElementById('margin-input');
      marginInput.value = MARGIN_MAX + 10;

      const marginConfig = validator.fieldConfigs.get('margin-input') || validator.fieldConfigs.get('#margin-input');
      marginConfig.onValidationChange({ isValid: false }, marginInput);

      expect(marginInput.value).toBe(MARGIN_MAX.toString());
    });
  });

  test.describe('updateGridTotal', () => {
    test('calls uiManager.updateGridTotalBadge when uiManager is provided', () => {
      let calledRows = 0;
      let calledCols = 0;
      const mockUiManager = {
        updateGridTotalBadge: (rows, cols) => {
          calledRows = rows;
          calledCols = cols;
        }
      };

      updateGridTotal(3, 4, mockUiManager);
      expect(calledRows).toBe(3);
      expect(calledCols).toBe(4);
    });

    test('updates gridTotalEl textContent when gridTotalEl is provided and uiManager is null', () => {
      const el = document.createElement('div');
      updateGridTotal('2', '5', null, el);
      expect(el.textContent).toBe('10 slots');
    });

    test('defaults invalid numeric row/col inputs to 1', () => {
      const el = document.createElement('div');
      updateGridTotal('invalid', null, null, el);
      expect(el.textContent).toBe('1 slots');
    });

    test('handles missing uiManager and gridTotalEl safely without throwing', () => {
      expect(() => updateGridTotal(3, 3)).not.toThrow();
    });
  });
});
