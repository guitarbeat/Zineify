import '../styles/index.css';
import { AppController } from './AppController.js';
import { initPwa } from './pwa.js';
import { initSettingsValidation } from '../services/FormValidationService.js';
import { initGridStack } from '../utils/gridStack.js';

initPwa();
window.app = new AppController();
initSettingsValidation(document, window.app?.ui);

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initGridStack();
  });
} else {
  initGridStack();
}
