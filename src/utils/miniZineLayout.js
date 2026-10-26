import { normalizePreviewPage } from './previewHelpers.js';
import { getLayoutPreset } from './layoutPresets.js';

const MINI_ZINE_PRESET = getLayoutPreset('mini-8');
export const MINI_ZINE_LAYOUT = MINI_ZINE_PRESET.readingToPrintOrder;
export const MINI_ZINE_UPSIDE_DOWN_PAGES = MINI_ZINE_LAYOUT
  .filter((pageNumber, index) => MINI_ZINE_PRESET.rotations[index] === 180)
  .slice()
  .sort((a, b) => a - b);

export const MINI_ZINE_BOOKLET_SLOT_STATES = [
  { label: 'Cover', leftSlot: null, rightSlot: 7 },
  { label: 'Pages 2-3', leftSlot: 3, rightSlot: 2 },
  { label: 'Pages 4-5', leftSlot: 1, rightSlot: 0 },
  { label: 'Pages 6-7', leftSlot: 4, rightSlot: 5 },
  { label: 'Back', leftSlot: 6, rightSlot: null }
];

export function buildMiniZineSlotPages(previewPages, cellPageIndexes) {
  return cellPageIndexes.map((pageIndex, slotIndex) => {
    const fallbackPageNumber = Number.isInteger(pageIndex) ? pageIndex + 1 : slotIndex + 1;
    const page = normalizePreviewPage(previewPages[pageIndex], fallbackPageNumber);

    return {
      ...page,
      pageIndex,
      pageNumber: page.pageNumber,
      slotIndex
    };
  });
}

export function buildMiniZineBookletStates(slotPages) {
  return MINI_ZINE_BOOKLET_SLOT_STATES.map((state) => ({
    label: state.label,
    left: state.leftSlot === null ? null : slotPages[state.leftSlot] ?? null,
    right: state.rightSlot === null ? null : slotPages[state.rightSlot] ?? null
  }));
}
