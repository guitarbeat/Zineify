import { createRequire } from 'module';
import DOMPurify from 'dompurify';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
import { test, expect } from '@playwright/test';
import { ExportService } from '../../src/services/ExportService.js';

test.describe('ExportService', () => {
  let mockUi;
  let mockState;
  let exportService;

  test.beforeEach(() => {
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
    global.window = dom.window;
    global.document = dom.window.document;
    global.DOMParser = dom.window.DOMParser;
    const purify = DOMPurify(dom.window);
    DOMPurify.sanitize = purify.sanitize;
    mockUi = {};
    mockState = {
      allPageImages: Array(8).fill(null),
      pageFlips: {},
      pageZooms: {},
      gridSize: { rows: 2, cols: 4 },
      paperSize: 'letter',
      orientation: 'landscape',
      margin: 0
    };
    exportService = new ExportService(mockUi, mockState);
  });

  test.describe('getPaperDimensions', () => {
    test('returns landscape dimensions for letter', () => {
      mockState.paperSize = 'letter';
      mockState.orientation = 'landscape';
      const dims = exportService.getPaperDimensions();
      expect(dims).toEqual({ width: 279.4, height: 215.9 });
    });

    test('returns portrait dimensions for letter', () => {
      mockState.paperSize = 'letter';
      mockState.orientation = 'portrait';
      const dims = exportService.getPaperDimensions();
      expect(dims).toEqual({ width: 215.9, height: 279.4 });
    });

    test('returns landscape dimensions for a4', () => {
      mockState.paperSize = 'a4';
      mockState.orientation = 'landscape';
      const dims = exportService.getPaperDimensions();
      expect(dims).toEqual({ width: 297, height: 210 });
    });
  });

  test.describe('buildPrintHtml', () => {
    test('wraps sheets HTML correctly', () => {
      const sheetsHtml = '<div class="sheet"></div>';
      const dims = { width: 100, height: 200 };
      const html = exportService.buildPrintHtml(sheetsHtml, dims);
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('@page { size: 100mm 200mm; margin: 0; }');
      expect(html).toContain('<div class="sheet"></div>');
    });
  });

  test.describe('buildSheetsHtml', () => {
    test('generates correct HTML for mini-8 template', () => {
      mockState.allPageImages = [
        'url1', 'url2', 'url3', 'url4',
        'url5', 'url6', 'url7', 'url8'
      ];
      mockState.gridSize = { rows: 2, cols: 4 }; // mini-8
      mockState.pageFlips = { 1: true }; // pageIndex 1 flipped
      mockState.pageZooms = { 2: true }; // pageIndex 2 zoomed
      mockState.paperSize = 'letter';
      mockState.orientation = 'landscape';
      mockState.margin = 5;

      const html = exportService.buildSheetsHtml();

      expect(html).toContain('display:grid;');
      expect(html).toContain('grid-template-columns:repeat(4,1fr);');
      expect(html).toContain('grid-template-rows:repeat(2,1fr);');
      expect(html).toContain('src="url1"');
      expect(html).toContain('src="url2"');
      expect(html).toContain('src="url8"');
      expect(html).toContain('alt="Page 1"');

      // zoomed image should have cover
      expect(html).toContain('object-fit:cover');
      expect(html).toContain('object-fit:contain');
    });

    test('handles empty slots with fallback div', () => {
      mockState.allPageImages = ['url1', null, 'url3'];
      mockState.gridSize = { rows: 1, cols: 2 };

      const html = exportService.buildSheetsHtml();
      expect(html).toContain('src="url1"');
      expect(html).toContain('background:#f0f0f0;');
    });

    test('handles basic sequential layout', () => {
        mockState.gridSize = { rows: 2, cols: 2 };
        mockState.allPageImages = ['url1', 'url2', 'url3', 'url4'];

        const html = exportService.buildSheetsHtml();
        expect(html).toContain('grid-template-columns:repeat(2,1fr);');
        expect(html).toContain('grid-template-rows:repeat(2,1fr);');
        expect(html).toContain('alt="Page 1"');
        expect(html).toContain('alt="Page 4"');
    });
  });

  test.describe('handleExport', () => {
    test('throws when no pages to export', async () => {
      mockState.allPageImages = Array(8).fill(null);
      await expect(exportService.handleExport()).rejects.toThrow('No pages to export.');
    });
  });

  test.describe('_drawCell', () => {
    test('calculates dimensions correctly for contain vs cover', () => {
      let drawImageArgs = null;
      let clipCalled = false;
      let restoreCalled = false;

      const mockCtx = {
        save: () => {},
        beginPath: () => {},
        rect: () => {},
        clip: () => { clipCalled = true; },
        translate: () => {},
        rotate: () => {},
        drawImage: (...args) => { drawImageArgs = args; },
        restore: () => { restoreCalled = true; },
      };

      const img = { naturalWidth: 200, naturalHeight: 100 }; // 2:1 aspect
      const cellW = 100;
      const cellH = 100; // 1:1 aspect

      // test contain
      exportService._drawCell({ ctx: mockCtx, img, cellX: 0, cellY: 0, cellW, cellH, rotateDeg: 0, scale: 1, objectFit: 'contain' });
      // Img aspect > cell aspect. Contains means width matches cell width. Width = 100.
      // Height = 100 / 2 = 50.
      expect(drawImageArgs[3]).toBeCloseTo(100);
      expect(drawImageArgs[4]).toBeCloseTo(50);

      // test cover
      exportService._drawCell({ ctx: mockCtx, img, cellX: 0, cellY: 0, cellW, cellH, rotateDeg: 0, scale: 1, objectFit: 'cover' });
      // Img aspect > cell aspect. Cover means height matches cell height. Height = 100.
      // Width = 100 * 2 = 200.
      expect(drawImageArgs[3]).toBeCloseTo(200);
      expect(drawImageArgs[4]).toBeCloseTo(100);

      expect(clipCalled).toBe(true);
      expect(restoreCalled).toBe(true);
    });

    test('calculates dimensions correctly for tall images', () => {
      let drawImageArgs = null;
      const mockCtx = {
        save: () => {}, beginPath: () => {}, rect: () => {}, clip: () => {},
        translate: () => {}, rotate: () => {}, restore: () => {},
        drawImage: (...args) => { drawImageArgs = args; },
      };

      const img = { naturalWidth: 100, naturalHeight: 200 }; // 1:2 aspect
      const cellW = 100;
      const cellH = 100; // 1:1 aspect

      // contain: height caps at cell height. Height = 100. Width = 100 / 2 = 50.
      exportService._drawCell({ ctx: mockCtx, img, cellX: 0, cellY: 0, cellW, cellH, rotateDeg: 0, scale: 1, objectFit: 'contain' });
      expect(drawImageArgs[3]).toBeCloseTo(50);
      expect(drawImageArgs[4]).toBeCloseTo(100);

      // cover: width caps at cell width. Width = 100. Height = 100 * 2 = 200.
      exportService._drawCell({ ctx: mockCtx, img, cellX: 0, cellY: 0, cellW, cellH, rotateDeg: 0, scale: 1, objectFit: 'cover' });
      expect(drawImageArgs[3]).toBeCloseTo(100);
      expect(drawImageArgs[4]).toBeCloseTo(200);
    });
  });



  test.describe('openPrintWindow', () => {
    test('sanitizes malicious script tags and event handlers before writing to window.open', async () => {
      let writtenHtml = null;
      const dummyDoc = new JSDOM('<!DOCTYPE html><html><body></body></html>').window.document;
      const mockWin = {
        document: {
          open: () => {},
          close: () => {},
          importNode: (node, deep) => dummyDoc.importNode(node, deep),
          replaceChild: (newChild, oldChild) => {
            writtenHtml = newChild.outerHTML;
            return dummyDoc.replaceChild(newChild, oldChild);
          },
          documentElement: dummyDoc.documentElement,
        },
        focus: () => {},
        print: () => {},
      };

      global.window = {
        open: () => mockWin
      };

      const unsafeHtml = '<html><head><title>Test</title></head><body><p>Safe Content</p><script>alert("xss")</script><img src="x" onerror="alert(1)"></body></html>';
      await exportService.openPrintWindow(unsafeHtml);

      expect(writtenHtml).toContain('<p>Safe Content</p>');
      expect(writtenHtml).not.toContain('<script>');
      expect(writtenHtml).not.toContain('alert');
      expect(writtenHtml).not.toContain('onerror');
    });

    test('sanitizes malicious script tags and event handlers before writing to iframe fallback', async () => {
      global.window = { open: () => null };
      let writtenHtml = null;

      const dummyFrameDoc = new JSDOM('<!DOCTYPE html><html><body></body></html>').window.document;
      const mockIframe = {
        style: {},
        setAttribute: () => {},
        contentDocument: {
          open: () => {},
          close: () => {},
          importNode: (node, deep) => dummyFrameDoc.importNode(node, deep),
          replaceChild: (newChild, oldChild) => {
            writtenHtml = newChild.outerHTML;
            return dummyFrameDoc.replaceChild(newChild, oldChild);
          },
          documentElement: dummyFrameDoc.documentElement,
        },
        contentWindow: {
          focus: () => {},
          print: () => {}
        },
        remove: () => {}
      };

      global.document = {
        createElement: (tag) => {
          if (tag === 'iframe') { return mockIframe; }
          return {};
        },
        body: {
          appendChild: (el) => {
            if (el === mockIframe) {
              setTimeout(() => { if (el.onload) { el.onload(); } }, 50);
            }
          }
        }
      };

      const unsafeHtml = '<html><head><title>Test</title></head><body><p>Iframe Safe</p><script>alert("xss")</script><img src="x" onerror="alert(1)"></body></html>';
      await exportService.openPrintWindow(unsafeHtml);

      expect(writtenHtml).toContain('<p>Iframe Safe</p>');
      expect(writtenHtml).not.toContain('<script>');
      expect(writtenHtml).not.toContain('alert');
      expect(writtenHtml).not.toContain('onerror');
    });

    test.afterEach(() => {
    });

    test('uses window.open if available', async () => {

      let openHtml = null;
      let printCalled = false;
      let focusCalled = false;

      const dummyDoc = new JSDOM('<!DOCTYPE html><html><body></body></html>').window.document;
      let _onloadHandler = null;
      const mockWin = {
        document: {
          open: () => {},
          close: () => {},
          importNode: (node, deep) => dummyDoc.importNode(node, deep),
          replaceChild: (newChild, oldChild) => {
            openHtml = newChild.outerHTML;
            return dummyDoc.replaceChild(newChild, oldChild);
          },
          documentElement: dummyDoc.documentElement,
          readyState: 'loading',
        },
        set onload(fn) {
          _onloadHandler = fn;
          setTimeout(() => { if (_onloadHandler) { _onloadHandler(); } }, 10);
        },
        get onload() {
          return _onloadHandler;
        },
        focus: () => { focusCalled = true; },
        print: () => { printCalled = true; },
      };

      global.window = {
        open: () => mockWin
      };

      await exportService.openPrintWindow('<p>Print</p>');

      expect(openHtml).toContain('<p>Print</p>');
      expect(printCalled).toBe(true);
      expect(focusCalled).toBe(true);

    });

    test('falls back to iframe if window.open fails', async () => {
      global.window = {
        open: () => null
      };

      let iframeAppended = false;
      let iframeHtml = null;
      let printCalled = false;
      let removeCalled = false;
      let focusCalled = false;

      const dummyFallbackDoc = new JSDOM('<!DOCTYPE html><html><body></body></html>').window.document;
      const mockIframe = {
        style: {},
        setAttribute: () => {},
        contentDocument: {
          open: () => {},
          close: () => {},
          importNode: (node, deep) => dummyFallbackDoc.importNode(node, deep),
          replaceChild: (newChild, oldChild) => {
            iframeHtml = newChild.outerHTML;
            return dummyFallbackDoc.replaceChild(newChild, oldChild);
          },
          documentElement: dummyFallbackDoc.documentElement,
        },
        contentWindow: {
          focus: () => { focusCalled = true; },
          print: () => { printCalled = true; }
        },
        remove: () => { removeCalled = true; }
      };

      global.document = {
        createElement: (tag) => {
          if (tag === 'iframe') {return mockIframe;}
          return {};
        },
        body: {
          appendChild: (el) => {
            if (el === mockIframe) {
              iframeAppended = true;
              setTimeout(() => {
                if (el.onload) {el.onload();}
              }, 50);
            }
          }
        }
      };

      await exportService.openPrintWindow('<p>Iframe Print</p>');

      expect(iframeAppended).toBe(true);
      expect(iframeHtml).toContain('<p>Iframe Print</p>');
      expect(printCalled).toBe(true);
      expect(focusCalled).toBe(true);

      // wait for remove
      await new Promise(r => setTimeout(r, 1100));
      expect(removeCalled).toBe(true);

    });
  });

  test.describe('_loadImage image caching', () => {
    test('returns cached promise on subsequent calls for the same URL', async () => {
      let instancesCreated = 0;
      global.Image = class MockImage {
        constructor() {
          instancesCreated++;
          this.onload = null;
          this.onerror = null;
          this._src = '';
        }
        set src(v) {
          this._src = v;
          setTimeout(() => { if (this.onload) { this.onload(); } }, 10);
        }
        get src() { return this._src; }
      };

      const url = 'data:image/png;base64,test1';
      const promise1 = exportService._loadImage(url);
      const promise2 = exportService._loadImage(url);

      expect(promise1).toBe(promise2);
      expect(instancesCreated).toBe(1);

      const [img1, img2] = await Promise.all([promise1, promise2]);
      expect(img1).toBe(img2);
    });

    test('removes URL from cache if image loading fails', async () => {
      global.Image = class MockImage {
        constructor() {
          this.onload = null;
          this.onerror = null;
          this._src = '';
        }
        set src(v) {
          this._src = v;
          setTimeout(() => { if (this.onerror) { this.onerror(new Error('Load error')); } }, 10);
        }
        get src() { return this._src; }
      };

      const url = 'data:image/png;base64,invalid';
      const promise1 = exportService._loadImage(url);
      await expect(promise1).rejects.toThrow();

      expect(exportService._imageCache.has(url)).toBe(false);
    });
  });
});
