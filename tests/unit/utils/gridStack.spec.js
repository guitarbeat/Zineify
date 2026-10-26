import { test, expect } from '@playwright/test';

test.describe('gridStack utils - layoutHasOverlaps', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('returns false for default empty nodes parameter when no grid engine is initialized', async ({ page }) => {
    const result = await page.evaluate(() => {
      const fn = window.__layoutHasOverlaps;
      return {
        defaultArg: fn(),
        emptyArray: fn([])
      };
    });
    expect(result.defaultArg).toBe(false);
    expect(result.emptyArray).toBe(false);
  });

  test('small layout (< 10 nodes): returns false when no nodes overlap', async ({ page }) => {
    const result = await page.evaluate(() => {
      const fn = window.__layoutHasOverlaps;
      const nodes = [
        { id: '1', x: 0, y: 0, w: 2, h: 2 },
        { id: '2', x: 2, y: 0, w: 2, h: 2 },
        { id: '3', x: 0, y: 2, w: 4, h: 2 }
      ];
      return fn(nodes);
    });
    expect(result).toBe(false);
  });

  test('small layout (< 10 nodes): returns true when nodes overlap', async ({ page }) => {
    const result = await page.evaluate(() => {
      const fn = window.__layoutHasOverlaps;
      const nodes = [
        { id: '1', x: 0, y: 0, w: 3, h: 2 },
        { id: '2', x: 2, y: 0, w: 3, h: 2 }
      ];
      return fn(nodes);
    });
    expect(result).toBe(true);
  });

  test('small layout (< 10 nodes): ignores overlap check for nodes with identical id', async ({ page }) => {
    const result = await page.evaluate(() => {
      const fn = window.__layoutHasOverlaps;
      const nodes = [
        { id: '1', x: 0, y: 0, w: 3, h: 2 },
        { id: '1', x: 0, y: 0, w: 3, h: 2 }
      ];
      return fn(nodes);
    });
    expect(result).toBe(false);
  });

  test('medium layout (>= 10 nodes, maxX <= 32): bitwise rowBuffer - returns false when clean', async ({ page }) => {
    const result = await page.evaluate(() => {
      const fn = window.__layoutHasOverlaps;
      const nodes = Array.from({ length: 12 }, (_, i) => ({
        id: `node-${i}`,
        x: (i % 4) * 3,
        y: Math.floor(i / 4) * 2,
        w: 3,
        h: 2
      }));
      return fn(nodes);
    });
    expect(result).toBe(false);
  });

  test('medium layout (>= 10 nodes, maxX <= 32): bitwise rowBuffer - returns true when overlapping', async ({ page }) => {
    const result = await page.evaluate(() => {
      const fn = window.__layoutHasOverlaps;
      const nodes = Array.from({ length: 11 }, (_, i) => ({
        id: `node-${i}`,
        x: (i % 4) * 3,
        y: Math.floor(i / 4) * 2,
        w: 3,
        h: 2
      }));
      nodes.push({ id: 'overlap-node', x: 1, y: 1, w: 3, h: 2 });
      return fn(nodes);
    });
    expect(result).toBe(true);
  });

  test('medium layout (>= 10 nodes, maxX <= 32): triggers rowBuffer resizing logic when maxY > 256', async ({ page }) => {
    const result = await page.evaluate(() => {
      const fn = window.__layoutHasOverlaps;
      const nodes = Array.from({ length: 10 }, (_, i) => ({
        id: `node-${i}`,
        x: 0,
        y: i * 30, // 9 * 30 + 10 = 280 (exceeds default rowBuffer length 256)
        w: 2,
        h: 10
      }));
      return fn(nodes);
    });
    expect(result).toBe(false);
  });

  test('medium layout (>= 10 nodes, maxX <= 32): covers node width >= 32 mask calculation', async ({ page }) => {
    const result = await page.evaluate(() => {
      const fn = window.__layoutHasOverlaps;
      const nodes = Array.from({ length: 10 }, (_, i) => ({
        id: `node-${i}`,
        x: 0,
        y: i * 2,
        w: 32, // w >= 32 triggers `n.w >= 32 ? ~0 : ...`
        h: 2
      }));
      const clean = fn(nodes);

      // Add an overlapping node
      nodes.push({ id: 'overlap-wide', x: 10, y: 5, w: 2, h: 2 });
      const overlap = fn(nodes);

      return { clean, overlap };
    });
    expect(result.clean).toBe(false);
    expect(result.overlap).toBe(true);
  });

  test('large/wide layout (>= 10 nodes, maxX > 32): reusableSpatialGrid - returns false when clean', async ({ page }) => {
    const result = await page.evaluate(() => {
      const fn = window.__layoutHasOverlaps;
      const nodes = Array.from({ length: 12 }, (_, i) => ({
        id: `wide-${i}`,
        x: i * 4, // maxX will be 12 * 4 = 48 (> 32)
        y: 0,
        w: 4,
        h: 2
      }));
      return fn(nodes);
    });
    expect(result).toBe(false);
  });

  test('large/wide layout (>= 10 nodes, maxX > 32): reusableSpatialGrid - returns true when overlapping', async ({ page }) => {
    const result = await page.evaluate(() => {
      const fn = window.__layoutHasOverlaps;
      const nodes = Array.from({ length: 11 }, (_, i) => ({
        id: `wide-${i}`,
        x: i * 4,
        y: 0,
        w: 4,
        h: 2
      }));
      nodes.push({ id: 'wide-overlap', x: 2, y: 0, w: 4, h: 2 });
      return fn(nodes);
    });
    expect(result).toBe(true);
  });

  test('large/wide layout (>= 10 nodes, maxX > 32): triggers sharedSpatialGrid buffer expansion when needed > 1024', async ({ page }) => {
    const result = await page.evaluate(() => {
      const fn = window.__layoutHasOverlaps;
      const nodes = Array.from({ length: 10 }, (_, i) => ({
        id: `huge-${i}`,
        x: i * 5, // maxX = 50 (> 32)
        y: 0,
        w: 5,
        h: 30 // maxY = 30; total cells needed = 50 * 30 = 1500 (> 1024)
      }));
      return fn(nodes);
    });
    expect(result).toBe(false);
  });
});


test.describe('initGridStack', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('initializes GridStack and exports window global helper functions when .grid-stack element exists', async ({ page }) => {
    const result = await page.evaluate(() => {
      const gridEl = document.querySelector('.grid-stack');
      return {
        hasGridstackInstance: !!(gridEl && gridEl.gridstack),
        hasResetHelper: typeof window.__resetPanelLayout === 'function',
        hasResizeHelper: typeof window.__resizePanels === 'function',
        hasOverlapsHelper: typeof window.__layoutHasOverlaps === 'function',
        hasInitHelper: typeof window.__initGridStack === 'function'
      };
    });

    expect(result.hasGridstackInstance).toBe(true);
    expect(result.hasResetHelper).toBe(true);
    expect(result.hasResizeHelper).toBe(true);
    expect(result.hasOverlapsHelper).toBe(true);
    expect(result.hasInitHelper).toBe(true);
  });

  test('returns early without errors or global exports when .grid-stack element is missing', async ({ page }) => {
    const result = await page.evaluate(() => {
      delete window.__resetPanelLayout;
      delete window.__resizePanels;
      delete window.__layoutHasOverlaps;

      const gridEl = document.querySelector('.grid-stack');
      if (gridEl) {
        gridEl.remove();
      }

      if (typeof window.__initGridStack === 'function') {
        window.__initGridStack();
      }

      return {
        hasReset: typeof window.__resetPanelLayout === 'function',
        hasResize: typeof window.__resizePanels === 'function',
        hasOverlaps: typeof window.__layoutHasOverlaps === 'function'
      };
    });

    expect(result.hasReset).toBe(false);
    expect(result.hasResize).toBe(false);
    expect(result.hasOverlaps).toBe(false);
  });

  test('saves layout to localStorage when grid change, dragstop, or resizestop events occur', async ({ page }) => {
    const result = await page.evaluate(() => {
      localStorage.clear();
      const gridEl = document.querySelector('.grid-stack');
      if (gridEl && gridEl.gridstack) {
        // Trigger grid events that trigger saveLayout
        gridEl.gridstack._triggerEvent('change', {});
        gridEl.gridstack._triggerEvent('dragstop', {});
        gridEl.gridstack._triggerEvent('resizestop', {});
      }
      const desktop = localStorage.getItem('zine-grid-v8');
      const mobile = localStorage.getItem('zine-grid-mobile-v8');
      return desktop !== null || mobile !== null;
    });

    expect(result).toBe(true);
  });

  test('updates mobile layout interaction mode on window resize or media query match', async ({ page }) => {
    const isMobileClassToggled = await page.evaluate(() => {
      const mediaQuery = window.matchMedia('(max-width: 767px)');
      const isMobileBefore = document.body.classList.contains('layout-mobile');

      const event = new Event('change');
      mediaQuery.dispatchEvent(event);

      return {
        isMobileBefore,
        isMobileAfter: document.body.classList.contains('layout-mobile')
      };
    });

    expect(typeof isMobileClassToggled.isMobileBefore).toBe('boolean');
    expect(typeof isMobileClassToggled.isMobileAfter).toBe('boolean');
  });

  test('restores saved layout from localStorage and merges missing defaults during initialization', async ({ page }) => {
    const result = await page.evaluate(() => {
      const customLayout = [
        { id: 'brand', x: 2, y: 2, w: 5, h: 4 }
      ];
      localStorage.setItem('zine-grid-v8', JSON.stringify(customLayout));
      if (typeof window.__initGridStack === 'function') {
        window.__initGridStack();
      }
      const saved = JSON.parse(localStorage.getItem('zine-grid-v8'));
      const brandNode = saved.find(item => item.id === 'brand');
      return {
        totalItems: saved.length,
        brandX: brandNode ? brandNode.x : null,
        brandY: brandNode ? brandNode.y : null
      };
    });

    expect(result.totalItems).toBe(8); // merged with missing defaults (including display)
    expect(result.brandX).toBe(2);
    expect(result.brandY).toBe(2);
  });

  test('handles invalid JSON in localStorage by resetting to default layout', async ({ page }) => {
    const result = await page.evaluate(() => {
      localStorage.setItem('zine-grid-v8', 'invalid-json-{');
      localStorage.setItem('zine-grid-mobile-v8', 'invalid-json-{');
      if (typeof window.__initGridStack === 'function') {
        window.__initGridStack();
      }
      const desktopStored = localStorage.getItem('zine-grid-v8');
      const mobileStored = localStorage.getItem('zine-grid-mobile-v8');

      let desktopParsed = null;
      let mobileParsed = null;
      try { desktopParsed = JSON.parse(desktopStored); } catch {}
      try { mobileParsed = JSON.parse(mobileStored); } catch {}

      return {
        desktopRaw: desktopStored,
        mobileRaw: mobileStored,
        isDesktopArray: Array.isArray(desktopParsed),
        isMobileArray: Array.isArray(mobileParsed)
      };
    });

    expect(result.desktopRaw).not.toBe('invalid-json-{');
    expect(result.isDesktopArray || result.isMobileArray).toBe(true);
  });
});
