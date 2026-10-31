import { GridStack } from '#gridStackImports';

const STORAGE_KEY_DESKTOP = 'zine-grid-fit-v10';
const STORAGE_KEY_MOBILE = 'zine-grid-mobile-fit-v10';
const VSPLIT_STORAGE_KEY = 'zine-vsplit-state-v2';
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

export const VSPLIT_DETENTS = [
  { id: 'max', fraction: 0.92, label: 'Min' },
  { id: 'studio', fraction: 0.76, label: 'Sheet' },
  { id: 'half', fraction: 0.50, label: 'Half' },
  { id: 'controls', fraction: 0.35, label: 'Controls' },
  { id: 'min-canvas', fraction: 0.08, label: 'Min' }
];

const vsplitState = {
  axis: 'vertical', // 'vertical' (Top Sheet / Bottom Controls) | 'horizontal' (Left Controls / Right Sheet)
  fraction: 0.76,
  lastExpandedFraction: 0.76,
  activeTab: 'upload',
  isPeeking: false
};

let grid = null;
let gridEl = null;
let isRelayouting = false;
let vsplitInitialized = false;
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

function saveVSplitState() {
  try {
    localStorage.setItem(VSPLIT_STORAGE_KEY, JSON.stringify({
      axis: vsplitState.axis,
      fraction: vsplitState.fraction,
      lastExpandedFraction: vsplitState.lastExpandedFraction,
      activeTab: vsplitState.activeTab
    }));
  } catch {
    // Ignore storage errors
  }
}

function loadVSplitState() {
  try {
    const raw = localStorage.getItem(VSPLIT_STORAGE_KEY);
    if (!raw) { return; }
    const parsed = JSON.parse(raw);
    if (parsed && (parsed.axis === 'vertical' || parsed.axis === 'horizontal')) {
      vsplitState.axis = parsed.axis;
    }
    if (parsed && typeof parsed.fraction === 'number' && Number.isFinite(parsed.fraction)) {
      vsplitState.fraction = Math.min(0.94, Math.max(0.06, parsed.fraction));
    }
    if (parsed && typeof parsed.lastExpandedFraction === 'number' && Number.isFinite(parsed.lastExpandedFraction)) {
      vsplitState.lastExpandedFraction = Math.min(0.85, Math.max(0.25, parsed.lastExpandedFraction));
    }
    if (parsed && ['upload', 'settings', 'display'].includes(parsed.activeTab)) {
      vsplitState.activeTab = parsed.activeTab;
    }
  } catch {
    // Ignore corrupt state
  }
}

function applyRubberBandFraction(rawFraction) {
  const minBound = 0.08;
  const maxBound = 0.92;
  if (rawFraction < minBound) {
    const excess = minBound - rawFraction;
    return Math.max(0.03, minBound - Math.tanh(excess * 5) * 0.05);
  }
  if (rawFraction > maxBound) {
    const excess = rawFraction - maxBound;
    return Math.min(0.97, maxBound + Math.tanh(excess * 5) * 0.05);
  }
  return rawFraction;
}

function findNearestDetent(fraction) {
  if (fraction >= 0.86) {
    return 0.92; // Controls collapsed into mini-overlay pill
  }
  if (fraction <= 0.16) {
    return 0.08; // Canvas collapsed into mini-overlay pill
  }
  const snapTargets = [0.35, 0.50, 0.76];
  for (const target of snapTargets) {
    if (Math.abs(fraction - target) < 0.045) {
      return target;
    }
  }
  return Math.min(0.84, Math.max(0.22, Number(fraction.toFixed(3))));
}

export function setActiveControlTab(tabId) {
  if (['upload', 'settings', 'display'].includes(tabId)) {
    vsplitState.activeTab = tabId;
  }

  // All three control sections are visible simultaneously in the bottom panel
  const panes = document.querySelectorAll('.vsplit-control-pane');
  panes.forEach((pane) => {
    pane.classList.add('is-active');
    pane.removeAttribute('hidden');
  });

  if (vsplitState.fraction >= 0.85) {
    setVSplitFraction(vsplitState.lastExpandedFraction || 0.76, { animate: true });
  }

  saveVSplitState();
}

export function setVSplitAxis(axis) {
  const nextAxis = axis === 'horizontal' ? 'horizontal' : 'vertical';
  vsplitState.axis = nextAxis;
  applyVSplitUI({ animate: true });
  saveVSplitState();
  requestAnimationFrame(() => {
    window.dispatchEvent(new Event('resize'));
  });
}

export function setVSplitFraction(fraction, { animate = false, isDragging = false } = {}) {
  const workspaceEl = document.getElementById('vsplit-workspace');
  if (!workspaceEl) { return; }

  const clamped = isDragging
    ? applyRubberBandFraction(fraction)
    : Math.min(0.92, Math.max(0.08, fraction));

  vsplitState.fraction = clamped;
  if (clamped > 0.2 && clamped < 0.82) {
    vsplitState.lastExpandedFraction = clamped;
  }

  workspaceEl.classList.toggle('is-vsplit-animating', Boolean(animate));
  applyVSplitUI({ isDragging });

  if (!isDragging) {
    saveVSplitState();
    requestAnimationFrame(() => {
      window.dispatchEvent(new Event('resize'));
    });
  }
}

function applyVSplitUI({ isDragging = false } = {}) {
  const workspaceEl = document.getElementById('vsplit-workspace');
  const canvasPane = document.getElementById('workspace-canvas-panel');
  const controlsPane = document.getElementById('workspace-sidebar');
  const barEl = document.getElementById('vsplit-bar');
  const readoutEl = document.getElementById('vsplit-detent-readout');
  const axisIconEl = document.getElementById('vsplit-axis-icon');

  if (!workspaceEl) { return; }

  const { axis, fraction } = vsplitState;
  workspaceEl.setAttribute('data-vsplit-axis', axis);
  workspaceEl.style.setProperty('--vsplit-fraction', String(fraction));

  document.body.classList.toggle('vsplit-axis-vertical', axis === 'vertical');
  document.body.classList.toggle('vsplit-axis-columns', axis === 'horizontal');

  if (barEl) {
    barEl.setAttribute('aria-orientation', axis === 'vertical' ? 'horizontal' : 'vertical');
  }
  if (axisIconEl) {
    axisIconEl.textContent = axis === 'vertical' ? 'vertical_split' : 'horizontal_split';
  }

  const isControlsCollapsed = fraction >= 0.85;
  const isCanvasCollapsed = fraction <= 0.15;

  workspaceEl.classList.toggle('is-controls-mini', isControlsCollapsed);
  workspaceEl.classList.toggle('is-canvas-mini', isCanvasCollapsed);
  controlsPane?.classList.toggle('is-mini-overlay', isControlsCollapsed);
  canvasPane?.classList.toggle('is-mini-overlay', isCanvasCollapsed);

  // Overshoot peek-behind feedback when dragging past bounds
  const isOvershooting = isDragging && (fraction < 0.085 || fraction > 0.915);
  document.body.classList.toggle('is-peeking-bg', vsplitState.isPeeking || isOvershooting);

  if (readoutEl) {
    if (isControlsCollapsed) {
      readoutEl.textContent = 'Min';
    } else if (isCanvasCollapsed) {
      readoutEl.textContent = 'Min';
    } else if (Math.abs(fraction - 0.76) < 0.04) {
      readoutEl.textContent = 'Sheet';
    } else if (Math.abs(fraction - 0.50) < 0.04) {
      readoutEl.textContent = 'Half';
    } else if (Math.abs(fraction - 0.35) < 0.04) {
      readoutEl.textContent = 'Controls';
    } else {
      readoutEl.textContent = fraction > 0.62 ? 'Sheet' : (fraction < 0.42 ? 'Controls' : 'Half');
    }
  }

  // Highlight matching preset chip
  document.querySelectorAll('[data-vsplit-detent]').forEach((chip) => {
    const val = chip.dataset.vsplitDetent;
    const active = val === 'min'
      ? isControlsCollapsed
      : (!isControlsCollapsed && !isCanvasCollapsed && Math.abs(fraction - parseFloat(val)) < 0.04);
    chip.classList.toggle('is-active', active);
    chip.setAttribute('aria-pressed', String(active));
  });
}

function initVSplitController() {
  if (vsplitInitialized) { return; }
  const workspaceEl = document.getElementById('vsplit-workspace');
  const barEl = document.getElementById('vsplit-bar');
  if (!workspaceEl || !barEl) { return; }

  vsplitInitialized = true;
  loadVSplitState();
  setActiveControlTab(vsplitState.activeTab);
  applyVSplitUI();

  let dragging = false;

  const startDrag = (e) => {
    if (e.target.closest('button, a, input, select, .vsplit-trailing-group, .vsplit-leading-group, .vsplit-toast-container, .toast')) {
      return;
    }
    if (isMobile()) { return; }
    e.preventDefault();
    dragging = true;
    barEl.classList.add('is-dragging');
    document.body.classList.add('is-vsplit-dragging');
    workspaceEl.classList.remove('is-vsplit-animating');
    if (barEl.setPointerCapture && e.pointerId !== undefined) {
      try { barEl.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    }
  };

  const onMove = (e) => {
    if (!dragging) { return; }
    const rect = workspaceEl.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) { return; }

    let rawFraction;
    if (vsplitState.axis === 'vertical') {
      rawFraction = (e.clientY - rect.top) / rect.height;
    } else {
      // In horizontal mode, Controls are on Left and Canvas is on Right, or Canvas fraction is (1 - leftRatio)
      const pointerRatio = (e.clientX - rect.left) / rect.width;
      rawFraction = 1 - pointerRatio;
    }
    setVSplitFraction(rawFraction, { animate: false, isDragging: true });
  };

  const endDrag = () => {
    if (!dragging) { return; }
    dragging = false;
    barEl.classList.remove('is-dragging');
    document.body.classList.remove('is-vsplit-dragging');
    const snapped = findNearestDetent(vsplitState.fraction);
    setVSplitFraction(snapped, { animate: true, isDragging: false });
  };

  barEl.addEventListener('pointerdown', startDrag);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);

  // Double-click grabber to toggle between collapsed controls and restored split
  const grabberEl = document.getElementById('vsplit-grabber');
  grabberEl?.addEventListener('dblclick', (e) => {
    e.preventDefault();
    if (vsplitState.fraction >= 0.85 || vsplitState.fraction <= 0.15) {
      setVSplitFraction(vsplitState.lastExpandedFraction || 0.68, { animate: true });
    } else {
      setVSplitFraction(0.92, { animate: true });
    }
  });

  // Keyboard accessibility on separator
  barEl.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault();
      setVSplitFraction(vsplitState.fraction - 0.05, { animate: true });
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault();
      setVSplitFraction(vsplitState.fraction + 0.05, { animate: true });
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (vsplitState.fraction >= 0.85) {
        setVSplitFraction(vsplitState.lastExpandedFraction || 0.68, { animate: true });
      } else {
        setVSplitFraction(0.92, { animate: true });
      }
    }
  });

  // Delegated click handler for Detent presets, Axis toggle, Peek toggle, Mini-Overlay restore, and Control Tabs
  document.addEventListener('click', (e) => {
    const detentBtn = e.target.closest('[data-vsplit-detent]');
    if (detentBtn) {
      e.preventDefault();
      const val = detentBtn.dataset.vsplitDetent;
      if (val === 'min') {
        if (vsplitState.fraction >= 0.85) {
          setVSplitFraction(vsplitState.lastExpandedFraction || 0.68, { animate: true });
        } else {
          setVSplitFraction(0.92, { animate: true });
        }
      } else {
        const num = parseFloat(val);
        if (Number.isFinite(num)) {
          setVSplitFraction(num, { animate: true });
        }
      }
      return;
    }

    const restoreBtn = e.target.closest('[data-vsplit-restore]');
    if (restoreBtn) {
      e.preventDefault();
      setVSplitFraction(vsplitState.lastExpandedFraction || 0.68, { animate: true });
      return;
    }

    const quickSampleBtn = e.target.closest('[data-vsplit-quick="sample"]');
    if (quickSampleBtn) {
      e.preventDefault();
      document.getElementById('load-sample-zine-btn')?.click();
      return;
    }

    const axisBtn = e.target.closest('#vsplit-axis-toggle');
    if (axisBtn) {
      e.preventDefault();
      setVSplitAxis(vsplitState.axis === 'vertical' ? 'horizontal' : 'vertical');
      return;
    }

    const peekBtn = e.target.closest('#vsplit-peek-toggle');
    if (peekBtn) {
      e.preventDefault();
      vsplitState.isPeeking = !vsplitState.isPeeking;
      peekBtn.classList.toggle('is-active', vsplitState.isPeeking);
      peekBtn.setAttribute('aria-pressed', String(vsplitState.isPeeking));
      document.body.classList.toggle('is-peeking-bg', vsplitState.isPeeking);
      return;
    }

    const tabBtn = e.target.closest('[data-control-tab]');
    if (tabBtn) {
      e.preventDefault();
      setActiveControlTab(tabBtn.dataset.controlTab);
    }
  });

  // Arrow key navigation on segmented tablist
  const tabList = document.querySelector('.vsplit-segmented-bar');
  tabList?.addEventListener('keydown', (e) => {
    const order = ['upload', 'settings', 'display'];
    const idx = order.indexOf(vsplitState.activeTab);
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      const next = order[(idx + 1) % order.length];
      setActiveControlTab(next);
      document.getElementById(`vsplit-tab-${next}`)?.focus();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const prev = order[(idx - 1 + order.length) % order.length];
      setActiveControlTab(prev);
      document.getElementById(`vsplit-tab-${prev}`)?.focus();
    }
  });
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
  if (['upload', 'settings', 'display'].includes(cardId)) {
    setActiveControlTab(cardId);
  }
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
  vsplitState.axis = 'vertical';
  vsplitState.fraction = 0.68;
  vsplitState.lastExpandedFraction = 0.68;
  vsplitState.activeTab = 'upload';
  vsplitState.isPeeking = false;
  document.body.classList.remove('is-peeking-bg');
  setActiveControlTab('upload');
  applyVSplitUI({ animate: true });
  saveVSplitState();

  if (!grid) {
    requestAnimationFrame(() => {
      window.dispatchEvent(new Event('resize'));
    });
    return;
  }
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
}

export function syncFoldPreviewGrid(_show) {
  requestAnimationFrame(() => {
    window.dispatchEvent(new Event('resize'));
  });
}

export function toggleCardDetent(cardId) {
  toggleCardCollapse(cardId);
}

export function setStudioSectionCollapsed(sectionId, _collapsed) {
  toggleCardCollapse(sectionId);
}

export function initGridStack() {
  initVSplitController();
  initCardListeners();

  window.__toggleCardCollapse = toggleCardCollapse;
  window.__toggleCardDetent = toggleCardDetent;
  window.__resetPanelLayout = resetToDefaults;
  window.__syncFoldPreviewGrid = syncFoldPreviewGrid;
  window.__layoutHasOverlaps = layoutHasOverlaps;
  window.__initGridStack = initGridStack;
  window.__setVSplitAxis = setVSplitAxis;
  window.__setVSplitFraction = setVSplitFraction;
  window.__setActiveControlTab = setActiveControlTab;

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

  requestAnimationFrame(() => {
    syncGridMetrics();
  });
}
