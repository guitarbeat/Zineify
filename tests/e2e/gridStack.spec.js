import { test, expect } from '@playwright/test';

test.describe('GridStack Layout', () => {
  test('recovers from invalid JSON in localStorage', async ({ page }) => {
    // Navigate to the page
    await page.goto('/');

    // Set invalid JSON for the layout
    await page.evaluate(() => {
      localStorage.setItem('zine-grid-v8', '{ bad_json ');
    });

    // Reload to trigger loadLayout
    await page.reload();

    // Verify layout loaded default grid items despite bad JSON
    const items = await page.locator('.grid-stack-item').count();
    expect(items).toBeGreaterThan(0);
  });

  test('handles localStorage.setItem error during layout save without throwing uncaught exceptions', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', (err) => {
      pageErrors.push(err.message);
    });

    await page.goto('/');

    // Mock localStorage.setItem to throw QuotaExceededError when grid layout key is set
    await page.evaluate(() => {
      const origSetItem = window.localStorage.setItem.bind(window.localStorage);
      window.localStorage.setItem = (key, val) => {
        if (key.includes('zine-grid')) {
          throw new DOMException('QuotaExceededError: Storage quota exceeded', 'QuotaExceededError');
        }
        return origSetItem(key, val);
      };

      // Trigger change event on grid element which calls saveLayout
      const gridEl = document.querySelector('.grid-stack');
      if (gridEl && gridEl.gridstack) {
        gridEl.gridstack._triggerEvent('change');
      }
    });

    // Ensure no unhandled storage error reached window page error handler
    const storageErrorOccurred = pageErrors.some((msg) => msg.includes('QuotaExceededError'));
    expect(storageErrorOccurred).toBe(false);
  });

  test("detects grid overlaps correctly using spatial grid algorithm", async ({ page }) => {
    await page.goto("/");

    const result = await page.evaluate(() => {
      const fn = window.__layoutHasOverlaps;
      if (typeof fn !== "function") {
        return { error: "window.__layoutHasOverlaps is not a function" };
      }

      // 1. Standard grid non-overlapping (12 nodes, <= 32 cols)
      const stdClean = Array.from({ length: 12 }, (_, i) => ({
        id: `n${i}`,
        x: (i % 4) * 3,
        y: Math.floor(i / 4) * 2,
        w: 3,
        h: 2
      }));

      // 2. Standard grid overlapping
      const stdOverlap = [
        ...Array.from({ length: 11 }, (_, i) => ({
          id: `n${i}`,
          x: (i % 4) * 3,
          y: Math.floor(i / 4) * 2,
          w: 3,
          h: 2
        })),
        { id: "n11", x: 1, y: 1, w: 3, h: 2 }
      ];

      // 3. Wide grid non-overlapping (> 32 cols)
      const wideClean = Array.from({ length: 12 }, (_, i) => ({
        id: `n${i}`,
        x: i * 4,
        y: 0,
        w: 4,
        h: 2
      }));

      // 4. Wide grid overlapping
      const wideOverlap = [
        ...Array.from({ length: 11 }, (_, i) => ({
          id: `n${i}`,
          x: i * 4,
          y: 0,
          w: 4,
          h: 2
        })),
        { id: "n11", x: 2, y: 0, w: 4, h: 2 }
      ];

      return {
        stdClean: fn(stdClean),
        stdOverlap: fn(stdOverlap),
        wideClean: fn(wideClean),
        wideOverlap: fn(wideOverlap)
      };
    });

    expect(result.error).toBeUndefined();
    expect(result.stdClean).toBe(false);
    expect(result.stdOverlap).toBe(true);
    expect(result.wideClean).toBe(false);
    expect(result.wideOverlap).toBe(true);
  });

  test("handles non-array JSON structures in localStorage gracefully", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.setItem("zine-grid-v8", JSON.stringify({ not: "an array" }));
    });
    await page.reload();
    const items = await page.locator(".grid-stack-item").count();
    expect(items).toBeGreaterThan(0);
  });

  test("handles array with malformed item objects in localStorage safely", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.setItem("zine-grid-v8", JSON.stringify([
        "not an object",
        null,
        { id: "brand", x: "invalid", y: -5, w: Infinity, h: NaN },
        { id: "canvas", x: 0, y: 3, w: 9, h: 10 }
      ]));
    });
    await page.reload();
    const items = await page.locator(".grid-stack-item").count();
    expect(items).toBeGreaterThan(0);
  });


  test('initGridStack initializes gridstack and exports window global helpers', async ({ page }) => {
    await page.goto('/');

    const result = await page.evaluate(() => {
      const gridEl = document.querySelector('.grid-stack');
      const hasGridstack = !!(gridEl && gridEl.gridstack);
      return {
        hasGridstack,
        hasReset: typeof window.__resetPanelLayout === 'function',
        hasResize: typeof window.__resizePanels === 'function',
        hasOverlaps: typeof window.__layoutHasOverlaps === 'function'
      };
    });

    expect(result.hasGridstack).toBe(true);
    expect(result.hasReset).toBe(true);
    expect(result.hasResize).toBe(true);
    expect(result.hasOverlaps).toBe(true);
  });

  test('initGridStack handles missing grid element safely', async ({ page }) => {
    await page.goto('/');

    const result = await page.evaluate(async () => {
      // Remove grid element and delete globals
      delete window.__resetPanelLayout;
      delete window.__resizePanels;
      delete window.__layoutHasOverlaps;

      const gridEl = document.querySelector('.grid-stack');
      if (gridEl) {
        gridEl.remove();
      }

      // Dynamically re-run initGridStack
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

  test('__resetPanelLayout clears grid storage keys', async ({ page }) => {
    await page.goto('/');

    const cleared = await page.evaluate(() => {
      localStorage.setItem('zine-grid-v8', '["test"]');
      localStorage.setItem('zine-grid-mobile-v8', '["test"]');

      // Override location.reload to avoid page navigation during test
      const origReload = window.location.reload;
      window.location.reload = () => {};

      if (typeof window.__resetPanelLayout === 'function') {
        window.__resetPanelLayout();
      }

      const desktopKey = localStorage.getItem('zine-grid-v8');
      const mobileKey = localStorage.getItem('zine-grid-mobile-v8');

      window.location.reload = origReload;

      return desktopKey === null && mobileKey === null;
    });

    expect(cleared).toBe(true);
  });

  test("handles array with malformed item objects in localStorage safely", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.setItem("zine-grid-v8", JSON.stringify([
        "not an object",
        null,
        { id: "brand", x: "invalid", y: -5, w: Infinity, h: NaN },
        { id: "canvas", x: 0, y: 3, w: 9, h: 10 }
      ]));
    });
    await page.reload();
    const items = await page.locator(".grid-stack-item").count();
    expect(items).toBeGreaterThan(0);
  });

});
