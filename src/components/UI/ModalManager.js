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
    this.setupFoldModalListeners();
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

  /* ── 3D Modal (Focused Overlay Modal) ── */
  toggle3DModal(show) {
    const isShow = Boolean(show);
    const modal = document.getElementById('zine-3d-modal');
    if (modal) {
      modal.classList.toggle('hidden', !isShow);
      if (isShow) {
        document.body.classList.add('fold-modal-open');
      } else {
        document.body.classList.remove('fold-modal-open');
      }
    }

    const foldViewerCard = document.getElementById('card-fold-viewer');
    if (foldViewerCard) {
      foldViewerCard.classList.toggle('hidden', !isShow);
    }
    const bookletCard = document.getElementById('card-fold-booklet');
    if (bookletCard) {
      bookletCard.classList.toggle('hidden', !isShow);
    }
    const guideCard = document.getElementById('card-fold-guide');
    if (guideCard) {
      guideCard.classList.toggle('hidden', !isShow);
    }

    const view3dBtn = document.getElementById('view3dBtn');
    if (view3dBtn) {
      view3dBtn.classList.toggle('is-active', isShow);
      view3dBtn.setAttribute('aria-pressed', String(isShow));
    }

    if (isShow && typeof window !== 'undefined') {
      if (typeof window.__syncFoldPreviewGrid === 'function') {
        window.__syncFoldPreviewGrid(true);
      }
    }
  }

  setupFoldModalListeners() {
    const backdrop = document.getElementById('zine-3d-backdrop');
    backdrop?.addEventListener('click', () => this.toggle3DModal(false));

    const closeBtn = document.getElementById('close-3d-btn');
    closeBtn?.addEventListener('click', () => this.toggle3DModal(false));

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const modal = document.getElementById('zine-3d-modal');
        if (modal && !modal.classList.contains('hidden')) {
          this.toggle3DModal(false);
        }
      }
    });
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
      contentDiv.className = 'relative w-11/12 h-11/12 max-w-7xl max-h-[90vh] overflow-hidden flex flex-col scale-95 transition-transform duration-300';
      contentDiv.style.backgroundColor = 'var(--newsprint-bg)';
      contentDiv.style.backgroundImage = 'var(--texture-halftone), var(--texture-paper)';
      contentDiv.style.backgroundSize = '8px 8px, 160px 160px';
      contentDiv.style.clipPath = 'var(--clip-deckle-panel)';
      contentDiv.style.filter = 'var(--deckle-filter-hover)';
      contentDiv.style.boxShadow = 'inset 0 0 0 1.5px var(--deckle-inner-rim)';

      const header = document.createElement('div');
      header.className = 'flex justify-between items-center px-4 py-2.5';
      header.style.backgroundColor = 'var(--cutout-header-bg)';
      header.style.backgroundImage = 'var(--svg-crimson-brush), var(--texture-paper)';
      header.style.backgroundRepeat = 'no-repeat, repeat';
      header.style.backgroundPosition = 'left bottom, 0 0';
      header.style.backgroundSize = '100% 7px, 140px 140px';
      header.style.clipPath = 'var(--clip-deckle-header)';
      header.style.color = 'var(--cutout-header-ink)';

      const title = document.createElement('h3');
      title.className = 'font-bold tracking-wide text-sm';
      title.style.fontFamily = 'var(--font-display)';
      title.style.color = 'var(--cutout-header-ink)';
      title.style.textShadow = '1.5px 1.5px 0 #000000';
      title.textContent = 'Page Preview';

      const closeBtn = document.createElement('button');
      closeBtn.className = 'close-modal w-8 h-8 flex items-center justify-center transition-colors focus:outline-none';
      closeBtn.style.backgroundColor = 'var(--cutout-btn-bg)';
      closeBtn.style.color = 'var(--cutout-btn-ink)';
      closeBtn.style.border = '1.5px solid var(--cutout-btn-border)';
      closeBtn.style.borderRadius = '2px';
      closeBtn.style.boxShadow = '1.5px 1.5px 0 #080706';
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
