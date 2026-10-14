import { test, expect } from '@playwright/test';

test.describe('AppController', () => {
  let controller;
  let AppController;

  test.beforeAll(async () => {
    // Setup basic DOM globals needed for UIManager instantiation before importing AppController
    if (typeof global !== 'undefined') {
      const { JSDOM } = await import('jsdom');
      const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'http://localhost/' });
      global.window = dom.window;
      global.document = dom.window.document;
      global.HTMLElement = dom.window.HTMLElement;

      // Polyfills and mocks for DOM features used by dependencies
      if (!global.localStorage) { global.localStorage = { getItem: () => null, setItem: () => {} }; }
      if (!global.window.matchMedia) {
        global.window.matchMedia = () => ({
          matches: false,
          addListener: () => {},
          removeListener: () => {}
        });
      }

      global.window.HTMLElement.prototype.scrollIntoView = function() {};

      global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
      global.window.HTMLCanvasElement.prototype.getContext = () => ({
        fillStyle: '', strokeStyle: '', lineWidth: 0, font: '', textAlign: '',
        fillRect: () => {}, strokeRect: () => {}, beginPath: () => {}, moveTo: () => {}, lineTo: () => {}, stroke: () => {}, fillText: () => {}
      });
      Object.defineProperty(global, 'navigator', {
        value: dom.window.navigator,
        writable: true,
        configurable: true
      });

      // Mock createObjectURL
      if (!global.URL.createObjectURL) {
        global.URL.createObjectURL = () => 'blob:test';
        global.URL.revokeObjectURL = () => {};
      }

      // We must dynamically import because it immediately touches the DOM
            // Mock Toast implementation globally to avoid import conflicts or use internal mock
      const toastModule = await import('../../../src/components/Toast.js');
      toastModule.toast.info = () => {};
      toastModule.toast.success = () => {};
      toastModule.toast.warning = () => {};
      toastModule.toast.error = () => {};

      const module = await import('../../../src/core/AppController.js');
      AppController = module.AppController;
    }
  });

  test.beforeEach(() => {
    // Mock Toast to prevent DOM errors during toast notifications
    const toastMock = {
      info: () => {},
      success: () => {},
      warning: () => {},
      error: () => {}
    };

    // Inject mock toast globally if necessary, or just rely on overriding it if we can intercept

    // Construct the controller
    controller = new AppController();

    // Mock the UI Manager
    controller.ui = {
      elements: {
        bookletPreviewContainer: document.createElement('div'),
        bookletPrevBtn: document.createElement('button'),
        bookletNextBtn: document.createElement('button'),
        bookletStatus: document.createElement('div'),
        zine3dContainer: document.createElement('div')
      },
      on: () => {},
      syncPaperSettings: () => {},
      setStatus: () => {},
      updateUploadedFilesList: () => {},
      updatePagePreview: () => {},
      setPageFlip: () => {},
      setPageZoom: () => {},
      updateWorkspaceState: () => {},
      generateLayout: () => {},
      toggle3DModal: () => {},
      setFoldProgressControl: () => {},
      modal: {
        showProgress: () => {},
        setProgressCopy: () => {},
        updateProgress: () => {},
        showPagePicker: async () => [1, 2] // Mock selection for PDF
      }
    };

    // Mock PDFProcessor
    controller.pdfProcessor = {
      initialize: async () => {},
      renderImageFile: async () => ({ width: 100, height: 100, isRealImage: true }),
      canvasToBlob: async (canvas) => canvas.isRealImage || canvas.isRealPage ? 'blob:mock-url' : 'blob:blank',
      revokeBlobUrl: () => {},
      loadPDF: async () => ({ numPages: 10, fileName: 'test.pdf' }),
      renderPage: async () => ({ width: 100, height: 100, isRealPage: true }),
      renderPageThumbnail: async () => ({ width: 50, height: 50 })
    };

    // Mock ExportService
    controller.exportService = {
      handlePrint: async () => {},
      handleExport: async () => {}
    };
  });

  test.afterEach(() => {
    if (controller && controller.undoManager) {
      controller.undoManager.clear();
    }
  });

  test('constructor initializes components properly', () => {
    expect(controller.state).toBeDefined();
    expect(controller.undoManager).toBeDefined();
    expect(controller.pdfProcessor).toBeDefined();
    expect(controller.ui).toBeDefined();
    expect(controller.exportService).toBeDefined();
  });

  test('init() sets up listeners and initial layout', async () => {
    let syncPaperCalled = false;
    let renderLayoutCalled = false;

    controller.ui.syncPaperSettings = () => { syncPaperCalled = true; };

    // Spy on renderCurrentLayout
    const originalRender = controller.renderCurrentLayout.bind(controller);
    controller.renderCurrentLayout = () => {
      renderLayoutCalled = true;
      originalRender();
    };

    await controller.init();

    expect(syncPaperCalled).toBe(true);
    expect(renderLayoutCalled).toBe(true);
  });

  test('handleGridSizeChanged updates state and triggers layout render', () => {
    let renderCalled = false;
    controller.renderCurrentLayout = () => { renderCalled = true; };

    controller.handleGridSizeChanged({ rows: 3, cols: 3 });

    expect(controller.state.gridSize.rows).toBe(3);
    expect(controller.state.gridSize.cols).toBe(3);
    expect(renderCalled).toBe(true);
  });

  test('handleFileSelected processes image upload correctly', async () => {
    const file = new File([''], 'test.png', { type: 'image/png' });

    let processImageUploadCalled = false;
    controller.processImageUpload = async (record) => {
      processImageUploadCalled = true;
      expect(record.file).toBe(file);
    };

    controller.handleFileSelected(file);

    // Process queue is asynchronous
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(controller.state.uploadedFiles.length).toBe(1);
    expect(controller.state.fileQueue.length).toBe(0); // already popped
    expect(processImageUploadCalled).toBe(true);
  });

  test('handleFileSelected processes pdf upload correctly', async () => {
    const file = new File(['%PDF'], 'test.pdf', { type: 'application/pdf' });

    let processPdfUploadCalled = false;
    controller.processPdfUpload = async (record) => {
      processPdfUploadCalled = true;
      expect(record.file).toBe(file);
    };

    controller.handleFileSelected(file);

    // Process queue is asynchronous
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(controller.state.uploadedFiles.length).toBe(1);
    expect(processPdfUploadCalled).toBe(true);
  });

  test('processImageUpload correctly updates state with image', async () => {
    const record = { file: new File([''], 'test.png', { type: 'image/png' }), name: 'test.png' };

    // Should insert at index 0 initially
    expect(controller.state.getFilledPageCount()).toBe(0);

    await controller.processImageUpload(record);

    expect(controller.state.allPageImages[0]).toBe('blob:mock-url');
    expect(controller.state.getFilledPageCount()).toBe(1);
  });

  test('processPdfUpload correctly imports selected pages', async () => {
    const record = { file: new File([''], 'test.pdf', { type: 'application/pdf' }), name: 'test.pdf' };

    await controller.processPdfUpload(record);

    // Our mock showPagePicker returns [1, 2] so it should import 2 pages
    expect(controller.state.allPageImages[0]).toBe('blob:mock-url');
    expect(controller.state.allPageImages[1]).toBe('blob:mock-url');
    expect(controller.state.getFilledPageCount()).toBe(2);
  });

  test('handlePageFlipped toggles flip state and pushes to undo stack', () => {
    // Fill a page first
    controller.state.allPageImages[0] = 'blob:test';

    expect(controller.state.pageFlips[0]).toBeFalsy();

    controller.handlePageFlipped(0);

    expect(controller.state.pageFlips[0]).toBe(true);
    expect(controller.undoManager.size).toBe(1);

    controller.handlePageFlipped(0);

    expect(controller.state.pageFlips[0]).toBe(false);
    expect(controller.undoManager.size).toBe(2);
  });

  test('handlePageRemoved removes page and prepares undo', () => {
    controller.state.allPageImages[0] = 'blob:test';
    controller.state.pageFlips[0] = true;

    controller.handlePageRemoved(0);

    expect(controller.state.allPageImages[0]).toBe(null);
    expect(controller.state.pageFlips[0]).toBe(false);
    expect(controller.undoManager.size).toBe(1);
  });

  test('handleUndo restores previous state', () => {
    controller.state.allPageImages[0] = 'blob:initial';

    // push current state
    controller._pushSnapshot('Test snapshot');

    // mutate state
    controller.state.allPageImages[0] = 'blob:changed';

    // undo
    controller.handleUndo();

    expect(controller.state.allPageImages[0]).toBe('blob:initial');
  });

  test('handleClearAll resets all state', () => {
    controller.state.allPageImages[0] = 'blob:test';
    controller.state.uploadedFiles.push({});
    controller.state.totalPages = 1;

    controller.handleClearAll();

    expect(controller.state.allPageImages[0]).toBe(null);
    expect(controller.state.uploadedFiles.length).toBe(0);
    expect(controller.state.totalPages).toBe(0);
    expect(controller.undoManager.size).toBe(1); // pushes a clear snapshot
  });
});
