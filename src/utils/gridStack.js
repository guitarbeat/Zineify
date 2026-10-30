import { GridStack } from '#gridStackImports';

const STORAGE_KEY_DESKTOP = 'zine-grid-fit-v10';
const STORAGE_KEY_MOBILE = 'zine-grid-mobile-fit-v10';
const MOBILE_BREAKPOINT = 768;
const MOBILE_CELL_HEIGHT = 24;

export const CARD_IDS = ['upload', 'settings', 'display', 'canvas'];
const VALID_IDS = new Set(CARD_IDS);

export const DEFAULT_CARD_HEIGHTS = {
  upload: 4,
  settings: 5,
  display: 3,
  canvas: 12
};

export const DEFAULT_LAYOUT = [
  { id: 'upload', x: 0, y: 0, w: 4, h: 4 },
  { id: 'settings', x: 0, y: 4, w: 4, h: 5 },
  { id: 'display', x: 0, y: 9, w: 4, h: 3 },
  { id: 'canvas', x: 4, y: 0, w: 8, h: 12 }
];

export const MOBILE_DEFAULT_LAYOUT = [
  { id: 'upload', x: 0, y: 0, w: 12, h: 4 },
  { id: 'settings', x: 0, y: 4, w: 12, h: 5 },
  { id: 'display', x: 0, y: 9, w: 12, h: 3 },
  { id: 'canvas', x: 0, y: 12, w: 12, h: 8 }
];

let grid = null;
let gridEl = null;
let isRelayouting = false;
const expandedHeightsMemory = { ...DEFAULT_CARD_HEIGHTS };

function isMobile() {
  return window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`).matches;
}

function getDefaultLayout() {
  return isMobile() ? MOBILE_DEFAULT_LAYOUT : DEFAULT_LAYOUT;
}

function storageKey() {
  return isMobile() ? STORAGE_KEY_MOBILE : STORAGE_KEY_DESKTOP;
}

function getGridItemEl(id) {
  return gridEl?.querySelector(`.grid-stack-item[gs-id="${id}"]`) || null;
}

function nodesOverlap(a, b) {
  if (a.id === b.id) { return false; }
  if (a.el?.classList?.contains('hidden') || b.el?.classList?.contains('hidden')) {
    return false;
  }
  return !(
    a.x + a.w <= b.x ||
    b.x + b.w <= a.x ||
    a.y + a.h <= b.y ||
    b.y + b.h <= a.y
  );
}

export function layoutHasOverlaps(nodes = grid?.engine?.nodes ?? []) {
  const visibleNodes = nodes.filter((n) => !n.el?.classList?.contains('hidden'));
  const len = visibleNodes.length;
  for (let i = 0; i < len; i++) {
    for (let j = i + 1; j < len; j++) {
      if (nodesOverlap(visibleNodes[i], visibleNodes[j])) { return true; }
    }
  }
  return false;
}

function saveLayout() {
  if (!grid || isRelayouting) { return; }
  try {
    localStorage.setItem(storageKey(), JSON.stringify(grid.save(false)));
  } catch {
    // Ignore storage quota errors
  }
}

export function syncCardCollapseUI() {
  if (!gridEl) { return; }

  CARD_IDS.forEach((id) => {
    const itemEl = getGridItemEl(id);
    const cardEl = itemEl?.querySelector('.snap-card');
    const node = itemEl?.gridstackNode;
    if (!itemEl || !cardEl || !node) { return; }

    const isCollapsed = node.h <= 1 || cardEl.classList.contains('is-collapsed');
    cardEl.classList.toggle('is-collapsed', isCollapsed);
    itemEl.classList.toggle('is-collapsed-item', isCollapsed);

    const toggleBtn = itemEl.querySelector(`[data-collapse-card="${id}"]`);
    if (toggleBtn) {
      toggleBtn.setAttribute('aria-expanded', String(!isCollapsed));
      const icon = toggleBtn.querySelector('.material-symbols-outlined');
      if (icon) {
        icon.textContent = isCollapsed ? 'expand_more' : 'expand_less';
      }
    }
  });
}

export function toggleCardCollapse(cardId) {
  const cardEl = document.getElementById(`card-${cardId}`) || document.querySelector(`[data-card-id="${cardId}"]`);
  if (!cardEl) { return; }

  const isCollapsed = cardEl.classList.toggle('is-collapsed');
  const toggleBtn = cardEl.querySelector(`[data-collapse-card="${cardId}"]`);
  if (toggleBtn) {
    toggleBtn.setAttribute('aria-expanded', String(!isCollapsed));
    const icon = toggleBtn.querySelector('.material-symbols-outlined');
    if (icon) {
      icon.textContent = isCollapsed ? 'expand_more' : 'expand_less';
    }
  }

  if (grid) {
    const itemEl = getGridItemEl(cardId);
    const node = itemEl?.gridstackNode;
    if (itemEl && node) {
      if (isCollapsed) {
        if (node.h > 1) { expandedHeightsMemory[cardId] = node.h; }
        itemEl.classList.add('is-collapsed-item');
        grid.update(itemEl, { h: 1 });
      } else {
        const targetH = expandedHeightsMemory[cardId] || DEFAULT_CARD_HEIGHTS[cardId] || 4;
        itemEl.classList.remove('is-collapsed-item');
        grid.update(itemEl, { h: targetH });
      }
      saveLayout();
    }
  }

  requestAnimationFrame(() => {
    window.dispatchEvent(new Event('resize'));
  });
}

export function resetToDefaults() {
  if (!grid) { return; }
  try {
    localStorage.removeItem(STORAGE_KEY_DESKTOP);
    localStorage.removeItem(STORAGE_KEY_MOBILE);
  } catch {
    // Ignore storage errors
  }

  Object.assign(expandedHeightsMemory, DEFAULT_CARD_HEIGHTS);

  const baseLayout = getDefaultLayout();

  isRelayouting = true;
  grid.batchUpdate(true);
  baseLayout.forEach(({ id, x, y, w, h }) => {
    const el = getGridItemEl(id);
    if (el) {
      const cardEl = el.querySelector('.snap-card');
      cardEl?.classList.remove('is-collapsed');
      el.classList.remove('is-collapsed-item');
      grid.update(el, { x, y, w, h });
    }
  });
  grid.batchUpdate(false);
  isRelayouting = false;

  syncCardCollapseUI();
  saveLayout();
  requestAnimationFrame(() => {
    window.dispatchEvent(new Event('resize'));
  });
}

function loadLayout() {
  if (!grid) { return; }

  try {
    const raw = localStorage.getItem(storageKey());
    if (!raw) {
      resetToDefaults();
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

    const savedItems = [];
    const savedIds = new Set();
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (
        item &&
        typeof item === 'object' &&
        typeof item.id === 'string' &&
        VALID_IDS.has(item.id)
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

    if (savedItems.length === 0 || savedItems.length < VALID_IDS.size) {
      // Missing items or legacy layout, add missing items from defaults
      const baseLayout = getDefaultLayout();
      baseLayout.forEach((layoutItem) => {
        if (!savedIds.has(layoutItem.id)) {
          savedItems.push(layoutItem);
          savedIds.add(layoutItem.id);
        }
      });
    }

    grid.load(savedItems);
    syncCardCollapseUI();
    saveLayout();

    if (layoutHasOverlaps()) {
      resetToDefaults();
    }
  } catch {
    resetToDefaults();
  }
}

function getAvailableGridHeight() {
  const shell = document.querySelector('.app-shell');
  if (shell && shell.clientHeight > 100) {
    const computedStyle = window.getComputedStyle(shell);
    const padTop = parseFloat(computedStyle.paddingTop) || 8;
    const padBottom = parseFloat(computedStyle.paddingBottom) || 8;
    return Math.max(320, shell.clientHeight - (padTop + padBottom));
  }
  const wrapper = gridEl?.parentElement;
  if (wrapper && wrapper.clientHeight > 100) {
    return Math.max(320, wrapper.clientHeight);
  }
  return Math.max(320, window.innerHeight - 20);
}

function syncGridMetrics() {
  if (!grid || !gridEl) { return; }
  const mobile = isMobile();
  if (mobile) {
    grid.cellHeight(MOBILE_CELL_HEIGHT);
    grid.margin(4);
    grid.float(false);
  } else {
    const availableH = getAvailableGridHeight();
    const targetRows = 12;
    const margin = 6;
    const computedH = Math.max(32, Math.floor((availableH - (targetRows - 1) * margin) / targetRows));
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
  grid.enableMove(!mobile);
  grid.enableResize(true);
  loadLayout();
}

function initCardListeners() {
  // Collapse toggle button clicks
  document.addEventListener('click', (e) => {
    const collapseBtn = e.target.closest('[data-collapse-card]');
    if (collapseBtn) {
      e.preventDefault();
      e.stopPropagation();
      const cardId = collapseBtn.dataset.collapseCard;
      if (cardId) {
        toggleCardCollapse(cardId);
      }
      return;
    }

    const resetBtn = e.target.closest('#reset-layout-btn');
    if (resetBtn) {
      e.preventDefault();
      e.stopPropagation();
      resetToDefaults();
    }
  });

  // Double click header to toggle collapse
  document.addEventListener('dblclick', (e) => {
    if (e.target.closest('button, input, select, label, a, .canvas-view-seg')) {
      return;
    }
    const headerEl = e.target.closest('.snap-card-handle');
    if (headerEl) {
      e.preventDefault();
      const cardId = headerEl.dataset.headbarCard || headerEl.closest('.snap-card')?.dataset.cardId;
      if (cardId) {
        toggleCardCollapse(cardId);
      }
    }
  });
}

export function syncFoldPreviewGrid(_show) {
  requestAnimationFrame(() => {
    window.dispatchEvent(new Event('resize'));
  });
}

// Backwards-compatible stubs
export function toggleCardDetent(cardId) {
  toggleCardCollapse(cardId);
}

export function setStudioSectionCollapsed(sectionId, _collapsed) {
  toggleCardCollapse(sectionId);
}

export function initGridStack() {
  initCardListeners();
  gridEl = document.querySelector('.grid-stack');
  if (!gridEl || gridEl.children.length === 0) { return; }

  const mobile = isMobile();
  const initialMargin = mobile ? 4 : 6;
  const initialCellHeight = mobile
    ? MOBILE_CELL_HEIGHT
    : Math.max(32, Math.floor((getAvailableGridHeight() - 11 * initialMargin) / 12));

  grid = GridStack.init({
    column: 12,
    cellHeight: initialCellHeight,
    margin: initialMargin,
    float: !mobile,
    animate: true,
    sizeToContent: false,
    handle: '.snap-card-handle',
    resizable: { handles: 'se', autoHide: false },
    columnOpts: {
      breakpointForWindow: true,
      layout: 'list',
      breakpoints: [{ w: MOBILE_BREAKPOINT, c: 1, layout: 'list' }]
    }
  }, gridEl);

  grid.on('change', () => {
    syncCardCollapseUI();
    saveLayout();
  });
  grid.on('dragstop resizestop', () => {
    syncCardCollapseUI();
    saveLayout();
  });

  setInteractionMode();
  initCardListeners();
  syncCardCollapseUI();

  window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`).addEventListener('change', setInteractionMode);

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      syncGridMetrics();
    }, 50);
  });

  if (typeof ResizeObserver !== 'undefined' && gridEl.parentElement) {
    const ro = new ResizeObserver(() => {
      syncGridMetrics();
    });
    ro.observe(gridEl.parentElement);
    const shell = document.querySelector('.app-shell');
    if (shell) {
      ro.observe(shell);
    }
  }

  // Ensure initial metrics settle cleanly after layout paint
  requestAnimationFrame(() => {
    syncGridMetrics();
  });

  window.__toggleCardCollapse = toggleCardCollapse;
  window.__toggleCardDetent = toggleCardDetent;
  window.__resetPanelLayout = resetToDefaults;
  window.__syncFoldPreviewGrid = syncFoldPreviewGrid;
  window.__layoutHasOverlaps = layoutHasOverlaps;
  window.__initGridStack = initGridStack;
}
