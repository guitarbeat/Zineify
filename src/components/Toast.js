// Modern toast notification system
import { sanitizeHTML } from '../utils/helpers.js';

const TOAST_ICONS = {
  success: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
    <polyline points="22,4 12,14.01 9,11.01"/>
  </svg>`,
  error: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <circle cx="12" cy="12" r="10"/>
    <line x1="15" y1="9" x2="9" y2="15"/>
    <line x1="9" y1="9" x2="15" y2="15"/>
  </svg>`,
  warning: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
    <line x1="12" y1="9" x2="12" y2="13"/>
    <line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>`,
  info: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <circle cx="12" cy="12" r="10"/>
    <path d="M12 16v-4"/>
    <path d="M12 8h.01"/>
  </svg>`
};


class Toast {
  constructor() {
    this.container = null;
    this.init();
  }

  init() {
    // Check if container already exists
    this.container = document.getElementById('toast-container');

    // Create toast container if it doesn't exist
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.id = 'toast-container';
      this.container.className = 'toast-container fixed bottom-6 right-6 z-[300] flex flex-col gap-3 font-[Inter] pointer-events-none';
      document.body.appendChild(this.container);
    }

    // Always ensure accessible attributes
    this.container.setAttribute('aria-live', 'polite');
    this.container.setAttribute('aria-atomic', 'true');
    this.container.setAttribute('role', 'region');
    this.container.setAttribute('aria-label', 'Notifications');

    // ⚡️ Bolt: Initialize template once using DOM API to avoid unescaped innerHTML
    this.template = document.createElement('template');

    const iconDiv = document.createElement('div');
    iconDiv.className = 'toast-icon';

    const contentDiv = document.createElement('div');
    contentDiv.className = 'toast-content';

    const titleDiv = document.createElement('div');
    titleDiv.className = 'toast-title';

    const messageDiv = document.createElement('div');
    messageDiv.className = 'toast-message';

    contentDiv.appendChild(titleDiv);
    contentDiv.appendChild(messageDiv);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'toast-close w-6 h-6 ml-2 flex items-center justify-center focus:outline-none';
    closeBtn.setAttribute('aria-label', 'Close notification');
    closeBtn.setAttribute('title', 'Close notification');
    closeBtn.textContent = '×';

    this.template.content.appendChild(iconDiv);
    this.template.content.appendChild(contentDiv);
    this.template.content.appendChild(closeBtn);
  }

  /**
   * Show a toast notification
   * @param {string} type - Toast type: 'success', 'error', 'warning', 'info'
   * @param {string} title - Toast title
   * @param {string} message - Toast message (optional)
   * @param {number} duration - Duration in milliseconds (default: 3500)
   */
  show(type, title, message = '', duration = 3500) {
    if (!this.container || !document.body.contains(this.container)) {
      this.init();
    }
    // Remove any currently displayed toast so the divider stays clean
    const existing = this.container.querySelectorAll('.toast');
    existing.forEach((el) => this.remove(el));

    const toast = this._buildToastElement(type, title, message);
    this.container.appendChild(toast);
    this._setupAutoClose(toast, duration);
    this._animateIn(toast);
    return toast;
  }

  /**
   * Build the toast DOM element
   * @private
   */
  _buildToastElement(type, title, message) {
    // ⚡️ Bolt: Optimized toast generation using HTML templates and module-level constants to reduce memory allocation.
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const role = type === 'error' ? 'alert' : 'status';
    toast.setAttribute('role', role);

    toast.appendChild(this.template.content.cloneNode(true));

    toast.querySelector('.toast-icon').appendChild(sanitizeHTML(this.getIcon(type)));

    toast.querySelector('.toast-title').appendChild(sanitizeHTML(title));

    const messageDiv = toast.querySelector('.toast-message');
    if (message) {
      messageDiv.appendChild(sanitizeHTML(message));
    } else {
      messageDiv.remove();
    }

    const closeBtn = toast.querySelector('.toast-close');
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.remove(toast);
    });

    return toast;
  }

  /**
   * Setup auto removal
   * @private
   */
  _setupAutoClose(toast, duration) {
    if (duration > 0) {
      setTimeout(() => {
        if (toast.parentNode) {
          this.remove(toast);
        }
      }, duration);
    }
  }

  /**
   * Animate the toast appearance on divider
   * @private
   */
  _animateIn(toast) {
    requestAnimationFrame(() => {
      toast.classList.add('toast-visible');
    });
  }

  /**
   * Remove a toast notification
   * @param {Element} toast - Toast element to remove
   */
  remove(toast) {
    toast.classList.remove('toast-visible');
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300); // Match CSS transition duration
  }

  /**
   * Get icon SVG for toast type
   * @param {string} type - Toast type
   * @returns {string} SVG icon HTML
   */
  getIcon(type) {
    return TOAST_ICONS[type] || TOAST_ICONS.info;
  }

  // Convenience methods
  success(title, message, duration) {
    return this.show('success', title, message, duration);
  }

  error(title, message, duration) {
    return this.show('error', title, message, duration);
  }

  warning(title, message, duration) {
    return this.show('warning', title, message, duration);
  }

  info(title, message, duration) {
    return this.show('info', title, message, duration);
  }
}

// Export singleton instance
export const toast = new Toast();

if (typeof window !== 'undefined' && (import.meta.env?.DEV || (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production')) && new URLSearchParams(window.location.search).has('expose-toast')) {
  window.__zineifyToast = toast;
}
