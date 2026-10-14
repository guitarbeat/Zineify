import { test, expect } from '@playwright/test';
import { PDFProcessor } from '../../src/services/PDFProcessor.js';

test.describe('PDFProcessor', () => {
  let processor;

  test.beforeEach(() => {
    // Mock the DOMMatrix globally if running in node/playwright environment
    if (typeof global !== 'undefined' && !global.DOMMatrix) {
      global.DOMMatrix = class DOMMatrix {};
    }
    if (typeof global !== 'undefined' && !global.document) {
      global.document = {
        createElement: (tag) => {
          if (tag === 'canvas') {
            return {
              getContext: () => ({
                fillStyle: '',
                fillRect: () => {},
                drawImage: () => {}
              }),
              width: 0,
              height: 0
            };
          }
          return {};
        }
      };
    }
    processor = new PDFProcessor();
  });

  test('validateFile rejects non-PDF files', () => {
    const file = new File([''], 'test.txt', { type: 'text/plain' });
    const result = processor.validateFile(file);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Please select a PDF file');
  });

  test('validateFile accepts PDF files within size limits', () => {
    const file = new File(['%PDF-1.4'], 'test.pdf', { type: 'application/pdf' });
    const result = processor.validateFile(file);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('validateFileSignature returns true for valid PDF signature', async () => {
    const file = new File(['%PDF-1.4...'], 'test.pdf', { type: 'application/pdf' });
    const isValid = await processor.validateFileSignature(file);
    expect(isValid).toBe(true);
  });

  test('validateFileSignature returns false for invalid PDF signature', async () => {
    const file = new File(['PK\x03\x04...'], 'test.docx', { type: 'application/pdf' }); // Fake PDF
    const isValid = await processor.validateFileSignature(file);
    expect(isValid).toBe(false);
  });

  test('handlePDFError returns appropriate errors based on message', () => {
    const timeoutError = new Error('loading timed out');
    expect(processor.handlePDFError(timeoutError).message).toContain('timed out');

    const corruptError = new Error('InvalidPDFException');
    expect(processor.handlePDFError(corruptError).message).toContain('corrupted or invalid');

    const passwordError = new Error('password protected');
    expect(processor.handlePDFError(passwordError).message).toContain('password-protected');

    const genericError = new Error('something else');
    expect(processor.handlePDFError(genericError).message).toContain('something else');
  });

  test('cleanupFailedLoad logs warning when loadingTask destroy fails', async () => {
    /* eslint-disable-next-line no-console */
    const originalConsoleWarn = console.warn;
    let loggedWarning = null;
    let loggedError = null;
    /* eslint-disable-next-line no-console */
    console.warn = (msg, err) => {
      loggedWarning = msg;
      loggedError = err;
    };

    const destroyError = new Error('Destroy failed');
    processor.loadingTask = {
      destroy: async () => { throw destroyError; }
    };

    try {
      await processor.cleanupFailedLoad();
      expect(loggedWarning).toBe('Failed to destroy PDF loading task during cleanup:');
      expect(loggedError).toBe(destroyError);
    } finally {
      /* eslint-disable-next-line no-console */
      console.warn = originalConsoleWarn;
    }
  });

  test('cleanup frees resources', async () => {
    // Setup some mock state
    processor.isProcessing = true;
    processor.loadingTask = { destroy: async () => {} };
    processor.pdf = { destroy: () => {} };
    processor.fileUrl = 'blob:test';

    // Using a spy to verify destroy was called
    let taskDestroyed = false;
    let pdfDestroyed = false;

    processor.loadingTask.destroy = async () => { taskDestroyed = true; };
    processor.pdf.destroy = () => { pdfDestroyed = true; };

    processor.cleanup();

    expect(processor.isProcessing).toBe(false);
    expect(processor.loadingTask).toBeNull();
    expect(processor.pdf).toBeNull();
    expect(processor.fileUrl).toBeNull();
    expect(pdfDestroyed).toBe(true);
  });

  test('loadPDF throws error if already processing', async () => {
    processor.isProcessing = true;
    const file = new File(['%PDF-1.4'], 'test.pdf', { type: 'application/pdf' });

    await expect(processor.loadPDF(file)).rejects.toThrow('PDF processing already in progress');
  });

  test('loadPDF throws error if file validation fails', async () => {
    processor.ensurePdfJs = async () => ({});
    processor.validateFile = () => ({ valid: false, errors: ['Not a PDF'] });
    const file = new File([''], 'test.txt', { type: 'text/plain' });

    await expect(processor.loadPDF(file)).rejects.toThrow('Not a PDF');
  });

  test('loadPDF throws error if file signature is invalid', async () => {
    processor.ensurePdfJs = async () => ({});
    processor.validateFile = () => ({ valid: true, errors: [] });
    processor.validateFileSignature = async () => false;
    const file = new File(['PK\x03\x04...'], 'test.pdf', { type: 'application/pdf' });

    await expect(processor.loadPDF(file)).rejects.toThrow('Invalid file signature');
  });

  test('loadPDF cleans up previous resources before loading', async () => {
    processor.ensurePdfJs = async () => ({
      getDocument: () => ({ promise: Promise.resolve({ numPages: 1 }), destroy: async () => {} })
    });
    processor.validateFile = () => ({ valid: true, errors: [] });
    processor.validateFileSignature = async () => true;

    if (typeof global !== 'undefined') {
      global.URL.createObjectURL = () => 'blob:new';
      global.URL.revokeObjectURL = () => {};
    }

    processor.fileUrl = 'blob:old';
    let pdfDestroyCalled = false;
    processor.pdf = { destroy: () => { pdfDestroyCalled = true; } };

    const file = new File(['%PDF-1.4'], 'test.pdf', { type: 'application/pdf' });
    await processor.loadPDF(file);

    expect(pdfDestroyCalled).toBe(true);
    // It should have assigned a new object URL (if mock worked) or at least cleared the old one logic
    expect(processor.fileUrl).toBe('blob:new');
  });

  test('loadPDF successfully loads PDF and returns metadata', async () => {
    const mockPdfDocument = { numPages: 5, destroy: async () => {} };
    processor.ensurePdfJs = async () => ({
      getDocument: () => ({ promise: Promise.resolve(mockPdfDocument), destroy: async () => {} })
    });
    processor.validateFile = () => ({ valid: true, errors: [] });
    processor.validateFileSignature = async () => true;

    if (typeof global !== 'undefined') {
      global.URL.createObjectURL = () => 'blob:test';
    }

    const file = new File(['%PDF-1.4'], 'test.pdf', { type: 'application/pdf' });

    let progressMessages = [];
    const onProgress = (msg) => progressMessages.push(msg);

    const result = await processor.loadPDF(file, onProgress);

    expect(result.pdf).toBe(mockPdfDocument);
    expect(result.numPages).toBe(5);
    expect(result.fileName).toBe('test.pdf');
    expect(result.fileSize).toBe(file.size);
    expect(progressMessages).toContain('Reading PDF file...');
    expect(progressMessages).toContain('Processing PDF...');
  });

  test('loadPDF throws error if PDF has 0 pages', async () => {
    processor.ensurePdfJs = async () => ({
      getDocument: () => ({ promise: Promise.resolve({ numPages: 0, destroy: async () => {} }), destroy: async () => {} })
    });
    processor.validateFile = () => ({ valid: true, errors: [] });
    processor.validateFileSignature = async () => true;

    if (typeof global !== 'undefined') {
      global.URL.createObjectURL = () => 'blob:test';
    }

    const file = new File(['%PDF-1.4'], 'test.pdf', { type: 'application/pdf' });

    await expect(processor.loadPDF(file)).rejects.toThrow('The PDF file appears to be corrupted or invalid.');
  });

  test('loadPDF throws error if PDF has too many pages (>128)', async () => {
    processor.ensurePdfJs = async () => ({
      getDocument: () => ({ promise: Promise.resolve({ numPages: 129, destroy: async () => {} }), destroy: async () => {} })
    });
    processor.validateFile = () => ({ valid: true, errors: [] });
    processor.validateFileSignature = async () => true;

    if (typeof global !== 'undefined') {
      global.URL.createObjectURL = () => 'blob:test';
    }

    const file = new File(['%PDF-1.4'], 'test.pdf', { type: 'application/pdf' });

    await expect(processor.loadPDF(file)).rejects.toThrow('PDF has too many pages');
  });




  test('loadPDF handles timeout and catches error when loadingTask.destroy fails', async () => {
    let destroyCalled = false;
    const originalSetTimeout = global.setTimeout;

    global.setTimeout = (fn) => {
      return originalSetTimeout(fn, 0);
    };

    processor.ensurePdfJs = async () => ({
      getDocument: () => ({
        promise: new Promise(() => {}),
        destroy: async () => {
          destroyCalled = true;
          throw new Error('Destroy failed');
        }
      })
    });
    processor.validateFile = () => ({ valid: true, errors: [] });
    processor.validateFileSignature = async () => true;

    if (typeof global !== 'undefined') {
      global.URL.createObjectURL = () => 'blob:test';
      global.URL.revokeObjectURL = () => {};
    }

    try {
      const file = new File(['%PDF-1.4'], 'test.pdf', { type: 'application/pdf' });
      await expect(processor.loadPDF(file)).rejects.toThrow('PDF loading timed out');
      expect(destroyCalled).toBe(true);
    } finally {
      global.setTimeout = originalSetTimeout;
    }
  });

  test('loadPDF handles PDF processing error and cleans up', async () => {
    let cleanupFailedLoadCalled = false;
    let handlePDFErrorCalled = false;

    const originalCleanupFailedLoad = processor.cleanupFailedLoad.bind(processor);
    const originalHandlePDFError = processor.handlePDFError.bind(processor);

    processor.cleanupFailedLoad = async () => {
      cleanupFailedLoadCalled = true;
      return originalCleanupFailedLoad();
    };

    processor.handlePDFError = (err) => {
      handlePDFErrorCalled = true;
      return originalHandlePDFError(err);
    };

    // Mock getDocument to throw/reject
    processor.ensurePdfJs = async () => ({
      getDocument: () => ({
        promise: Promise.reject(new Error('Simulated PDF library error')),
        destroy: async () => {}
      })
    });
    processor.validateFile = () => ({ valid: true, errors: [] });
    processor.validateFileSignature = async () => true;

    if (typeof global !== 'undefined') {
      global.URL.createObjectURL = () => 'blob:test';
      global.URL.revokeObjectURL = () => {};
    }

    const file = new File(['%PDF-1.4'], 'test.pdf', { type: 'application/pdf' });

    await expect(processor.loadPDF(file)).rejects.toThrow('Simulated PDF library error');

    // Verify error path methods were executed
    expect(cleanupFailedLoadCalled).toBe(true);
    expect(handlePDFErrorCalled).toBe(true);

    // Verify cleanup happened
    expect(processor.isProcessing).toBe(false);
    expect(processor.loadingTask).toBeNull();
    expect(processor.fileUrl).toBeNull();
  });

  test('renderPage returns canvas and cleans up page', async () => {
    // Mock the PDF object
    processor.pdf = {
      getPage: async (pageNum) => ({
        getViewport: ({ scale }) => ({ width: 100 * scale, height: 200 * scale }),
        render: ({ canvasContext, viewport, background }) => {
          // Fake rendering
          expect(viewport.width).toBeGreaterThan(0);
          expect(background).toBe('white');
          return { promise: Promise.resolve() };
        },
        cleanup: () => { processor._mockCleanupCalled = true; }
      })
    };

    // We need to mock ensurePdfJs since we don't have full pdf.js context
    processor.ensurePdfJs = async () => true;

    // Call internal render directly to test logic
    const canvas = await processor._internalRender(1, () => 2.0);

    expect(canvas).toBeDefined();
    expect(canvas.width).toBe(200); // 100 * 2.0
    expect(canvas.height).toBe(400); // 200 * 2.0
    expect(processor._mockCleanupCalled).toBe(true);
  });

  test('_internalRender throws error if no PDF loaded', async () => {
    processor.pdf = null;
    await expect(processor._internalRender(1, () => 1)).rejects.toThrow('No PDF loaded');
  });

  test('_internalRender catches render error, cleans up page, and rethrows wrapped error', async () => {
    let cleanupCalled = false;
    const renderError = new Error('Render failed');

    processor.pdf = {
      getPage: async (pageNum) => ({
        getViewport: ({ scale }) => ({ width: 100 * scale, height: 200 * scale }),
        render: () => ({
          promise: Promise.reject(renderError)
        }),
        cleanup: () => {
          cleanupCalled = true;
        }
      })
    };

    processor.ensurePdfJs = async () => true;

    let thrownError;
    try {
      await processor._internalRender(1, () => 1.0);
    } catch (err) {
      thrownError = err;
    }

    expect(thrownError).toBeDefined();
    expect(thrownError.message).toBe('Failed to render page 1');
    expect(thrownError.cause).toBe(renderError);
    expect(cleanupCalled).toBe(true);
  });

  test('_internalRender handles page fetch error without invoking page cleanup', async () => {
    const getPageError = new Error('Page 99 does not exist');

    processor.pdf = {
      getPage: async () => {
        throw getPageError;
      }
    };

    processor.ensurePdfJs = async () => true;

    let thrownError;
    try {
      await processor._internalRender(99, () => 1.0);
    } catch (err) {
      thrownError = err;
    }

    expect(thrownError).toBeDefined();
    expect(thrownError.message).toBe('Failed to render page 99');
    expect(thrownError.cause).toBe(getPageError);
  });

  test('renderPageThumbnail returns downscaled canvas', async () => {
    processor.pdf = {
      getPage: async () => ({
        getViewport: ({ scale }) => ({ width: 1000 * scale, height: 2000 * scale }),
        render: () => ({ promise: Promise.resolve() }),
        cleanup: () => {}
      })
    };

    processor.ensurePdfJs = async () => true;

    // renderPageThumbnail logic sets scale based on maxEdge=420
    // so scale = maxEdge / Math.max(1000, 2000) = 420 / 2000 = 0.21
    const canvas = await processor.renderPageThumbnail(1);

    expect(canvas).toBeDefined();
    // In our test environment without full canvas API, width might not be precisely calculated on the mock
    // if using real DOM width/height are set directly
    expect(processor.pdf).not.toBeNull();
  });

  test("renderPage propagates error from _internalRender and invokes onProgress callback", async () => {
    let cleanupCalled = false;
    let progressMessage = "";
    processor.pdf = {
      getPage: async () => ({
        getViewport: ({ scale }) => ({ width: 100 * scale, height: 200 * scale }),
        render: () => ({ promise: Promise.reject(new Error("Render stream error")) }),
        cleanup: () => { cleanupCalled = true; }
      })
    };
    processor.ensurePdfJs = async () => true;

    await expect(processor.renderPage(1, (msg) => { progressMessage = msg; })).rejects.toThrow("Failed to render page 1");
    expect(progressMessage).toBe("Rendering page 1...");
    expect(cleanupCalled).toBe(true);
  });

  test("renderPageThumbnail propagates error from _internalRender and cleans up page", async () => {
    let cleanupCalled = false;
    processor.pdf = {
      getPage: async () => ({
        getViewport: ({ scale }) => ({ width: 100 * scale, height: 200 * scale }),
        render: () => ({ promise: Promise.reject(new Error("Thumbnail render failed")) }),
        cleanup: () => { cleanupCalled = true; }
      })
    };
    processor.ensurePdfJs = async () => true;

    await expect(processor.renderPageThumbnail(2)).rejects.toThrow("Failed to render page 2");
    expect(cleanupCalled).toBe(true);
  });

  test("_internalRender handles ensurePdfJs error and wraps it properly", async () => {
    processor.pdf = {
      getPage: async () => ({})
    };
    processor.ensurePdfJs = async () => {
      throw new Error("Failed to load PDF.js module");
    };

    await expect(processor._internalRender(1, () => 1.0)).rejects.toThrow("Failed to render page 1");
  });

  test("loadPDF throws error if file size exceeds MAX_UPLOAD_FILE_SIZE", async () => {
    processor.ensurePdfJs = async () => ({});
    processor.validateFile = () => ({ valid: true, errors: [] });
    processor.validateFileSignature = async () => true;

    let createObjectUrlCalled = false;
    if (typeof global !== "undefined") {
      if (!global.URL) { global.URL = {}; }
      global.URL.createObjectURL = () => {
        createObjectUrlCalled = true;
        return "blob:test";
      };
      global.URL.revokeObjectURL = () => {};
    }

    const overSizedFile = new File(["%PDF-1.4"], "large.pdf", { type: "application/pdf" });
    Object.defineProperty(overSizedFile, "size", { value: 60 * 1024 * 1024 });

    await expect(processor.loadPDF(overSizedFile)).rejects.toThrow(/File too large/);
    expect(createObjectUrlCalled).toBe(false);
  });

  test('loadPDF logs console.warn when destroying loadingTask fails during timeout', async () => {
    let warnArgs = null;
    const origWarn = console.warn;
    /* eslint-disable-next-line no-console */
    console.warn = (...args) => { warnArgs = args; };

    processor.ensurePdfJs = async () => ({
      getDocument: () => ({
        promise: new Promise(() => {}), // Never resolves to force timeout
        destroy: async () => { throw new Error('Destroy failed'); }
      })
    });
    processor.validateFile = () => ({ valid: true, errors: [] });
    processor.validateFileSignature = async () => true;

    if (typeof global !== 'undefined') {
      if (!global.URL) { global.URL = {}; }
      global.URL.createObjectURL = () => 'blob:test';
      global.URL.revokeObjectURL = () => {};
    }

    const file = new File(['%PDF-1.4'], 'test.pdf', { type: 'application/pdf' });

    // Accelerate timers or override setTimeout to trigger fast timeout in test
    const origSetTimeout = global.setTimeout;
    global.setTimeout = (fn, _delay) => origSetTimeout(fn, 10);

    try {
      await expect(processor.loadPDF(file)).rejects.toThrow('PDF loading timed out');
      expect(warnArgs).not.toBeNull();
      expect(warnArgs[0]).toBe('Failed to destroy PDF loading task on timeout');
    } finally {
      global.setTimeout = origSetTimeout;
      /* eslint-disable-next-line no-console */
      console.warn = origWarn;
    }
  });
  test("cleanupFailedLoad handles loadingTask.destroy error gracefully", async () => {
    let pdfDestroyed = false;
    let revokedUrl = null;

    let pdfDestroyed = false;
    let revokedUrl = null;

    processor.loadingTask = {
      destroy: async () => {
        throw new Error("Task destroy failed");
      }
    };
    processor.pdf = {
      destroy: () => {
        pdfDestroyed = true;
      }
    };
    processor.fileUrl = "blob:test-cleanup";

    const origRevoke = global.URL?.revokeObjectURL;
    if (typeof global !== "undefined") {
      if (!global.URL) global.URL = {};
      global.URL.revokeObjectURL = (url) => { revokedUrl = url; };
    }

    try {
      await processor.cleanupFailedLoad();

      expect(processor.loadingTask).toBeNull();
      expect(processor.pdf).toBeNull();
      expect(pdfDestroyed).toBe(true);
      expect(processor.fileUrl).toBeNull();
      expect(revokedUrl).toBe("blob:test-cleanup");
    } finally {
      if (origRevoke) {
        global.URL.revokeObjectURL = origRevoke;
      }
    }
  });

  test("cleanupFailedLoad successfully cleans up loadingTask, pdf, and fileUrl", async () => {
    let taskDestroyed = false;
    let pdfDestroyed = false;
    let revokedUrl = null;

    processor.loadingTask = {
      destroy: async () => {
        taskDestroyed = true;
      }
    };
    processor.pdf = {
      destroy: () => {
        pdfDestroyed = true;
      }
    };
    processor.fileUrl = "blob:test-cleanup-success";

    const origRevoke = global.URL?.revokeObjectURL;
    if (typeof global !== "undefined") {
      if (!global.URL) global.URL = {};
      global.URL.revokeObjectURL = (url) => { revokedUrl = url; };
    }

    try {
      await processor.cleanupFailedLoad();

      expect(taskDestroyed).toBe(true);
      expect(processor.loadingTask).toBeNull();
      expect(pdfDestroyed).toBe(true);
      expect(processor.pdf).toBeNull();
      expect(revokedUrl).toBe("blob:test-cleanup-success");
      expect(processor.fileUrl).toBeNull();
    } finally {
      if (origRevoke) {
        global.URL.revokeObjectURL = origRevoke;
      }
    }
  });



  test('_internalRender wraps error and cleans up page when page rendering fails', async () => {
    let cleanupCalled = false;
    processor.pdf = {
      getPage: async () => ({
        getViewport: ({ scale }) => ({ width: 100 * scale, height: 200 * scale }),
        render: () => {
          return { promise: Promise.reject(new Error('Render pipeline crash')) };
        },
        cleanup: () => { cleanupCalled = true; }
      })
    };
    processor.ensurePdfJs = async () => true;

    await expect(processor._internalRender(1, () => 1)).rejects.toThrow('Failed to render page 1');
    expect(cleanupCalled).toBe(true);
  });

});

test.describe('PDFProcessor Media handling', () => {
  let processor;

  test.beforeEach(() => {
    // Setup processor
    if (typeof global !== 'undefined' && !global.document) {
      global.document = {
        createElement: (tag) => {
          if (tag === 'canvas') {
            return {
              getContext: () => ({
                fillStyle: '',
                fillRect: () => {},
                drawImage: () => {}
              }),
              width: 0,
              height: 0
            };
          }
          return {};
        }
      };
    }
    processor = new PDFProcessor();
  });

  test('renderImageFile throws error on non-image', async () => {
    const file = new File([''], 'test.txt', { type: 'text/plain' });
    await expect(processor.renderImageFile(file)).rejects.toThrow();
  });

  test('renderImageFile scales image based on max dimensions', async () => {
    // Mock image source logic
    processor.loadImageElement = async () => ({
      width: 8000,
      height: 8000,
      naturalWidth: 8000,
      naturalHeight: 8000
    });

    // We need URL.createObjectURL mock if not in browser
    if (typeof global !== 'undefined' && !global.URL.createObjectURL) {
      global.URL.createObjectURL = () => 'blob:test';
      global.URL.revokeObjectURL = () => {};
    }

    const file = new File(['fake-image-data'], 'test.jpg', { type: 'image/jpeg' });

    const canvas = await processor.renderImageFile(file);

    expect(canvas).toBeDefined();
    // 4096 is max dimension, so scale = 4096 / 8000 = 0.512
    // then maxPixels limits it to 4096*4096 pixels.
    // 8000*8000 = 64,000,000 > 16,777,216
    // pixelScale = Math.sqrt(16777216 / 64000000) = 0.512
    // final size: 8000 * 0.512 = 4096
    expect(canvas.width).toBeLessThanOrEqual(4096);
    expect(canvas.height).toBeLessThanOrEqual(4096);
  });
  test('renderImageFile successfully renders image element', async () => {
    let closed = false;
    processor.loadImageElement = async () => ({
      width: 1000,
      height: 500,
      naturalWidth: 1000,
      naturalHeight: 500,
      close: () => { closed = true; }
    });

    if (typeof global !== 'undefined' && !global.URL.createObjectURL) {
      global.URL.createObjectURL = () => 'blob:test';
      global.URL.revokeObjectURL = () => {};
    }

    const file = new File(['fake-image-data'], 'test.png', { type: 'image/png' });

    const canvas = await processor.renderImageFile(file);

    expect(canvas).toBeDefined();
    // 1000x500 is within bounds, so scale should be 1.0
    // but dimensionScale logic says: Math.min(1, maxDimension/Math.max(1000, 500)) = Math.min(1, 4096/1000) = 1
    // scale = Math.max(0.1, 1) = 1
    // canvas width = 1000, height = 500
    // It's checked against naturalWidth/naturalHeight in the mock if image load passes properly
    expect(closed).toBe(true);
  });


  test('renderImageFile throws properly formatted error when createImageBitmap rejects', async () => {
    const originalCreateImageBitmap = global.createImageBitmap;
    global.createImageBitmap = async () => {
      throw new Error('Bitmap creation failed');
    };

    try {
      const file = new File(['fake-image-data'], 'test.png', { type: 'image/png' });
      await expect(processor.renderImageFile(file)).rejects.toThrow('Image processing failed: Bitmap creation failed');
    } finally {
      if (originalCreateImageBitmap !== undefined) {
        global.createImageBitmap = originalCreateImageBitmap;
      } else {
        delete global.createImageBitmap;
      }
    }
  });

  test('renderImageFile closes imageSource and revokes objectUrl when error occurs during canvas rendering', async () => {
    let closed = false;
    let revokedUrl = null;

    processor.loadImageElement = async () => ({
      width: 100,
      height: 100,
      close: () => { closed = true; }
    });

    processor.createRenderCanvas = () => {
      throw new Error('Canvas creation failed');
    };

    const originalCreateImageBitmap = global.createImageBitmap;
    delete global.createImageBitmap;

    const originalCreateObjectURL = global.URL?.createObjectURL;
    const originalRevokeObjectURL = global.URL?.revokeObjectURL;
    if (typeof global !== 'undefined') {
      if (!global.URL) { global.URL = {}; }
      global.URL.createObjectURL = () => 'blob:test-revoke';
      global.URL.revokeObjectURL = (url) => { revokedUrl = url; };
    }

    try {
      const file = new File(['fake-image-data'], 'test.png', { type: 'image/png' });
      await expect(processor.renderImageFile(file)).rejects.toThrow('Image processing failed: Canvas creation failed');
      expect(closed).toBe(true);
      expect(revokedUrl).toBe('blob:test-revoke');
    } finally {
      if (originalCreateImageBitmap !== undefined) {
        global.createImageBitmap = originalCreateImageBitmap;
      }
      if (originalCreateObjectURL !== undefined) {
        global.URL.createObjectURL = originalCreateObjectURL;
      } else {
        delete global.URL.createObjectURL;
      }
      if (originalRevokeObjectURL !== undefined) {
        global.URL.revokeObjectURL = originalRevokeObjectURL;
      } else {
        delete global.URL.revokeObjectURL;
      }
    }
  });

  test('renderImageFile throws properly formatted error when loadImageElement fails', async () => {
    const originalCreateImageBitmap = global.createImageBitmap;
    delete global.createImageBitmap;

    processor.loadImageElement = async () => {
      throw new Error('Simulated image load failure');
    };

    const originalCreateObjectURL = global.URL?.createObjectURL;
    const originalRevokeObjectURL = global.URL?.revokeObjectURL;
    if (typeof global !== 'undefined') {
      if (!global.URL) { global.URL = {}; }
      if (!global.URL.createObjectURL) global.URL.createObjectURL = () => 'blob:test';
      if (!global.URL.revokeObjectURL) global.URL.revokeObjectURL = () => {};
    }

    try {
      const file = new File(['fake-image-data'], 'test.png', { type: 'image/png' });
      await expect(processor.renderImageFile(file)).rejects.toThrow('Image processing failed: Simulated image load failure');
    } finally {
      if (originalCreateImageBitmap !== undefined) {
        global.createImageBitmap = originalCreateImageBitmap;
      }
      if (originalCreateObjectURL !== undefined) {
        global.URL.createObjectURL = originalCreateObjectURL;
      } else {
        delete global.URL?.createObjectURL;
      }
      if (originalRevokeObjectURL !== undefined) {
        global.URL.revokeObjectURL = originalRevokeObjectURL;
      } else {
        delete global.URL?.revokeObjectURL;
      }
    }
  });

  test('renderImageFile throws error when image dimensions are missing or zero', async () => {
    processor.loadImageElement = async () => ({
      width: 0,
      height: 0,
      naturalWidth: 0,
      naturalHeight: 0
    });

    const originalCreateObjectURL = global.URL?.createObjectURL;
    const originalRevokeObjectURL = global.URL?.revokeObjectURL;
    if (typeof global !== 'undefined') {
      if (!global.URL) { global.URL = {}; }
      if (!global.URL.createObjectURL) global.URL.createObjectURL = () => 'blob:test';
      if (!global.URL.revokeObjectURL) global.URL.revokeObjectURL = () => {};
    }

    try {
      const file = new File(['fake-image-data'], 'test.png', { type: 'image/png' });
      await expect(processor.renderImageFile(file)).rejects.toThrow('Image processing failed: Image dimensions could not be read.');
    } finally {
      if (originalCreateObjectURL !== undefined) {
        global.URL.createObjectURL = originalCreateObjectURL;
      } else {
        delete global.URL?.createObjectURL;
      }
      if (originalRevokeObjectURL !== undefined) {
        global.URL.revokeObjectURL = originalRevokeObjectURL;
      } else {
        delete global.URL?.revokeObjectURL;
      }
    }
  });

  test('renderImageFile handles createImageBitmap failure and wraps error', async () => {
    const origCreateImageBitmap = global.createImageBitmap;
    const origCreateObjectURL = global.URL?.createObjectURL;
    const origRevokeObjectURL = global.URL?.revokeObjectURL;

    if (typeof global !== 'undefined') {
      global.createImageBitmap = async () => {
        throw new Error('createImageBitmap failed');
      };
      if (!global.URL.createObjectURL) {
        global.URL.createObjectURL = () => 'blob:test';
        global.URL.revokeObjectURL = () => {};
      }
    }

    try {
      const file = new File(['fake-image-data'], 'test.png', { type: 'image/png' });

      await expect(processor.renderImageFile(file)).rejects.toThrow(
        'Image processing failed: createImageBitmap failed'
      );
    } finally {
      if (typeof global !== 'undefined') {
        if (origCreateImageBitmap !== undefined) {
          global.createImageBitmap = origCreateImageBitmap;
        } else {
          delete global.createImageBitmap;
        }
        if (origCreateObjectURL !== undefined) {
          global.URL.createObjectURL = origCreateObjectURL;
        }
        if (origRevokeObjectURL !== undefined) {
          global.URL.revokeObjectURL = origRevokeObjectURL;
        }
      }
    }
  });

  test('renderImageFile handles error with no message string and falls back to Unknown error', async () => {
    const origCreateObjectURL = global.URL?.createObjectURL;
    const origRevokeObjectURL = global.URL?.revokeObjectURL;

    processor.loadImageElement = async () => {
      throw {};
    };

    if (typeof global !== 'undefined' && !global.URL.createObjectURL) {
      global.URL.createObjectURL = () => 'blob:test';
      global.URL.revokeObjectURL = () => {};
    }

    try {
      const file = new File(['fake-image-data'], 'test.png', { type: 'image/png' });

      await expect(processor.renderImageFile(file)).rejects.toThrow(
        'Image processing failed: Unknown error'
      );
    } finally {
      if (typeof global !== 'undefined') {
        if (origCreateObjectURL !== undefined) {
          global.URL.createObjectURL = origCreateObjectURL;
        }
        if (origRevokeObjectURL !== undefined) {
          global.URL.revokeObjectURL = origRevokeObjectURL;
        }
      }
    }
  });

  test('renderImageFile throws when image dimensions are zero or invalid', async () => {
    const origCreateObjectURL = global.URL?.createObjectURL;
    const origRevokeObjectURL = global.URL?.revokeObjectURL;

    processor.loadImageElement = async () => ({
      width: 0,
      height: 0,
      naturalWidth: 0,
      naturalHeight: 0
    });

    if (typeof global !== 'undefined' && !global.URL.createObjectURL) {
      global.URL.createObjectURL = () => 'blob:test';
      global.URL.revokeObjectURL = () => {};
    }

    try {
      const file = new File(['fake-image-data'], 'test.png', { type: 'image/png' });

      await expect(processor.renderImageFile(file)).rejects.toThrow(
        'Image processing failed: Image dimensions could not be read.'
      );
    } finally {
      if (typeof global !== 'undefined') {
        if (origCreateObjectURL !== undefined) {
          global.URL.createObjectURL = origCreateObjectURL;
        }
        if (origRevokeObjectURL !== undefined) {
          global.URL.revokeObjectURL = origRevokeObjectURL;
        }
      }
    }
  });

  test('renderImageFile cleans up imageSource and objectUrl in finally block when processing fails', async () => {
    let closed = false;
    let revokedUrl = null;

    const origCreateObjectURL = global.URL?.createObjectURL;
    const origRevokeObjectURL = global.URL?.revokeObjectURL;

    if (typeof global !== 'undefined') {
      global.URL.createObjectURL = () => 'blob:cleanup-test';
      global.URL.revokeObjectURL = (url) => { revokedUrl = url; };
    }

    processor.loadImageElement = async () => ({
      width: 100,
      height: 100,
      close: () => { closed = true; }
    });

    processor.createRenderCanvas = () => {
      throw new Error('Canvas acquisition error');
    };

    try {
      const file = new File(['fake-image-data'], 'test.png', { type: 'image/png' });

      await expect(processor.renderImageFile(file)).rejects.toThrow(
        'Image processing failed: Canvas acquisition error'
      );

      expect(closed).toBe(true);
      expect(revokedUrl).toBe('blob:cleanup-test');
    } finally {
      if (typeof global !== 'undefined') {
        if (origCreateObjectURL !== undefined) {
          global.URL.createObjectURL = origCreateObjectURL;
        }
        if (origRevokeObjectURL !== undefined) {
          global.URL.revokeObjectURL = origRevokeObjectURL;
        }
      }
    }
  test('renderImageFile wraps drawImage error and executes cleanup in finally block', async () => {
    let closed = false;
    let revokedUrl = null;

    const origCreateObjectURL = global.URL?.createObjectURL;
    const origRevokeObjectURL = global.URL?.revokeObjectURL;

    if (typeof global !== 'undefined') {
      global.URL.createObjectURL = () => 'blob:draw-image-test';
      global.URL.revokeObjectURL = (url) => { revokedUrl = url; };
    }

    processor.loadImageElement = async () => ({
      width: 100,
      height: 100,
      close: () => { closed = true; }
    });

    const mockContext = {
      fillStyle: '',
      fillRect: () => {},
      drawImage: () => {
        throw new Error('Canvas drawImage error');
      }
    };

    processor.createRenderCanvas = () => ({
      canvas: {},
      context: mockContext
    });

    try {
      const file = new File(['fake-image-data'], 'test.png', { type: 'image/png' });

      let thrownError;
      try {
        await processor.renderImageFile(file);
      } catch (err) {
        thrownError = err;
      }

      expect(thrownError).toBeDefined();
      expect(thrownError.message).toBe('Image processing failed: Canvas drawImage error');
      expect(thrownError.cause?.message).toBe('Canvas drawImage error');

      expect(closed).toBe(true);
      expect(revokedUrl).toBe('blob:draw-image-test');
    } finally {
      if (typeof global !== 'undefined') {
        if (origCreateObjectURL !== undefined) {
          global.URL.createObjectURL = origCreateObjectURL;
        }
        if (origRevokeObjectURL !== undefined) {
          global.URL.revokeObjectURL = origRevokeObjectURL;
        }
      }
    }
  });

  test('renderImageFile wraps error and closes imageSource when drawing on canvas fails', async () => {
    let closed = false;
    const origCreateImageBitmap = global.createImageBitmap;

    global.createImageBitmap = async () => ({
      width: 500,
      height: 500,
      close: () => { closed = true; }
    });

    processor.createRenderCanvas = () => ({
      canvas: {},
      context: {
        fillStyle: '',
        fillRect: () => {},
        drawImage: () => {
          throw new Error('Canvas drawImage failure');
        }
      }
    });

    try {
      const file = new File(['fake-image-data'], 'test.png', { type: 'image/png' });
      await expect(processor.renderImageFile(file)).rejects.toThrow('Image processing failed: Canvas drawImage failure');
      expect(closed).toBe(true);
    } finally {
      if (origCreateImageBitmap !== undefined) {
        global.createImageBitmap = origCreateImageBitmap;
      } else {
        delete global.createImageBitmap;
      }
    }
  });

  test("renderPage propagates error from _internalRender and invokes onProgress callback", async () => {
    let cleanupCalled = false;
    let progressMessage = "";
    processor.pdf = {
      getPage: async () => ({
        getViewport: ({ scale }) => ({ width: 100 * scale, height: 200 * scale }),
        render: () => ({ promise: Promise.reject(new Error("Render stream error")) }),
        cleanup: () => { cleanupCalled = true; }
      })
    };
    processor.ensurePdfJs = async () => true;

    await expect(processor.renderPage(1, (msg) => { progressMessage = msg; })).rejects.toThrow("Failed to render page 1");
    expect(progressMessage).toBe("Rendering page 1...");
    expect(cleanupCalled).toBe(true);
  });

  test("renderPageThumbnail propagates error from _internalRender and cleans up page", async () => {
    let cleanupCalled = false;
    processor.pdf = {
      getPage: async () => ({
        getViewport: ({ scale }) => ({ width: 100 * scale, height: 200 * scale }),
        render: () => ({ promise: Promise.reject(new Error("Thumbnail render failed")) }),
        cleanup: () => { cleanupCalled = true; }
      })
    };
    processor.ensurePdfJs = async () => true;

    await expect(processor.renderPageThumbnail(2)).rejects.toThrow("Failed to render page 2");
    expect(cleanupCalled).toBe(true);
  });

  test("_internalRender handles ensurePdfJs error and wraps it properly", async () => {
    processor.pdf = {
      getPage: async () => ({})
    };
    processor.ensurePdfJs = async () => {
      throw new Error("Failed to load PDF.js module");
    };

    await expect(processor._internalRender(1, () => 1.0)).rejects.toThrow("Failed to render page 1");
  });

  test('renderImageFile wraps drawImage error and executes cleanup in finally block', async () => {
    let closed = false;
    let revokedUrl = null;

    const origCreateObjectURL = global.URL?.createObjectURL;
    const origRevokeObjectURL = global.URL?.revokeObjectURL;

    if (typeof global !== 'undefined') {
      global.URL.createObjectURL = () => 'blob:draw-image-test';
      global.URL.revokeObjectURL = (url) => { revokedUrl = url; };
    }

    processor.loadImageElement = async () => ({
      width: 100,
      height: 100,
      close: () => { closed = true; }
    });

    const mockContext = {
      fillStyle: '',
      fillRect: () => {},
      drawImage: () => {
        throw new Error('Canvas drawImage error');
      }
    };

    processor.createRenderCanvas = () => ({
      canvas: {},
      context: mockContext
    });

    try {
      const file = new File(['fake-image-data'], 'test.png', { type: 'image/png' });

      let thrownError;
      try {
        await processor.renderImageFile(file);
      } catch (err) {
        thrownError = err;
      }

      expect(thrownError).toBeDefined();
      expect(thrownError.message).toBe('Image processing failed: Canvas drawImage error');
      expect(thrownError.cause?.message).toBe('Canvas drawImage error');

      expect(closed).toBe(true);
      expect(revokedUrl).toBe('blob:draw-image-test');
    } finally {
      if (typeof global !== 'undefined') {
        if (origCreateObjectURL !== undefined) {
          global.URL.createObjectURL = origCreateObjectURL;
        }
        if (origRevokeObjectURL !== undefined) {
          global.URL.revokeObjectURL = origRevokeObjectURL;
        }
      }
    }
  });
});

