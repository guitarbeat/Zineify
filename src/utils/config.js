import { MINI_ZINE_LAYOUT, MINI_ZINE_UPSIDE_DOWN_PAGES } from './miniZineLayout.js';
import { LAYOUT_PRESETS } from './layoutPresets.js';

export { LAYOUT_PRESETS };

export const GRID_DIMENSION_MIN = 1;
export const GRID_DIMENSION_MAX = 10;

export const MARGIN_MIN = 0;
export const MARGIN_MAX = 25;

export const PAPER_SIZES = {
    a4: { label: 'A4', width: 210, height: 297 },
    a3: { label: 'A3', width: 297, height: 420 },
    letter: { label: 'Letter', width: 215.9, height: 279.4 },
    legal: { label: 'Legal', width: 215.9, height: 355.6 },
    a5: { label: 'A5', width: 148, height: 210 }
};

// All paper/margin values are stored internally in millimeters. Units below
// only control how values are displayed and entered in the UI.
export const MM_PER_INCH = 25.4;

export const UNITS = {
    in: { label: 'in', decimals: 2, marginStep: 0.05, inputStep: 0.01 },
    mm: { label: 'mm', decimals: 0, marginStep: 1, inputStep: 1 }
};

export function toMm(value, unit) {
    const v = Number(value) || 0;
    return unit === 'in' ? v * MM_PER_INCH : v;
}

export function fromMm(mm, unit) {
    const v = Number(mm) || 0;
    return unit === 'in' ? v / MM_PER_INCH : v;
}

// Convert an internal mm value to a display string in the given unit,
// trimming trailing zeros (e.g. 215.9mm -> "8.5" in inches).
export function formatDimension(mm, unit) {
    const u = UNITS[unit] || UNITS.mm;
    const value = fromMm(mm, unit);
    const rounded = Number(value.toFixed(u.decimals));
    return String(rounded);
}

// Resolve the active paper dimensions (in mm), supporting a 'custom' size
// whose dimensions are carried separately.
export function resolvePaperSize(paperSize, customPaper) {
    if (paperSize === 'custom' && customPaper && customPaper.width > 0 && customPaper.height > 0) {
        return { label: 'Custom', width: customPaper.width, height: customPaper.height };
    }
    return PAPER_SIZES[paperSize] || PAPER_SIZES.letter;
}

/**
 * Zine template definitions
 * layout: Array of [pageNumber, isUpsideDown] tuples in grid order (row by row)
 */
export const ZINE_TEMPLATES = {
    'mini-8': {
        label: '8-Page Mini-Zine',
        pages: 8,
        grid: { rows: 2, cols: 4 },
        // Grid order: row by row, left to right
        layout: MINI_ZINE_LAYOUT,
        gridAreas: `
            "page5 page4 page3 page2"
            "page6 page7 page8 page1"
        `,
        upsideDownPages: MINI_ZINE_UPSIDE_DOWN_PAGES,
        cutLines: {
            horizontal: {
                afterRow: 1,  // Cut between row 1 and 2
                fromPct: 25,  // Start at 1st column boundary (25% of width)
                toPct: 75     // End at 3rd column boundary (75% of width)
            }
        }
    },
    'accordion-16': {
        label: '16-Page Accordion',
        pages: 16,
        grid: { rows: 4, cols: 4 },
        layout: [
            { page: 4, upsideDown: true }, { page: 3, upsideDown: true },
            { page: 2, upsideDown: true }, { page: 1, upsideDown: true },
            { page: 5, upsideDown: false }, { page: 6, upsideDown: false },
            { page: 7, upsideDown: false }, { page: 8, upsideDown: false },
            { page: 12, upsideDown: true }, { page: 11, upsideDown: true },
            { page: 10, upsideDown: true }, { page: 9, upsideDown: true },
            { page: 13, upsideDown: false }, { page: 14, upsideDown: false },
            { page: 15, upsideDown: false }, { page: 16, upsideDown: false }
        ],
        gridAreas: `
            "page4 page3 page2 page1"
            "page5 page6 page7 page8"
            "page12 page11 page10 page9"
            "page13 page14 page15 page16"
        `,
        upsideDownPages: [1, 2, 3, 4, 9, 10, 11, 12],
        // Cut lines for accordion fold - vertical cuts on left and right edges
        cutLines: {
            leftEdge: { rows: [0, 1, 2] },   // Cut through rows 1-3, leave row 4 intact
            rightEdge: { rows: [0, 1, 2] }  // Same on right side
        },
        description: '1 sheet, 4×4 grid. Cut along edges then fold accordion-style.'
    },
    'dual-16': {
        label: '16-Page Dual Sheets',
        pages: 16,
        sheets: 2, // Uses 2 separate 8-page mini-zine sheets
        grid: { rows: 2, cols: 4 },
        description: '2 sheets, each folded like an 8-page zine.'
    }
};
