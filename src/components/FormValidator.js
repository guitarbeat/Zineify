/**
 * FormValidator.js
 * Inline form validation with immediate visual feedback
 */

import { toast } from './Toast.js';
import {
  FieldStateManager,
  VALIDATION_TIMING,
  FIELD_STATE,
  validateValue,
  createCharacterCounter,
  createConstraintHint
} from '../utils/formValidation.js';
import { debounce } from '../utils/helpers.js';
import DOMPurify from 'dompurify';

/**
 * FormValidator - Manages inline validation for forms
 * Provides immediate feedback, error prevention, and helpful messages
 */
export class FormValidator {
  constructor(formElement, options = {}) {
    this.form = typeof formElement === 'string'
      ? document.querySelector(formElement)
      : formElement;

    if (!this.form) {
      return;
    }

    this.options = {
      validateOnSubmit: true,
      showSuccessState: true,
      toastOnSuccess: true,
      scrollToError: true,
      focusFirstError: true,
      ...options
    };

    this.stateManager = new FieldStateManager();
    this.fieldConfigs = new Map();
    this.errorElements = new Map();
    this.debounceTimers = new Map();
    this.validators = new Map();

    this._init();
  }

  _init() {
    // Set up form submit handler
    this.form.setAttribute('novalidate', '');
    this.form.addEventListener('submit', this._handleSubmit.bind(this));

    // Discover and set up fields with validation
    this._discoverFields();
  }

  /**
   * Register a field for validation
   * @param {string} fieldSelector - CSS selector for the field
   * @param {Object} config - Validation configuration
   */
  register(fieldSelector, config) {
    const field = this.form.querySelector(fieldSelector);
    if (!field) {
      return this;
    }

    const fieldId = field.id || field.name || fieldSelector;

    // Create field configuration
    const fieldConfig = this._createFieldConfig(field, fieldId, config);

    this.fieldConfigs.set(fieldId, fieldConfig);
    this.stateManager.register(fieldId, fieldConfig);

    // Set up event listeners
    this._setupFieldListeners(field, fieldConfig);

    // Add constraint hint if provided
    if (fieldConfig.constraints) {
      this._addConstraintHint(field, fieldConfig.constraints);
    }

    // Initialize character counter if applicable
    if (fieldConfig.constraints?.maxLength) {
      this._setupCharacterCounter(field, fieldConfig);
    }

    return this;
  }

  /**
   * Create field configuration object
   */
  _createFieldConfig(field, fieldId, config) {
    return {
      field,
      fieldId,
      fieldName: config.fieldName || field.labels?.[0]?.textContent || 'Field',
      rules: config.rules || [],
      timing: config.timing || VALIDATION_TIMING.BLUR,
      debounceMs: config.debounceMs || 300,
      showSuccess: config.showSuccess ?? this.options.showSuccessState,
      helpText: config.helpText || null,
      constraints: config.constraints || null,
      onValidationChange: config.onValidationChange || null,
      insertPoint: config.insertPoint || (field.closest('.workspace-config-field')?.querySelector('.stepper')
        ? field.closest('.workspace-config-field')
        : field)
    };
  }

  /**
   * Set up event listeners for a field
   */
  _setupFieldListeners(field, config) {
    const { fieldId, timing, debounceMs } = config;

    // Validate on blur (most common strategy)
    if (timing === VALIDATION_TIMING.BLUR || timing === VALIDATION_TIMING.DEBOUNCED) {
      field.addEventListener('blur', () => {
        this.stateManager.markTouched(fieldId);
        if (timing === VALIDATION_TIMING.BLUR) {
          this._validateField(fieldId);
        }
      });
    }

    // Validate on input (immediate or debounced)
    if (timing === VALIDATION_TIMING.IMMEDIATE || timing === VALIDATION_TIMING.DEBOUNCED) {
      const validateFn = timing === VALIDATION_TIMING.DEBOUNCED
        ? debounce(() => {
            this.stateManager.markDirty(fieldId);
            if (this.stateManager.shouldShowErrors(fieldId)) {
              this._validateField(fieldId);
            }
          }, debounceMs)
        : () => {
            this.stateManager.markDirty(fieldId);
            if (this.stateManager.shouldShowErrors(fieldId)) {
              this._validateField(fieldId);
            }
          };

      field.addEventListener('input', validateFn);
    }

    // Clear errors on focus
    field.addEventListener('focus', () => {
      this._clearFieldError(fieldId);
    });
  }

  /**
   * Validate a single field
   */
  _validateField(fieldId, passedFormData = null) {
    const config = this.fieldConfigs.get(fieldId);
    if (!config) {return { isValid: true, errors: [] };}

    const { field, fieldName, rules } = config;
    const value = this._getFieldValue(field);

    // Get form context for cross-field validation
    const formData = passedFormData || this._getFormData();

    // Run validation
    const result = validateValue(value, rules, {
      fieldName,
      formData
    });

    // Update state
    this.stateManager.setErrors(fieldId, result.errors);

    // Update UI
    this._updateFieldUI(fieldId, result);

    // Notify callback
    if (config.onValidationChange) {
      config.onValidationChange(result, field);
    }

    return result;
  }

  /**
   * Get field value (handles different input types)
   * @param {HTMLElement} field - Field element
   * @param {Map<string, *>} [radioCache] - Optional cache for radio group values during form data extraction
   */
  _getFieldValue(field, radioCache = null) {
    if (field.type === 'checkbox') {return field.checked;}
    if (field.type === 'radio') {
      if (radioCache && radioCache.has(field.name)) {
        return radioCache.get(field.name);
      }
      let value = null;
      const elements = this.form.elements[field.name];
      if (elements) {
        const isIterable = elements.length !== undefined && !elements.tagName;
        if (isIterable) {
          for (let i = 0; i < elements.length; i++) {
            if (elements[i].checked) {
              value = elements[i].value;
              break;
            }
          }
        } else {
          if (elements.checked) {value = elements.value;}
        }
      }
      if (radioCache) {
        radioCache.set(field.name, value);
      }
      return value;
    }
    if (field.type === 'select-multiple') {
      return Array.from(field.selectedOptions).map(opt => opt.value);
    }
    return field.value;
  }

  /**
   * Get all form data for cross-field validation
   */
  _getFormData() {
    const data = {};
    const radioCache = new Map();
    for (const [fieldId, config] of this.fieldConfigs) {
      data[fieldId] = this._getFieldValue(config.field, radioCache);
    }
    return data;
  }

  /**
   * Update field UI with validation result
   */
  _updateFieldUI(fieldId, result) {
    const config = this.fieldConfigs.get(fieldId);
    if (!config) {return;}

    const { field, showSuccess } = config;

    // Update ARIA attributes
    field.setAttribute('aria-invalid', (!result.isValid).toString());

    // Remove existing states
    field.classList.remove('is-valid', 'is-invalid');
    this._removeErrorElement(fieldId);

    if (!result.isValid) {
      // Show error state
      field.classList.add('is-invalid');
      this._showFieldError(fieldId, result.errors[0]);
    } else if (showSuccess && this.stateManager.shouldShowErrors(fieldId)) {
      // Only show success if field has been interacted with
      field.classList.add('is-valid');
      this._showSuccessIndicator(fieldId);
    }
  }

  /**
   * Show error message for a field
   */
  _showFieldError(fieldId, error) {
    const config = this.fieldConfigs.get(fieldId);
    if (!config) {return;}

    const { field, insertPoint } = config;

    // Find or create error container
    let errorElement = this._getErrorElement(fieldId);
    if (!errorElement) {
      errorElement = document.createElement('div');
      errorElement.className = 'form-error';
      errorElement.setAttribute('role', 'alert');
      errorElement.setAttribute('aria-live', 'polite');

      // Insert after field or after field's parent for grid items
      const targetPoint = insertPoint || field;
      targetPoint.insertAdjacentElement('afterend', errorElement);
      this.errorElements.set(fieldId, errorElement);
    }

    // Set error content safely
    errorElement.textContent = error;
    errorElement.dataset.fieldId = fieldId;
  }

  /**
   * Get existing error element for a field
   */
  _getErrorElement(fieldId) {
    const cached = this.errorElements.get(fieldId);
    if (cached && cached.isConnected) {
      return cached;
    }
    const element = this.form.querySelector(`.form-error[data-field-id="${fieldId}"]`);
    if (element) {
      this.errorElements.set(fieldId, element);
    } else {
      this.errorElements.delete(fieldId);
    }
    return element;
  }

  /**
   * Remove error element
   */
  _removeErrorElement(fieldId) {
    const errorElement = this._getErrorElement(fieldId);
    if (errorElement) {
      errorElement.remove();
    }
    this.errorElements.delete(fieldId);
  }

  /**
   * Clear error state for a field
   */
  _clearFieldError(fieldId) {
    const config = this.fieldConfigs.get(fieldId);
    if (!config) {return;}

    config.field.classList.remove('is-invalid');
    this._removeErrorElement(fieldId);
    this._removeSuccessIndicator(fieldId);
  }

  /**
   * Show success indicator for a field
   */
  _showSuccessIndicator(fieldId) {
    const config = this.fieldConfigs.get(fieldId);
    if (!config) {return;}

    const { field } = config;

    // Don't add if already exists
    if (field.parentElement.querySelector('.form-success-icon')) {return;}

    const successIcon = document.createElement('span');
    successIcon.className = 'form-success-icon';
    successIcon.setAttribute('aria-hidden', 'true');

    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('width', '16');
    svg.setAttribute('height', '16');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '3');

    const polyline = document.createElementNS(svgNS, 'polyline');
    polyline.setAttribute('points', '20,6 9,17 4,12');

    svg.appendChild(polyline);
    successIcon.appendChild(svg);

    // Position it appropriately
    const container = field.closest('.workspace-config-field') || field.parentElement;
    container.style.position = 'relative';
    container.appendChild(successIcon);
    successIcon.dataset.fieldId = fieldId;
  }

  /**
   * Remove success indicator
   */
  _removeSuccessIndicator(fieldId) {
    const indicator = this.form.querySelector(`.form-success-icon[data-field-id="${fieldId}"]`);
    if (indicator) {indicator.remove();}
  }

  /**
   * Add constraint hint below a field
   */
  _addConstraintHint(field, constraints) {
    const hint = createConstraintHint(constraints);
    if (!hint) {return;}

    const hintElement = document.createElement('span');
    hintElement.className = 'form-constraint-hint';
    hintElement.textContent = hint;

    const container = field.closest('.workspace-config-field') || field.parentElement;
    container.appendChild(hintElement);
  }

  /**
   * Set up character counter for a field
   */
  _setupCharacterCounter(field, config) {
    const maxLength = config.constraints.maxLength;
    const counter = createCharacterCounter(maxLength);

    const counterElement = document.createElement('span');
    counterElement.className = 'form-char-counter';
    counterElement.setAttribute('aria-live', 'polite');

    const updateCounter = () => {
      const stats = counter.getStats(field.value.length);
      counterElement.textContent = `${field.value.length}/${maxLength}`;
      counterElement.dataset.status = stats.status;
      counterElement.hidden = !stats.shouldShow;
    };

    field.addEventListener('input', updateCounter);
    updateCounter();

    const container = field.closest('.workspace-config-field') || field.parentElement;
    container.appendChild(counterElement);
  }

  /**
   * Discover existing fields with validation attributes
   */
  _discoverFields() {
    if (!FormValidator._parsedRuleCache) {
      FormValidator._parsedRuleCache = new Map();
    }

    const fields = this.form.querySelectorAll('[data-validate]');
    fields.forEach(field => {
      const rules = [];

      // Parse validation rules from data attribute
      const rulesConfig = field.dataset.validate;
      if (rulesConfig) {
        let cachedRules = FormValidator._parsedRuleCache.get(rulesConfig);
        if (!cachedRules) {
          cachedRules = [];
          rulesConfig.split(',').forEach(r => {
            const rule = r.trim();
            if (!rule) {return;}
            const [ruleName, param] = rule.split(':');
            if (param) {
              const numParam = parseFloat(param);
              let ruleObj = null;
              if (ruleName === 'minLength') {ruleObj = { minLength: parseInt(param, 10) };} else if (ruleName === 'maxLength') {ruleObj = { maxLength: parseInt(param, 10) };} else if (ruleName === 'min') {ruleObj = { min: numParam };} else if (ruleName === 'max') {ruleObj = { max: numParam };}
              if (ruleObj) {cachedRules.push(ruleObj);}
            } else {
              cachedRules.push(rule);
            }
          });
          FormValidator._parsedRuleCache.set(rulesConfig, cachedRules);
        }

        cachedRules.forEach(rule => {
          if (typeof rule === 'object' && rule !== null) {
            rules.push({ ...rule });
          } else {
            rules.push(rule);
          }
        }
      }

      // Auto-detect common validation attributes
      if (field.required) {rules.push('required');}
      if (field.type === 'email') {rules.push('email');}
      if (field.type === 'number' || field.dataset.type === 'number') {rules.push('integer');}

      // Auto-detect constraints from attributes
      const constraints = {};
      if (field.minLength) {constraints.minLength = field.minLength;}
      if (field.maxLength) {constraints.maxLength = field.maxLength;}
      if (field.min !== null) {constraints.min = parseFloat(field.min);}
      if (field.max !== null) {constraints.max = parseFloat(field.max);}

      this.register(`#${field.id || field.name}`, {
        rules,
        constraints: Object.keys(constraints).length > 0 ? constraints : null
      });
    });
  }

  /**
   * Handle form submission
   */
  async _handleSubmit(event) {
    // Validate all fields
    let hasErrors = false;
    let firstErrorField = null;

    const formData = this._getFormData();

    for (const [fieldId] of this.fieldConfigs) {
      this.stateManager.setState(fieldId, FIELD_STATE.TOUCHED);
      const result = this._validateField(fieldId, formData);
      if (!result.isValid && !firstErrorField) {
        firstErrorField = this.fieldConfigs.get(fieldId)?.field;
        hasErrors = true;
      }
    }

    if (hasErrors) {
      event.preventDefault();
      event.stopImmediatePropagation();

      if (firstErrorField && this.options.focusFirstError) {
        firstErrorField.focus();
      }

      if (this.options.scrollToError && firstErrorField) {
        firstErrorField.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }

      toast.error('Validation Failed', 'Please correct the highlighted fields');

      return false;
    }

    if (this.options.toastOnSuccess) {
      toast.success('Success', 'Form submitted successfully!');
    }

    return true;
  }

  /**
   * Validate all fields and return result
   */
  validate() {
    let isValid = true;
    const allErrors = {};
    const formData = this._getFormData();

    for (const [fieldId] of this.fieldConfigs) {
      this.stateManager.setState(fieldId, FIELD_STATE.TOUCHED);
      const result = this._validateField(fieldId, formData);
      if (!result.isValid) {
        isValid = false;
        allErrors[fieldId] = result.errors;
      }
    }

    return { isValid, errors: allErrors };
  }

  /**
   * Reset all field states
   */
  reset() {
    for (const [fieldId, config] of this.fieldConfigs) {
      this.stateManager.reset(fieldId);
      config.field.classList.remove('is-valid', 'is-invalid');
      this._removeErrorElement(fieldId);
      this._removeSuccessIndicator(fieldId);
    }
  }

  /**
   * Validate a specific field programmatically
   */
  validateField(fieldId) {
    this.stateManager.setState(fieldId, FIELD_STATE.TOUCHED);
    return this._validateField(fieldId);
  }

  /**
   * Add a validation rule dynamically
   */
  addRule(fieldId, rule) {
    const config = this.fieldConfigs.get(fieldId);
    if (config) {
      config.rules.push(rule);
    }
  }

  /**
   * Get current validation state
   */
  getState() {
    return {
      isValid: this.stateManager.isFormValid(),
      hasErrors: this.stateManager.hasErrors(),
      fields: Object.fromEntries(this.stateManager.fields)
    };
  }
}

/**
 * Factory function to create a FormValidator
 */
export function createFormValidator(formSelector, options) {
  return new FormValidator(formSelector, options);
}

/**
 * Standalone field validator for single fields
 */
export class FieldValidator {
  constructor(field, options = {}) {
    this.field = typeof field === 'string'
      ? document.querySelector(field)
      : field;

    if (!this.field) {
      return;
    }

    this.options = {
      rules: [],
      timing: VALIDATION_TIMING.BLUR,
      showSuccess: true,
      ...options
    };

    this.stateManager = new FieldStateManager();
    this.fieldId = this.field.id || this.field.name || 'field';
    this.stateManager.register(this.fieldId, { rules: this.options.rules });

    this._init();
  }

  _init() {
    // Set up event listeners
    const { timing } = this.options;

    if (timing === VALIDATION_TIMING.BLUR || timing === VALIDATION_TIMING.DEBOUNCED) {
      this.field.addEventListener('blur', () => {
        this.stateManager.markTouched(this.fieldId);
        this.validate();
      });
    }

    if (timing === VALIDATION_TIMING.IMMEDIATE || timing === VALIDATION_TIMING.DEBOUNCED) {
      const validateFn = timing === VALIDATION_TIMING.DEBOUNCED
        ? debounce(() => this.validate(), this.options.debounceMs || 300)
        : () => this.validate();

      this.field.addEventListener('input', () => {
        this.stateManager.markDirty(this.fieldId);
        if (this.stateManager.shouldShowErrors(this.fieldId)) {
          validateFn();
        }
      });
    }
  }

  validate() {
    const value = this.field.value;
    const result = validateValue(value, this.options.rules, {
      fieldName: this.options.fieldName || 'Field'
    });

    this.stateManager.setErrors(this.fieldId, result.errors);

    // Update UI
    this.field.classList.remove('is-valid', 'is-invalid');
    const existingError = this.field.parentElement.querySelector('.form-error');
    if (existingError) {existingError.remove();}

    if (!result.isValid) {
      this.field.classList.add('is-invalid');
      this.field.setAttribute('aria-invalid', 'true');

      const errorEl = document.createElement('div');
      errorEl.className = 'form-error';
      errorEl.setAttribute('role', 'alert');
      errorEl.textContent = result.errors[0];
      this.field.insertAdjacentElement('afterend', errorEl);
    } else if (this.options.showSuccess && this.stateManager.shouldShowErrors(this.fieldId)) {
      this.field.classList.add('is-valid');
      this.field.setAttribute('aria-invalid', 'false');
    }

    return result;
  }

  reset() {
    this.stateManager.reset(this.fieldId);
    this.field.classList.remove('is-valid', 'is-invalid');
    this.field.removeAttribute('aria-invalid');
    const error = this.field.parentElement.querySelector('.form-error');
    if (error) {error.remove();}
  }
}

export function createFieldValidator(selector, options) {
  return new FieldValidator(selector, options);
}
