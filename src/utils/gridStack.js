import { GridStack } from '#gridStackImports';

const STORAGE_KEY_DESKTOP = 'zine-grid-fit-v6';
const STORAGE_KEY_MOBILE = 'zine-grid-mobile-fit-v6';
const MOBILE_BREAKPOINT = 768;
const CELL_HEIGHT = 32;
const MOBILE_CELL_HEIGHT = 24;

const DEFAULT_LAYOUT = [
  { id: 'canvas', x: 4, y: 6, w: 8, h: 6 },
  { id: 'upload', x: 0, y: 0, w: 6, h: 6 },
  { id: 'settings', x: 0, y: 6, w: 4, h: 4 },
  { id: 'display', x: 0, y: 10, w: 4, h: 1 },
  { id: 'fold-viewer', x: 4, y: 12, w: 8, h: 6 },
  { id: 'fold-booklet', x: 4, y: 18, w: 4, h: 5 },
  { id: 'fold-guide', x: 8, y: 18, w: 4, h: 5 }
];

let grid = null;
let gridEl = null;
let isRelayouting = false;

function isMobile() {
  return window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`).matches;
}

function storageKey() {
  return isMobile() ? STORAGE_KEY_MOBILE : STORAGE_KEY_DESKTOP;
}

function nodesOverlap(a, b) {
  if (a.id === b.id) { return false; }
  return !(
    a.x + a.w <= b.x ||
    b.x + b.w <= a.x ||
    a.y + a.h <= b.y ||
    b.y + b.h <= a.y
  );
}

let rowBuffer = new Uint32Array(256);
let sharedSpatialGrid = new Uint8Array(1024);

function reusableSpatialGrid(nodes, len, maxX, maxY) {
  const needed = maxY * maxX;
  if (sharedSpatialGrid.length < needed) {
    sharedSpatialGrid = new Uint8Array(Math.max(needed, sharedSpatialGrid.length * 2));
  } else {
    sharedSpatialGrid.fill(0, 0, needed);
  }

  for (let i = 0; i < len; i++) {
    const n = nodes[i];
    for (let y = n.y, yEnd = n.y + n.h; y < yEnd; y++) {
      const rowOffset = y * maxX;
      for (let x = n.x, xEnd = n.x + n.w; x < xEnd; x++) {
        const index = rowOffset + x;
        if (sharedSpatialGrid[index]) { return true; }
        sharedSpatialGrid[index] = 1;
      }
    }
  }

  return false;
}

export function layoutHasOverlaps(nodes = grid?.engine?.nodes ?? []) {
  const len = nodes.length;

  if (len < 10) {
    for (let i = 0; i < len; i++) {
      for (let j = i + 1; j < len; j++) {
        if (nodesOverlap(nodes[i], nodes[j])) { return true; }
      }
    }
    return false;
  }

  let maxX = 0;
  let maxY = 0;
  for (let i = 0; i < len; i++) {
    const n = nodes[i];
    const right = n.x + n.w;
    const bottom = n.y + n.h;
    if (right > maxX) { maxX = right; }
    if (bottom > maxY) { maxY = bottom; }
  }

  if (maxX <= 32) {
    if (rowBuffer.length < maxY) {
      rowBuffer = new Uint32Array(Math.max(maxY, rowBuffer.length * 2));
    } else {
      rowBuffer.fill(0, 0, maxY);
    }

    for (let i = 0; i < len; i++) {
      const n = nodes[i];
      const mask = (n.w >= 32 ? ~0 : ((1 << n.w) - 1)) << n.x;
      const yEnd = n.y + n.h;
      for (let y = n.y; y < yEnd; y++) {
        if ((rowBuffer[y] & mask) !== 0) { return true; }
        rowBuffer[y] |= mask;
      }
    }

    return false;
  }

  return reusableSpatialGrid(nodes, len, maxX, maxY);
}

function saveLayout() {
  if (!grid || isRelayouting) { return; }
  try {
    localStorage.setItem(storageKey(), JSON.stringify(grid.save(false)));
  } catch {
    // Ignore storage quota errors
  }
}

function compactLayout() {
  if (!grid || !isMobile()) { return; }
  grid.compact('list');
}

function relayoutPanels({ fitContent = false } = {}) {
  if (!grid) { return; }
  isRelayouting = true;

  if (fitContent && isMobile()) {
    const items = grid.getGridItems();
    for (let i = 0; i < items.length; i++) {
      const el = items[i];
      if (el.classList.contains('hidden')) { continue; }
      const content = (el.firstElementChild?.classList.contains('grid-stack-item-content'))
        ? el.firstElementChild
        : el.querySelector('.grid-stack-item-content');
      if (content?.firstElementChild) {
        grid.resizeToContent(el);
      }
    }
  }

  compactLayout();
  isRelayouting = false;
}

export function resetToDefaults() {
  if (!grid) { return; }
  localStorage.removeItem(storageKey());

  Object.assign(expandedHeightsMemory, DEFAULT_CARD_HEIGHTS);

  grid.batchUpdate(true);
  DEFAULT_LAYOUT.forEach(({ id, x, y, w, h }) => {
    const el = gridEl.querySelector(`[gs-id="${id}"]`);
    if (el) { grid.update(el, { x, y, w, h }); }
  });
  grid.batchUpdate(false);

  relayoutPanels({ fitContent: true });
  syncMiniOverlayStates();
}

function loadLayout() {
  if (!grid) { return; }

  try {
    const raw = localStorage.getItem(storageKey());
    if (!raw) {
      relayoutPanels({ fitContent: true });
      return;
    }

    let items;
    try {
      items = JSON.parse(raw);
    } catch {
      resetToDefaults();
      return;
    }

    if (!Array.isArray(items) || !items.length) {
      resetToDefaults();
      return;
    }

    const validIds = new Set();
    const itemElements = gridEl.querySelectorAll('.grid-stack-item');
    for (let i = 0; i < itemElements.length; i++) {
      const id = itemElements[i].getAttribute('gs-id');
      if (id) { validIds.add(id); }
    }
    const savedItems = [];
    const savedIds = new Set();
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (
        item &&
        typeof item === 'object' &&
        typeof item.id === 'string' &&
        validIds.has(item.id)
      ) {
        const cleanItem = { id: item.id };
        if (typeof item.x === 'number' && Number.isFinite(item.x) && item.x >= 0) { cleanItem.x = item.x; }
        if (typeof item.y === 'number' && Number.isFinite(item.y) && item.y >= 0) { cleanItem.y = item.y; }
        if (typeof item.w === 'number' && Number.isFinite(item.w) && item.w > 0) { cleanItem.w = item.w; }
        if (typeof item.h === 'number' && Number.isFinite(item.h) && item.h > 0) { cleanItem.h = item.h; }
        savedItems.push(cleanItem);
        savedIds.add(item.id);
      }
    }
    const missingItems = [];
    for (let i = 0; i < DEFAULT_LAYOUT.length; i++) {
      const layoutItem = DEFAULT_LAYOUT[i];
      if (validIds.has(layoutItem.id) && !savedIds.has(layoutItem.id)) {
        missingItems.push(layoutItem);
      }
    }
    grid.load([...savedItems, ...missingItems]);
    relayoutPanels();
    saveLayout();

    if (layoutHasOverlaps()) {
      resetToDefaults();
    }
  } catch {
    resetToDefaults();
  }
}

function syncGridMetrics() {
  if (!grid || !gridEl) { return; }
  const mobile = isMobile();
  if (mobile) {
    grid.cellHeight(MOBILE_CELL_HEIGHT);
    grid.margin(4);
    grid.float(false);
  } else {
    const availableH = gridEl.clientHeight || (window.innerHeight - 50);
    const targetRows = 12;
    const margin = 6;
    const computedH = Math.max(24, Math.floor((availableH - (targetRows - 1) * margin) / targetRows));
    grid.cellHeight(computedH);
    grid.margin(margin);
    grid.float(true);
  }
}

function setInteractionMode() {
  if (!grid) { return; }
  const mobile = isMobile();
  document.body.classList.toggle('layout-mobile', mobile);
  syncGridMetrics();
  grid.enableMove(true);
  grid.enableResize(true);
  loadLayout();
}

const DEFAULT_CARD_HEIGHTS = {
  upload: 6,
  settings: 4,
  display: 4
};

const expandedHeightsMemory = { ...DEFAULT_CARD_HEIGHTS };
let prePeekLayoutSnapshot = null;
let isPeekingBackground = false;

function getGridItemEl(id) {
  return gridEl?.querySelector(`.grid-stack-item[gs-id="${id}"]`) || null;
}

export function syncMiniOverlayStates() {
  if (!gridEl) { return; }
  ['upload', 'settings', 'display'].forEach((id) => {
    const itemEl = getGridItemEl(id);
    const cardEl = itemEl?.querySelector('.snap-card');
    const node = itemEl?.gridstackNode;
    if (!cardEl || !node) { return; }

    const isMini = node.h <= 1;
    cardEl.classList.toggle('is-mini-overlay', isMini);
    itemEl.classList.toggle('is-mini-overlay-item', isMini);

    if (!isMini && node.h >= 2) {
      expandedHeightsMemory[id] = node.h;
    }

    const detentBtn = cardEl.querySelector('.vsplit-detent-btn');
    if (detentBtn) {
      detentBtn.setAttribute('aria-expanded', String(!isMini));
      const icon = detentBtn.querySelector('.material-symbols-outlined');
      if (icon) {
        icon.textContent = isMini ? 'unfold_more' : 'unfold_less';
      }
    }
  });
}

export function toggleCardDetent(cardId) {
  if (!grid || !gridEl || !DEFAULT_CARD_HEIGHTS[cardId]) { return; }
  const el = getGridItemEl(cardId);
  const node = el?.gridstackNode;
  if (!el || !node) { return; }

  if (isPeekingBackground) {
    setBackgroundPeek(false);
  }

  const currentlyMini = node.h <= 1;
  const maxAvailableH = Math.max(1, 12 - node.y);
  const desiredExpandedH = Math.max(2, expandedHeightsMemory[cardId] || DEFAULT_CARD_HEIGHTS[cardId]);
  const targetH = currentlyMini
    ? Math.min(maxAvailableH, desiredExpandedH)
    : 1;

  if (!currentlyMini) {
    expandedHeightsMemory[cardId] = node.h;
  }

  grid.update(el, { h: targetH });
  syncMiniOverlayStates();
  saveLayout();
}

export function setBackgroundPeek(enable) {
  if (!grid || !gridEl) { return; }
  const nextState = typeof enable === 'boolean' ? enable : !isPeekingBackground;

  if (nextState === isPeekingBackground) { return; }
  isPeekingBackground = nextState;

  const peekBtn = document.getElementById('peek-bg-btn');
  const peekIcon = document.getElementById('peek-bg-icon');
  document.body.classList.toggle('is-peeking-bg', isPeekingBackground);

  if (peekBtn) {
    peekBtn.classList.toggle('is-active', isPeekingBackground);
    peekBtn.setAttribute('aria-pressed', String(isPeekingBackground));
  }
  if (peekIcon) {
    peekIcon.textContent = isPeekingBackground ? 'visibility_off' : 'visibility';
  }

  if (isPeekingBackground) {
    prePeekLayoutSnapshot = grid.save(false);
    grid.batchUpdate(true);
    ['upload', 'settings', 'display'].forEach((id, idx) => {
      const el = getGridItemEl(id);
      const node = el?.gridstackNode;
      if (el && node) {
        if (node.h > 1) {
          expandedHeightsMemory[id] = node.h;
        }
        grid.update(el, { x: 0, y: idx, w: 4, h: 1 });
      }
    });
    grid.batchUpdate(false);
    syncMiniOverlayStates();
  } else if (Array.isArray(prePeekLayoutSnapshot) && prePeekLayoutSnapshot.length > 0) {
    grid.batchUpdate(true);
    prePeekLayoutSnapshot.forEach(({ id, x, y, w, h }) => {
      const el = getGridItemEl(id);
      if (el) {
        grid.update(el, { x, y, w, h });
      }
    });
    grid.batchUpdate(false);
    prePeekLayoutSnapshot = null;
    syncMiniOverlayStates();
    saveLayout();
  }
}

function initVerticalSplitInteractions() {
  if (!gridEl) { return; }

  // 1. Detent button clicks (for upload and display; settings is handled in SmartSheetConfig + delegated here)
  gridEl.addEventListener('click', (e) => {
    const detentBtn = e.target.closest('.vsplit-detent-btn');
    if (detentBtn) {
      e.preventDefault();
      e.stopPropagation();
      toggleCardDetent(detentBtn.dataset.detentCard);
    }
  });

  // 2. Double-click on card header inline or split divider to snap detent
  gridEl.addEventListener('dblclick', (e) => {
    if (e.target.closest('button, input, select, label')) { return; }
    const divider = e.target.closest('.vsplit-divider');
    if (divider) {
      e.preventDefault();
      e.stopPropagation();
      const [topId] = (divider.dataset.vsplitPair || '').split(':');
      if (topId) {
        toggleCardDetent(topId);
      }
      return;
    }

    const headerInline = e.target.closest('.card-header-inline');
    if (headerInline) {
      const card = headerInline.closest('.snap-card[data-card-id]');
      if (card?.dataset.cardId) {
        e.preventDefault();
        toggleCardDetent(card.dataset.cardId);
      }
    }
  });

  // 3. Interactive Split Divider Dragging with Snap Detents
  const dividers = gridEl.querySelectorAll('.vsplit-divider');
  dividers.forEach((divider) => {
    divider.addEventListener('pointerdown', (e) => {
      if (isMobile() || e.button !== 0) { return; }
      e.preventDefault();
      e.stopPropagation();

      const [topId] = (divider.dataset.vsplitPair || '').split(':');
      const topEl = getGridItemEl(topId);
      const topNode = topEl?.gridstackNode;
      if (!topEl || !topNode) { return; }

      const startY = e.clientY;
      const startTopH = topNode.h;
      const rowStepPx = Math.max(24, (grid.getCellHeight() || CELL_HEIGHT) + 6);

      divider.classList.add('is-dragging');
      document.body.classList.add('is-vsplit-dragging');
      divider.setPointerCapture?.(e.pointerId);

      const onPointerMove = (moveEvt) => {
        const deltaPx = moveEvt.clientY - startY;
        const deltaRows = Math.round(deltaPx / rowStepPx);
        const maxH = Math.max(1, 12 - topNode.y);
        const nextTopH = Math.max(1, Math.min(maxH, startTopH + deltaRows));

        if (nextTopH !== topNode.h) {
          grid.update(topEl, { h: nextTopH });
          syncMiniOverlayStates();
        }
      };

      const onPointerUp = (upEvt) => {
        divider.classList.remove('is-dragging');
        document.body.classList.remove('is-vsplit-dragging');
        divider.releasePointerCapture?.(upEvt.pointerId);
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        window.removeEventListener('pointercancel', onPointerUp);
        syncMiniOverlayStates();
        saveLayout();
      };

      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointercancel', onPointerUp);
    });
  });

  // 4. Peek Background button
  const peekBtn = document.getElementById('peek-bg-btn');
  if (peekBtn) {
    peekBtn.addEventListener('click', () => {
      setBackgroundPeek();
    });
  }
}

export function initGridStack() {
  gridEl = document.querySelector('.grid-stack');
  if (!gridEl) { return; }

  grid = GridStack.init({
    column: 12,
    cellHeight: CELL_HEIGHT,
    margin: isMobile() ? 6 : 8,
    float: !isMobile(),
    animate: true,
    sizeToContent: false,
    handle: '.snap-card, .brand-panel',
    cancel: 'button, input, select, textarea, label, a, .upload-box, [role="button"], .smart-sheet-unit-btn, .smart-sheet-orientation-btn, .smart-sheet-stepper-btn, .smart-sheet-margin-slider, .workspace-config-toggle, .vsplit-divider, .vsplit-detent-btn, .vsplit-peek-btn',
    resizable: { handles: 'se', autoHide: false },
    columnOpts: {
      breakpointForWindow: true,
      layout: 'list',
      breakpoints: [{ w: MOBILE_BREAKPOINT, c: 1, layout: 'list' }]
    }
  }, gridEl);

  grid.float(!isMobile());

  grid.on('change', () => {
    syncMiniOverlayStates();
    saveLayout();
  });
  grid.on('dragstop resizestop', () => {
    syncMiniOverlayStates();
    saveLayout();
  });

  setInteractionMode();
  initVerticalSplitInteractions();
  syncMiniOverlayStates();

  window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`).addEventListener('change', setInteractionMode);

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      syncGridMetrics();
    }, 100);
  });

  window.__toggleCardDetent = toggleCardDetent;
  window.__setBackgroundPeek = setBackgroundPeek;
  window.__resetPanelLayout = () => {
    if (isPeekingBackground) {
      setBackgroundPeek(false);
    }
    localStorage.removeItem(STORAGE_KEY_DESKTOP);
    localStorage.removeItem(STORAGE_KEY_MOBILE);
    resetToDefaults();
    syncMiniOverlayStates();
  };
  window.__resizePanels = relayoutPanels;
  window.__layoutHasOverlaps = layoutHasOverlaps;
  window.__initGridStack = initGridStack;
}
