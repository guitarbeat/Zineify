export const LAYOUT_PRESETS = {
  'mini-8': {
    id: 'mini-8', name: '8-page mini zine', pageCount: 8,
    sheetGrid: { rows: 2, cols: 4 },
    readingToPrintOrder: [5, 4, 3, 2, 6, 7, 8, 1],
    rotations: [0, 180, 180, 180, 180, 0, 0, 0],
    cutLines: [{ type: 'horizontal', afterRow: 1, fromPct: 25, toPct: 75 }],
    foldLines: [{ type: 'vertical', at: 25 }, { type: 'vertical', at: 50 }, { type: 'vertical', at: 75 }, { type: 'horizontal', at: 50 }],
    foldSequence: ['Cut the center slit between the middle panels.', 'Fold the sheet in half horizontally.', 'Fold both outer columns inward.', 'Push the center and collapse into a zine.']
  },
  'folded-4': {
    id: 'folded-4', name: '4-page folded sheet', pageCount: 4,
    sheetGrid: { rows: 1, cols: 4 }, readingToPrintOrder: [4, 3, 2, 1], rotations: [0, 0, 0, 0],
    cutLines: [], foldLines: [{ type: 'vertical', at: 25 }, { type: 'vertical', at: 50 }, { type: 'vertical', at: 75 }],
    foldSequence: ['Fold the sheet in half, then fold again to make four panels.']
  },
  'booklet-8': {
    id: 'booklet-8', name: 'Simple booklet signature', pageCount: 8,
    sheetGrid: { rows: 2, cols: 4 }, readingToPrintOrder: [8, 1, 2, 7, 6, 3, 4, 5], rotations: [0, 0, 0, 0, 0, 0, 0, 0],
    cutLines: [], foldLines: [{ type: 'vertical', at: 50 }],
    foldSequence: ['Fold the sheet in half, nest the pages, and staple or stitch the spine.']
  },
  custom: {
    id: 'custom', name: 'Custom grid', pageCount: 0, sheetGrid: { rows: 2, cols: 4 },
    readingToPrintOrder: [], rotations: [], cutLines: [], foldLines: [], foldSequence: []
  }
};

export function getLayoutPreset(id = 'mini-8') {
  return LAYOUT_PRESETS[id] || LAYOUT_PRESETS['mini-8'];
}

export function normalizeLayoutPreset(preset, { rows, cols } = {}) {
  const source = typeof preset === 'string' ? getLayoutPreset(preset) : preset || getLayoutPreset();
  const grid = rows && cols ? { rows, cols } : { ...source.sheetGrid };
  const capacity = grid.rows * grid.cols;
  const order = source.readingToPrintOrder.length
    ? source.readingToPrintOrder.slice(0, capacity)
    : Array.from({ length: capacity }, (_, index) => index + 1);
  return { ...source, sheetGrid: grid, capacity, readingToPrintOrder: order, rotations: order.map((_, index) => source.rotations[index] ?? 0) };
}

export function buildPrintSheets(preset, pageRecords = []) {
  const normalized = normalizeLayoutPreset(preset);
  const pagesByNumber = new Map(pageRecords.map((page) => [page.pageNumber, page]));
  const slots = normalized.readingToPrintOrder.map((pageNumber, slotIndex) => ({
    slotIndex, pageNumber, rotation: normalized.rotations[slotIndex] || 0, page: pagesByNumber.get(pageNumber) || null
  }));
  return [{ sheetIndex: 0, grid: normalized.sheetGrid, slots, cutLines: normalized.cutLines, foldLines: normalized.foldLines }];
}

export function mapReadingPageToPrint(pageNumber, preset) {
  const normalized = normalizeLayoutPreset(preset);
  const slotIndex = normalized.readingToPrintOrder.indexOf(Number(pageNumber));
  if (slotIndex < 0) {return null;}
  return { readingPage: Number(pageNumber), sheetIndex: 0, slotIndex, rotation: normalized.rotations[slotIndex] || 0 };
}

export function buildPrintCheck({ preset = 'mini-8', paperSize = 'letter', orientation = 'landscape', pageCount = 0, printSettings = {}, margin = 0 } = {}) {
  const normalized = normalizeLayoutPreset(preset);
  const sheets = Math.max(1, Math.ceil(Math.max(pageCount, normalized.pageCount || normalized.capacity) / normalized.capacity));
  return {
    preset: normalized.name,
    paperSize,
    orientation,
    finishedPages: normalized.pageCount || pageCount,
    sheetCount: sheets,
    duplex: printSettings.duplex !== false,
    scale: printSettings.scale || 'fit',
    margins: margin,
    foldedDimensions: normalized.sheetGrid.cols > 1 ? `${normalized.sheetGrid.cols} panels wide` : 'single panel',
    guideCount: (normalized.foldLines?.length || 0) + (normalized.cutLines?.length || 0)
  };
}

export function getPresetOptions() {
  return Object.values(LAYOUT_PRESETS).filter((preset) => preset.id !== 'custom');
}

export default LAYOUT_PRESETS;
