/**
 * Validation integration for Zine-ify form controls
 * Demonstrates user-friendly validation for existing settings
 */

import { FormValidator } from '../components/FormValidator.js';
import { VALIDATION_TIMING, VALIDATION_RULES } from '../utils/formValidation.js';
import { GRID_DIMENSION_MAX, GRID_DIMENSION_MIN, MARGIN_MAX, MARGIN_MIN } from './../utils/config.js';

/**
 * Helper to clamp an input element's value within a min/max range
 * @param {HTMLInputElement} field - The input element
 * @param {number} min - Minimum allowed value
 * @param {number} max - Maximum allowed value
 */
export function clampFieldValue(field, min, max) {
  const value = parseInt(field.value, 10);
  if (isNaN(value) || value < min) {
    field.value = min;
  } else if (value > max) {
    field.value = max;
  }
}

/**
 * Helper to update grid total display or UI badge
 * @param {string|number} rowsVal - Rows count or field value
 * @param {string|number} colsVal - Columns count or field value
 * @param {Object} [uiManager=null] - UIManager instance
 * @param {HTMLElement|null} gridTotalEl - Element showing grid total text
 */
export function updateGridTotal(rowsVal, colsVal, uiManager = null, gridTotalEl = null) {
  const rows = parseInt(rowsVal, 10) || 1;
  const cols = parseInt(colsVal, 10) || 1;
  if (uiManager && typeof uiManager.updateGridTotalBadge === 'function') {
    uiManager.updateGridTotalBadge(rows, cols);
  } else if (gridTotalEl) {
    gridTotalEl.textContent = `${rows * cols} slots`;
  }
}

if (typeof globalThis !== 'undefined') {
  globalThis.updateGridTotal = updateGridTotal;
}

/**
 * Registers validation for grid row and column inputs
 * @param {FormValidator} validator - FormValidator instance
 * @param {HTMLElement|Document} container - Container element
 * @param {Object} [uiManager=null] - UIManager instance
 */
function setupGridDimensionsValidation(validator, container, uiManager = null) {
  const gridRowsInput = container.querySelector('#grid-rows');
  const gridColsInput = container.querySelector('#grid-cols');
  const gridTotalEl = container.querySelector('#grid-total');

  const updateDisplay = (rows, cols) => {
    updateGridTotal(rows, cols, uiManager, gridTotalEl);
  };

  if (gridRowsInput) {
    validator.register('#grid-rows', {
      fieldName: 'Rows',
      rules: [
        VALIDATION_RULES.required,
        VALIDATION_RULES.integer,
        VALIDATION_RULES.min(GRID_DIMENSION_MIN),
        VALIDATION_RULES.max(GRID_DIMENSION_MAX)
      ],
      timing: VALIDATION_TIMING.BLUR,
      constraints: {
        min: GRID_DIMENSION_MIN,
        max: GRID_DIMENSION_MAX,
        format: 'whole numbers only'
      },
      onValidationChange: (result, field) => {
        if (!result.isValid) {
          clampFieldValue(field, GRID_DIMENSION_MIN, GRID_DIMENSION_MAX);
          updateDisplay(field.value, gridColsInput ? gridColsInput.value : 1);
        }
      }
    });
  }

  if (gridColsInput) {
    validator.register('#grid-cols', {
      fieldName: 'Columns',
      rules: [
        VALIDATION_RULES.required,
        VALIDATION_RULES.integer,
        VALIDATION_RULES.min(GRID_DIMENSION_MIN),
        VALIDATION_RULES.max(GRID_DIMENSION_MAX)
      ],
      timing: VALIDATION_TIMING.BLUR,
      constraints: {
        min: GRID_DIMENSION_MIN,
        max: GRID_DIMENSION_MAX,
        format: 'whole numbers only'
      },
      onValidationChange: (result, field) => {
        if (!result.isValid) {
          clampFieldValue(field, GRID_DIMENSION_MIN, GRID_DIMENSION_MAX);
          updateDisplay(gridRowsInput ? gridRowsInput.value : 1, field.value);
        }
      }
    });
  }
}

/**
 * Registers validation for margin input
 * @param {FormValidator} validator - FormValidator instance
 * @param {HTMLElement|Document} container - Container element
 */
function setupMarginValidation(validator, container) {
  const marginInput = container.querySelector('#margin-input');
  if (marginInput) {
    validator.register('#margin-input', {
      fieldName: 'Margin',
      rules: [
        VALIDATION_RULES.required,
        VALIDATION_RULES.integer,
        VALIDATION_RULES.min(MARGIN_MIN),
        VALIDATION_RULES.max(MARGIN_MAX)
      ],
      timing: VALIDATION_TIMING.BLUR,
      constraints: {
        min: MARGIN_MIN,
        max: MARGIN_MAX,
        format: 'mm'
      },
      onValidationChange: (result, field) => {
        if (!result.isValid) {
          clampFieldValue(field, MARGIN_MIN, MARGIN_MAX);
        }
      }
    });
  }
}

/**
 * Registers validation for paper size dropdown
 * @param {FormValidator} validator - FormValidator instance
 * @param {HTMLElement|Document} container - Container element
 */
function setupPaperSizeValidation(validator, container) {
  const paperSizeSelect = container.querySelector('#paper-size-select');
  if (paperSizeSelect) {
    validator.register('#paper-size-select', {
      fieldName: 'Paper Size',
      rules: [VALIDATION_RULES.required],
      timing: VALIDATION_TIMING.BLUR
    });
  }
}

/**
 * Initialize validation for the settings panel
 * @param {HTMLElement|Document} container - The settings container element
 * @param {Object} [uiManager=null] - Optional UIManager instance
 * @returns {FormValidator} The configured validator instance
 */
export function initSettingsValidation(container = document, uiManager = null) {
  const form = container.querySelector('#settings-group') || container.querySelector('.rail-settings-panel');
  if (!form) {
    return null;
  }

  const validator = new FormValidator(form, {
    validateOnSubmit: false, // Settings are auto-applied, no submit button
    showSuccessState: true,
    toastOnSuccess: false,
    focusFirstError: false
  });

  setupGridDimensionsValidation(validator, container, uiManager);
  setupMarginValidation(validator, container);
  setupPaperSizeValidation(validator, container);

  return validator;
}
