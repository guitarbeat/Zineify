import { buildMiniZineBookletStates, MINI_ZINE_LAYOUT } from '../utils/miniZineLayout.js';
import { normalizePreviewPage, getPageLabel } from '../utils/previewHelpers.js';

export class BookletPreview {
  constructor({ container, prevButton, nextButton, statusElement, onSpreadChange }) {
    this.container = container;
    this.prevButton = prevButton;
    this.nextButton = nextButton;
    this.statusElement = statusElement;
    this.onSpreadChange = typeof onSpreadChange === 'function' ? onSpreadChange : null;
    this.pages = [];
    this.spreadIndex = 0;
    this.isAnimating = false;
    this.spreadJumpButtons = [];

    if (!this.container) {
      return;
    }

    this.renderBase();
    this.bindControls();
    this.updateStaticSpread();
    this.updateControls();
  }

  renderBase() {
    this.shell = document.createElement('div');
    this.shell.className = 'booklet-shell';
    this.shell.tabIndex = 0;
    this.shell.setAttribute('role', 'group');
    this.shell.setAttribute('aria-label', 'Booklet spread preview. Use left and right arrow keys to turn pages.');

    const stage = document.createElement('div');
    stage.className = 'booklet-stage';

    const shadow = document.createElement('div');
    shadow.className = 'booklet-shadow';
    shadow.setAttribute('aria-hidden', 'true');

    this.spread = document.createElement('div');
    this.spread.className = 'booklet-spread';

    const createPage = (side, altText) => {
      const page = document.createElement('div');
      page.className = `booklet-page booklet-page-${side}`;
      page.dataset.side = side;

      const img = document.createElement('img');
      img.className = 'booklet-page-media';
      img.alt = altText;

      const placeholder = document.createElement('span');
      placeholder.className = 'booklet-page-placeholder';

      const label = document.createElement('span');
      label.className = 'booklet-page-label';

      page.appendChild(img);
      page.appendChild(placeholder);
      page.appendChild(label);
      return page;
    };

    this.leftPage = createPage('left', 'Left page preview');

    const spine = document.createElement('div');
    spine.className = 'booklet-spine';
    spine.setAttribute('aria-hidden', 'true');

    this.rightPage = createPage('right', 'Right page preview');

    this.turnLayer = document.createElement('div');
    this.turnLayer.className = 'booklet-turn-layer';
    this.turnLayer.setAttribute('aria-hidden', 'true');

    this.turnCard = document.createElement('div');
    this.turnCard.className = 'booklet-turn-card';

    const createFace = (faceSide) => {
      const face = document.createElement('div');
      face.className = `booklet-face booklet-face-${faceSide}`;

      const img = document.createElement('img');
      img.className = 'booklet-page-media';
      img.alt = '';

      const placeholder = document.createElement('span');
      placeholder.className = 'booklet-page-placeholder';

      const label = document.createElement('span');
      label.className = 'booklet-page-label';

      face.appendChild(img);
      face.appendChild(placeholder);
      face.appendChild(label);
      return face;
    };

    this.turnFront = createFace('front');
    this.turnBack = createFace('back');

    this.turnCard.appendChild(this.turnFront);
    this.turnCard.appendChild(this.turnBack);
    this.turnLayer.appendChild(this.turnCard);

    this.spread.appendChild(this.leftPage);
    this.spread.appendChild(spine);
    this.spread.appendChild(this.rightPage);
    this.spread.appendChild(this.turnLayer);

    stage.appendChild(shadow);
    stage.appendChild(this.spread);
    this.shell.appendChild(stage);

    this.spreadNav = document.createElement('div');
    this.spreadNav.className = 'booklet-spread-dots';
    this.spreadNav.setAttribute('role', 'tablist');
    this.spreadNav.setAttribute('aria-label', 'Booklet spreads');
    const spreadLabels = [
      { index: 0, text: 'Cover 1', title: 'Front Cover (Page 1)' },
      { index: 1, text: '2–3', title: 'Spread Pages 2 & 3' },
      { index: 2, text: '4–5', title: 'Spread Pages 4 & 5' },
      { index: 3, text: '6–7', title: 'Spread Pages 6 & 7' },
      { index: 4, text: 'Back 8', title: 'Back Cover (Page 8)' }
    ];
    this.spreadJumpButtons = spreadLabels.map(({ index, text, title }) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'booklet-spread-dot';
      btn.dataset.spreadIndex = String(index);
      btn.textContent = text;
      btn.title = title;
      btn.setAttribute('aria-label', title);
      btn.addEventListener('click', () => this.jumpToSpread(index));
      this.spreadNav.appendChild(btn);
      return btn;
    });
    this.shell.appendChild(this.spreadNav);

    this.container.textContent = '';
    this.container.appendChild(this.shell);
  }

  bindControls() {
    this.prevButton?.addEventListener('click', () => this.goPrev());
    this.nextButton?.addEventListener('click', () => this.goNext());
    this.turnCard?.addEventListener('transitionend', () => this.finishTurn());
    this.leftPage?.addEventListener('click', () => this.goPrev());
    this.rightPage?.addEventListener('click', () => this.goNext());
    this.shell?.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        this.goPrev();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        this.goNext();
      }
    });
  }

  loadPages(imageUrls = []) {
    const orderedPages = (imageUrls || []).map((page, pageIndex) => normalizePreviewPage(page, pageIndex + 1));
    this.slotPages = MINI_ZINE_LAYOUT.map((pageNumber, slotIndex) => {
      const page = orderedPages[pageNumber - 1] ?? null;
      if (!page) {
        return null;
      }

      return {
        ...page,
        slotIndex,
        pageIndex: pageNumber - 1
      };
    });

    this.states = buildMiniZineBookletStates(this.slotPages);
    this.spreadIndex = 0;
    this.isAnimating = false;
    this.hideTurnLayer();
    this.updateStaticSpread();
    this.updateControls();
  }

  hideTurnLayer() {
    this.turnLayer?.classList.remove('is-visible', 'is-active', 'is-next', 'is-prev');
    this.turnLayer?.setAttribute('aria-hidden', 'true');
    this.setPageFace(this.turnFront, null);
    this.setPageFace(this.turnBack, null);
  }

  showTurnLayer(direction) {
    this.turnLayer?.classList.remove('is-prev', 'is-next');
    this.turnLayer?.classList.add(direction > 0 ? 'is-next' : 'is-prev', 'is-visible');
    this.turnLayer?.setAttribute('aria-hidden', 'false');
  }

  getCurrentState() {
    return this.states?.[this.spreadIndex];
  }

  getNextState(direction) {
    return this.states?.[this.spreadIndex + direction];
  }

  updateSpreadMode(state) {
    if (!this.spread) {
      return;
    }

    this.spread.classList.remove('is-single-page', 'is-single-left', 'is-single-right');

    if (!state) {
      return;
    }

    const hasLeft = !!state.left;
    const hasRight = !!state.right;

    if (hasLeft === hasRight) {
      return;
    }

    this.spread.classList.add('is-single-page', hasRight ? 'is-single-right' : 'is-single-left');
  }

  setPageFace(element, page) {
    if (!element) {
      return;
    }

    const media = element.querySelector('.booklet-page-media');
    const placeholder = element.querySelector('.booklet-page-placeholder');
    const label = element.querySelector('.booklet-page-label');
    const src = page?.previewUrl || page?.sourceUrl || null;
    const pageLabel = page ? getPageLabel(page.pageNumber, 8) : 'Blank';

    const hasSrc = Boolean(src);
    media.classList.toggle('is-visible', hasSrc);
    element.classList.toggle('is-empty', !hasSrc);

    if (hasSrc) {
      media.src = src;
      placeholder.textContent = '';
    } else {
      media.removeAttribute('src');
      placeholder.textContent = pageLabel;
    }

    if (label) {
      label.textContent = pageLabel;
      label.hidden = !page;
    }
    element.dataset.pageNumber = page?.pageNumber ? String(page.pageNumber) : '';
    media.alt = `${pageLabel} preview`;
  }

  updateStaticSpread() {
    const state = this.getCurrentState();
    if (!state) {
      return;
    }

    this.updateSpreadMode(state);
    this.setPageFace(this.leftPage, state.left);
    this.setPageFace(this.rightPage, state.right);
    if (this.statusElement) {
      this.statusElement.textContent = state.label;
    }
  }

  updateControls() {
    const stateCount = this.states?.length ?? 0;
    const activeIdx = this.pendingSpreadIndex ?? this.spreadIndex;
    const disablePrev = this.isAnimating || this.spreadIndex === 0;
    const disableNext = this.isAnimating || this.spreadIndex === (stateCount - 1);

    if (this.prevButton) {
      this.prevButton.disabled = disablePrev;
      this.prevButton.setAttribute('aria-disabled', String(disablePrev));
      this.prevButton.classList.toggle('opacity-50', disablePrev);
      this.prevButton.classList.toggle('cursor-not-allowed', disablePrev);
    }

    if (this.nextButton) {
      this.nextButton.disabled = disableNext;
      this.nextButton.setAttribute('aria-disabled', String(disableNext));
      this.nextButton.classList.toggle('opacity-50', disableNext);
      this.nextButton.classList.toggle('cursor-not-allowed', disableNext);
    }

    if (Array.isArray(this.spreadJumpButtons)) {
      this.spreadJumpButtons.forEach((btn, idx) => {
        const isActive = idx === activeIdx;
        btn.classList.toggle('is-active', isActive);
        btn.setAttribute('aria-selected', String(isActive));
      });
    }
  }

  jumpToSpread(targetIndex, { emitChange = true } = {}) {
    const stateCount = this.states?.length ?? 0;
    if (!stateCount) {
      return;
    }
    const clamped = Math.max(0, Math.min(stateCount - 1, Number(targetIndex) || 0));
    if (clamped === this.spreadIndex && !this.isAnimating) {
      return;
    }
    if (!this.isAnimating && Math.abs(clamped - this.spreadIndex) === 1) {
      this.startTurn(clamped - this.spreadIndex, { emitChange });
      return;
    }
    this.pendingSpreadIndex = null;
    this.isAnimating = false;
    this.spreadIndex = clamped;
    this.hideTurnLayer();
    this.updateStaticSpread();
    this.updateControls();
    if (emitChange) {
      this.onSpreadChange?.(this.spreadIndex);
    }
  }

  goNext() {
    this.startTurn(1);
  }

  goPrev() {
    this.startTurn(-1);
  }

  startTurn(direction, { emitChange = true } = {}) {
    if (this.isAnimating) {
      return;
    }

    const nextState = this.getNextState(direction);
    if (!nextState) {
      return;
    }

    const currentState = this.getCurrentState();
    this.isAnimating = true;
    this.pendingSpreadIndex = this.spreadIndex + direction;
    this.updateSpreadMode(null);
    if (this.statusElement) {
      this.statusElement.textContent = nextState.label;
    }
    if (emitChange) {
      this.onSpreadChange?.(this.pendingSpreadIndex);
    }

    if (direction > 0) {
      this.setPageFace(this.leftPage, currentState.left);
      this.setPageFace(this.rightPage, nextState.right);
      this.setPageFace(this.turnFront, currentState.right);
      this.setPageFace(this.turnBack, nextState.left);
      this.showTurnLayer(direction);
    } else {
      this.setPageFace(this.leftPage, nextState.left);
      this.setPageFace(this.rightPage, currentState.right);
      this.setPageFace(this.turnFront, currentState.left);
      this.setPageFace(this.turnBack, nextState.right);
      this.showTurnLayer(direction);
    }

    this.updateControls();

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.turnLayer.classList.add('is-active');
      });
    });
  }

  finishTurn() {
    if (!this.isAnimating) {
      return;
    }

    this.spreadIndex = this.pendingSpreadIndex;
    this.pendingSpreadIndex = null;
    this.isAnimating = false;
    this.hideTurnLayer();
    this.updateStaticSpread();
    this.updateControls();
  }
}
