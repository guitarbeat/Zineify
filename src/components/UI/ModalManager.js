import { PagePicker } from './PagePicker.js';
import { ProgressOverlay } from './ProgressOverlay.js';

/**
 * ModalManager.js
 * Thin orchestrator: PagePicker + ProgressOverlay + Zoom modal + 3D modal
 */
export class ModalManager {
  constructor(elements, emitter) {
    this.elements = elements;
    this.emitter = emitter;
    this.pagePicker = new PagePicker(elements);
    this.progress = new ProgressOverlay(elements);
  }

  /* ── PagePicker ── */
  showPagePicker(opts) {
    return this.pagePicker.open(opts);
  }
  closePagePicker(result) {
    this.pagePicker.close(result);
  }
  isPagePickerOpen() {
    return this.pagePicker.state !== null;
  }

  /* ── ProgressOverlay ── */
  showProgress(show, title, subtext) {
    this.progress.show(show, title, subtext);
  }
  setProgressCopy(title, subtext) {
    this.progress.setCopy(title, subtext);
  }
  updateProgress(percent) {
    this.progress.update(percent);
  }

  /* ── 3D Modal (Snap-Cards) ── */
  toggle3DModal(show) {
    const foldViewerCard = document.getElementById('card-fold-viewer');
    const foldBookletCard = document.getElementById('card-fold-booklet');
    const foldGuideCard = document.getElementById('card-fold-guide');

    const cards = [foldViewerCard, foldBookletCard, foldGuideCard];
    cards.forEach((card) => {
      if (!card) { return; }
      if (show) {
        card.classList.remove('hidden');
      } else {
        card.classList.add('hidden');
      }
    });

    const view3dBtn = document.getElementById('view3dBtn');
    if (view3dBtn) {
      view3dBtn.classList.toggle('is-active', Boolean(show));
      view3dBtn.setAttribute('aria-pressed', String(Boolean(show)));
    }

    if (typeof window !== 'undefined' && typeof window.__resizePanels === 'function') {
      requestAnimationFrame(() => {
        window.__resizePanels({ fitContent: true });
      });
    }
  }

  /* ── Zoom Modal ── */
  showZoomModal(imageUrl) {
    let modal = document.querySelector('.zoom-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.className = 'zoom-modal fixed inset-0 z-[300] flex items-center justify-center opacity-0 pointer-events-none transition-opacity duration-300';

      const backdrop = document.createElement('div');
      backdrop.className = 'absolute inset-0 bg-black/80 backdrop-blur-sm';
      modal.appendChild(backdrop);

      const contentDiv = document.createElement('div');
      contentDiv.className = 'relative w-11/12 h-11/12 max-w-7xl max-h-[90vh] bg-white overflow-hidden flex flex-col scale-95 transition-transform duration-300';
      contentDiv.style.border = '3px solid black';
      contentDiv.style.boxShadow = '6px 6px 0px 0px black';

      const header = document.createElement('div');
      header.className = 'flex justify-between items-center px-4 py-2 border-b-2 border-black';

      const title = document.createElement('h3');
      title.className = 'font-bold uppercase tracking-wider text-sm';
      title.textContent = 'Page Preview';

      const closeBtn = document.createElement('button');
      closeBtn.className = 'close-modal w-8 h-8 bg-white border-2 border-black text-black flex items-center justify-center hover:bg-red-500 hover:text-white transition-colors focus:outline-none';
      closeBtn.style.boxShadow = '2px 2px 0px 0px black';
      closeBtn.setAttribute('aria-label', 'Close page preview');
      closeBtn.setAttribute('title', 'Close page preview');

      const closeIcon = document.createElement('span');
      closeIcon.className = 'material-symbols-outlined font-bold';
      closeIcon.setAttribute('aria-hidden', 'true');
      closeIcon.textContent = 'close';

      closeBtn.appendChild(closeIcon);
      header.appendChild(title);
      header.appendChild(closeBtn);

      const body = document.createElement('div');
      body.className = 'flex-1 overflow-auto p-4 flex items-center justify-center';
      body.style.backgroundColor = 'var(--bg-neutral)';

      const img = document.createElement('img');
      img.className = 'zoom-img max-w-full max-h-full object-contain';
      img.style.border = '2px solid black';
      img.style.boxShadow = '4px 4px 0px 0px black';
      img.alt = 'Zoomed Page Preview';

      body.appendChild(img);
      contentDiv.appendChild(header);
      contentDiv.appendChild(body);
      modal.appendChild(contentDiv);

      document.body.appendChild(modal);
      const hide = () => {
        modal.classList.add('opacity-0', 'pointer-events-none');
        modal.classList.remove('opacity-100', 'pointer-events-auto');
        contentDiv.classList.remove('scale-100');
        contentDiv.classList.add('scale-95');
      };
      modal.querySelector('.close-modal').addEventListener('click', hide);
      modal.querySelector('.absolute').addEventListener('click', hide);
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('opacity-100')) {
          hide();
        }
      });
    }
    modal.querySelector('.zoom-img').src = imageUrl;
    const contentDiv = modal.querySelector('[class*="relative"]');
    modal.classList.remove('opacity-0', 'pointer-events-none');
    modal.classList.add('opacity-100', 'pointer-events-auto');
    requestAnimationFrame(() => {
      contentDiv.classList.remove('scale-95');
      contentDiv.classList.add('scale-100');
    });
  }
}
