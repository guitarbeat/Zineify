import { test, expect } from '@playwright/test';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

test.describe('AppController', () => {
  let originalInitialize;
  let originalRenderCurrentLayout;
  let originalToastError;

  test.beforeEach(async () => {
    // Need JSDOM since Toast evaluates `document` at top-level execution
    const { JSDOM } = require('jsdom');
    const dom = new JSDOM('<!DOCTYPE html><html lang="en"><body><div id="toast-container"></div><div id="status-message"></div><div id="file-input"></div><div id="grid-cols"></div><div id="grid-rows"></div><div id="page-numbers-toggle"></div><div id="fold-progress"></div><div id="paper-size-select"></div><div id="orientation-select"></div><div id="margin-input"></div><div id="zines-grid"></div><div id="zine-sheets-container"></div></body></html>', {
      url: 'http://localhost/'
    });

    global.window = dom.window;
    global.document = dom.window.document;
    global.HTMLElement = dom.window.HTMLElement;
    global.localStorage = dom.window.localStorage;
    global.window.matchMedia = () => ({ matches: false, addEventListener: () => {} });
    global.requestAnimationFrame = (cb) => setTimeout(cb, 0);

    const { PDFProcessor } = await import('../../src/services/PDFProcessor.js');
    const { AppController } = await import('../../src/core/AppController.js');
    const originalInitialize = PDFProcessor.prototype.initialize;
    originalRenderCurrentLayout = AppController.prototype.renderCurrentLayout;
    PDFProcessor.prototype.initialize = async () => {};
    AppController.prototype.renderCurrentLayout = () => {};
  });

  test.afterEach(async () => {
    delete global.window;
    delete global.document;
    delete global.HTMLElement;
    delete global.localStorage;
    delete global.requestAnimationFrame;

    const { PDFProcessor } = await import('../../src/services/PDFProcessor.js');
    const { AppController } = await import('../../src/core/AppController.js');
    if (originalInitialize) {
      PDFProcessor.prototype.initialize = originalInitialize;
    }
    if (originalRenderCurrentLayout) {
      AppController.prototype.renderCurrentLayout = originalRenderCurrentLayout;
    }
  });

  test('init handles pdfProcessor.initialize error with fallback message when error.message is missing', async () => {
    const { AppController } = await import('../../src/core/AppController.js');
    const { toast } = await import('../../src/components/Toast.js');
    const { PDFProcessor } = await import('../../src/services/PDFProcessor.js');

    let toastErrorTitle = null;
    let toastErrorMessage = null;
    const originalToastError = toast.error;
    toast.error = (title, message) => {
      toastErrorTitle = title;
      toastErrorMessage = message;
    };

    const originalInitialize = PDFProcessor.prototype.initialize;
    PDFProcessor.prototype.initialize = async () => {
      throw {};
    };

    try {
      const controller = new AppController();

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(toastErrorTitle).toBe('Initialization Failed');
      expect(toastErrorMessage).toBe('An error occurred');
      expect(controller).toBeDefined();
    } finally {
      PDFProcessor.prototype.initialize = originalInitialize;
      toast.error = originalToastError;
    }
  });

  test('init handles pdfProcessor.initialize error correctly', async () => {
    // Import modules dynamically after jsdom is set
    const { AppController } = await import('../../src/core/AppController.js');
    const { toast } = await import('../../src/components/Toast.js');
    const { PDFProcessor } = await import('../../src/services/PDFProcessor.js');

    let toastErrorTitle = null;
    let toastErrorMessage = null;
    const originalToastError = toast.error;
    toast.error = (title, message) => {
      toastErrorTitle = title;
      toastErrorMessage = message;
    };

    const originalInitialize = PDFProcessor.prototype.initialize;
    PDFProcessor.prototype.initialize = async () => {
      throw new Error('Mock PDF initialization failure');
    };

    try {
      const controller = new AppController();

      // wait for the catch block to execute.
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(toastErrorTitle).toBe('Initialization Failed');
      expect(toastErrorMessage).toBe('Mock PDF initialization failure');
      expect(controller).toBeDefined();
    } finally {
      // restore
      PDFProcessor.prototype.initialize = originalInitialize;
      toast.error = originalToastError;
    }
  });

  test('processFileQueue handles error when processing image upload fails', async () => {
    const { AppController } = await import('../../src/core/AppController.js');
    const { toast } = await import('../../src/components/Toast.js');

    let toastErrorTitle = null;
    let toastErrorMessage = null;
    originalToastError = toast.error;
    toast.error = (title, message) => {
      toastErrorTitle = title;
      toastErrorMessage = message;
    };

    try {
      const controller = new AppController();
      let statusText = null;
      let statusType = null;
      controller.ui.setStatus = (text, type) => {
        statusText = text;
        statusType = type;
      };

      let progressShown = null;
      controller.ui.modal.showProgress = (show) => {
        progressShown = show;
      };

      controller.processImageUpload = async () => {
        throw new Error('Image parsing failed');
      };

      const record = {
        name: 'sample-image.png',
        kind: 'image',
        file: new Blob([''], { type: 'image/png' }),
        status: 'Pending'
      };

      controller.state.uploadedFiles = [record];
      controller.state.fileQueue = [record];

      await controller.processFileQueue();

      expect(record.status).toBe('Failed');
      expect(statusText).toBe('Failed: sample-image.png');
      expect(statusType).toBe('error');
      expect(toastErrorTitle).toBe('Import Failed');
      expect(toastErrorMessage).toBe('Image parsing failed');
      expect(progressShown).toBe(false);
      expect(controller.state.isProcessingQueue).toBe(false);
    } finally {
      toast.error = originalToastError;
    }
  });

  test('processFileQueue handles error when processing PDF upload fails', async () => {
    const { AppController } = await import('../../src/core/AppController.js');
    const { toast } = await import('../../src/components/Toast.js');

    let toastErrorTitle = null;
    let toastErrorMessage = null;
    originalToastError = toast.error;
    toast.error = (title, message) => {
      toastErrorTitle = title;
      toastErrorMessage = message;
    };

    try {
      const controller = new AppController();
      let statusText = null;
      let statusType = null;
      controller.ui.setStatus = (text, type) => {
        statusText = text;
        statusType = type;
      };

      let progressShown = null;
      controller.ui.modal.showProgress = (show) => {
        progressShown = show;
      };

      controller.processPdfUpload = async () => {
        throw new Error('Corrupted PDF file');
      };

      const record = {
        name: 'corrupted.pdf',
        kind: 'pdf',
        file: new Blob([''], { type: 'application/pdf' }),
        status: 'Pending'
      };

      controller.state.uploadedFiles = [record];
      controller.state.fileQueue = [record];

      await controller.processFileQueue();

      expect(record.status).toBe('Failed');
      expect(statusText).toBe('Failed: corrupted.pdf');
      expect(statusType).toBe('error');
      expect(toastErrorTitle).toBe('Import Failed');
      expect(toastErrorMessage).toBe('Corrupted PDF file');
      expect(progressShown).toBe(false);
      expect(controller.state.isProcessingQueue).toBe(false);
    } finally {
      toast.error = originalToastError;
    }
  });

  test('handleExport shows warning toast when no pages are filled', async () => {
    const { AppController } = await import('../../src/core/AppController.js');
    const { toast } = await import('../../src/components/Toast.js');

    let warningTitle = null;
    let warningMessage = null;
    const originalWarning = toast.warning;
    toast.warning = (title, message) => {
      warningTitle = title;
      warningMessage = message;
    };

    try {
      const controller = new AppController();
      controller.state.getFilledPageCount = () => 0;

      await controller.handleExport();

      expect(warningTitle).toBe('No pages yet');
      expect(warningMessage).toBe('Upload a PDF or images to export');
    } finally {
      toast.warning = originalWarning;
    }
  });

  test('handleExport handles exportService.handleExport error correctly', async () => {
    const { AppController } = await import('../../src/core/AppController.js');
    const { toast } = await import('../../src/components/Toast.js');

    let toastErrorTitle = null;
    let toastErrorMessage = null;
    const originalToastError = toast.error;
    toast.error = (title, message) => {
      toastErrorTitle = title;
      toastErrorMessage = message;
    };

    try {
      const controller = new AppController();

      // Mock filled page count to proceed with export
      controller.state.getFilledPageCount = () => 1;

      // Track modal progress calls
      const progressCalls = [];
      controller.ui.modal = {
        showProgress: (show, message) => {
          progressCalls.push({ show, message });
        }
      };

      // Mock exportService.handleExport to reject
      const mockErrorMessage = 'Export processing failed';
      controller.exportService = {
        handleExport: async () => {
          throw new Error(mockErrorMessage);
        }
      };

      await controller.handleExport();

      expect(toastErrorTitle).toBe('Export Failed');
      expect(toastErrorMessage).toBe(mockErrorMessage);
      expect(progressCalls).toEqual([
        { show: true, message: 'Generating PDF...' },
        { show: false, message: undefined }
      ]);
    } finally {
      toast.error = originalToastError;
    }
  });

  test('handlePrint shows warning toast when no pages are filled', async () => {
    const { AppController } = await import('../../src/core/AppController.js');
    const { toast } = await import('../../src/components/Toast.js');

    let warningTitle = null;
    let warningMessage = null;
    const originalWarning = toast.warning;
    toast.warning = (title, message) => {
      warningTitle = title;
      warningMessage = message;
    };

    const originalInit = AppController.prototype.init;
    AppController.prototype.init = async () => {};

    try {
      const controller = new AppController();
      controller.state.getFilledPageCount = () => 0;
      controller.handlePrint();
      expect(warningTitle).toBe('No pages yet');
      expect(warningMessage).toBe('Upload a PDF or images to get started');
    } finally {
      AppController.prototype.init = originalInit;
      toast.warning = originalWarning;
    }
  });

  test('handlePrint shows error toast when exportService.handlePrint rejects', async () => {
    const { AppController } = await import('../../src/core/AppController.js');
    const { toast } = await import('../../src/components/Toast.js');

    let errorTitle = null;
    let errorMessage = null;
    const originalError = toast.error;
    toast.error = (title, message) => {
      errorTitle = title;
      errorMessage = message;
    };

    const originalInit = AppController.prototype.init;
    AppController.prototype.init = async () => {};

    try {
      const controller = new AppController();
      controller.state.getFilledPageCount = () => 1;
      controller.exportService.handlePrint = () => Promise.reject(new Error('Printer disconnected'));
      controller.handlePrint();
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(errorTitle).toBe('Print Failed');
      expect(errorMessage).toBe('Printer disconnected');
    } finally {
      AppController.prototype.init = originalInit;
      toast.error = originalError;
    }
  });

  test('handlePrint falls back to default error message if error message is missing', async () => {
    const { AppController } = await import('../../src/core/AppController.js');
    const { toast } = await import('../../src/components/Toast.js');

    let errorTitle = null;
    let errorMessage = null;
    const originalError = toast.error;
    toast.error = (title, message) => {
      errorTitle = title;
      errorMessage = message;
    };

    const originalInit = AppController.prototype.init;
    AppController.prototype.init = async () => {};

    try {
      const controller = new AppController();
      controller.state.getFilledPageCount = () => 1;
      controller.exportService.handlePrint = () => Promise.reject({});
      controller.handlePrint();
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(errorTitle).toBe('Print Failed');
      expect(errorMessage).toBe('Unable to print.');
    } finally {
      AppController.prototype.init = originalInit;
      toast.error = originalError;
    }
  });

  test('processFileQueue sets status to Failed and shows toast error when processing upload fails', async () => {
    const { AppController } = await import('../../src/core/AppController.js');
    const { toast } = await import('../../src/components/Toast.js');

    let toastErrorTitle = null;
    let toastErrorMessage = null;
    const originalToastError = toast.error;
    toast.error = (title, message) => {
      toastErrorTitle = title;
      toastErrorMessage = message;
    };

    try {
      const controller = new AppController();
      let statusText = null;
      let statusType = null;
      controller.ui.setStatus = (text, type) => {
        statusText = text;
        statusType = type;
      };

      let progressShown = null;
      controller.ui.modal.showProgress = (show) => {
        progressShown = show;
      };

      controller.processImageUpload = async () => {
        throw new Error('Custom upload processing error');
      };

      const record = {
        name: 'test-failure.png',
        kind: 'image',
        file: new Blob([''], { type: 'image/png' }),
        status: 'Pending'
      };

      controller.state.uploadedFiles = [record];
      controller.state.fileQueue = [record];

      await controller.processFileQueue();

      expect(record.status).toBe('Failed');
      expect(statusText).toBe('Failed: test-failure.png');
      expect(statusType).toBe('error');
      expect(toastErrorTitle).toBe('Import Failed');
      expect(toastErrorMessage).toBe('Custom upload processing error');
      expect(progressShown).toBe(false);
      expect(controller.state.isProcessingQueue).toBe(false);
    } finally {
      toast.error = originalToastError;
    }
  });

  test('handleExport handles exportService.handleExport rejection when error message is missing', async () => {
    const { AppController } = await import('../../src/core/AppController.js');
    const { toast } = await import('../../src/components/Toast.js');

    let toastErrorTitle = null;
    let toastErrorMessage = null;
    const originalToastError = toast.error;
    toast.error = (title, message) => {
      toastErrorTitle = title;
      toastErrorMessage = message;
    };

    const originalInit = AppController.prototype.init;
    AppController.prototype.init = async () => {};

    try {
      const controller = new AppController();
      controller.state.getFilledPageCount = () => 1;

      const progressCalls = [];
      controller.ui.modal = {
        showProgress: (show, message) => {
          progressCalls.push({ show, message });
        }
      };

      controller.exportService = {
        handleExport: async () => {
          throw {};
        }
      };

      await controller.handleExport();

      expect(toastErrorTitle).toBe('Export Failed');
      expect(toastErrorMessage).toBeUndefined();
      expect(progressCalls).toEqual([
        { show: true, message: 'Generating PDF...' },
        { show: false, message: undefined }
      ]);
    } finally {
      AppController.prototype.init = originalInit;
      toast.error = originalToastError;
    }
  });
  test("handleExport successfully exports zine when pages are filled", async () => {
    const { AppController } = await import("../../src/core/AppController.js");
    const { toast } = await import("../../src/components/Toast.js");

    let toastSuccessTitle = null;
    let toastSuccessMessage = null;
    const originalSuccess = toast.success;
    toast.success = (title, message) => {
      toastSuccessTitle = title;
      toastSuccessMessage = message;
    };

    const originalInit = AppController.prototype.init;
    AppController.prototype.init = async () => {};

    try {
      const controller = new AppController();
      controller.state.getFilledPageCount = () => 4;

      let markExportedCalled = false;
      controller.state.markExported = () => {
        markExportedCalled = true;
      };

      let updateWorkspaceUiCalled = false;
      controller.updateWorkspaceUi = () => {
        updateWorkspaceUiCalled = true;
      };

      const progressCalls = [];
      controller.ui.modal = {
        showProgress: (show, message) => {
          progressCalls.push({ show, message });
        }
      };

      let exportServiceCalled = false;
      controller.exportService = {
        handleExport: async () => {
          exportServiceCalled = true;
        }
      };

      await controller.handleExport();

      expect(exportServiceCalled).toBe(true);
      expect(markExportedCalled).toBe(true);
      expect(updateWorkspaceUiCalled).toBe(true);
      expect(toastSuccessTitle).toBe("PDF ready");
      expect(toastSuccessMessage).toBe("Download to print or share your zine");
      expect(progressCalls).toEqual([
        { show: true, message: "Generating PDF..." },
        { show: false, message: undefined }
      ]);
    } finally {
      AppController.prototype.init = originalInit;
      toast.success = originalSuccess;
    }
  });
  test("processFileQueue handles error when error message is missing", async () => {
    const { AppController } = await import("../../src/core/AppController.js");
    const { toast } = await import("../../src/components/Toast.js");

    let toastErrorTitle = null;
    let toastErrorMessage = null;
    const originalToastError = toast.error;
    toast.error = (title, message) => {
      toastErrorTitle = title;
      toastErrorMessage = message;
    };

    try {
      const controller = new AppController();
      let statusText = null;
      let statusType = null;
      controller.ui.setStatus = (text, type) => {
        statusText = text;
        statusType = type;
      };

      let progressShown = null;
      controller.ui.modal.showProgress = (show) => {
        progressShown = show;
      };

      controller.processPdfUpload = async () => {
        throw {};
      };

      const record = {
        name: "fallback-error.pdf",
        kind: "pdf",
        file: new Blob([""], { type: "application/pdf" }),
        status: "Pending"
      };

      controller.state.uploadedFiles = [record];
      controller.state.fileQueue = [record];

      await controller.processFileQueue();

      expect(record.status).toBe("Failed");
      expect(statusText).toBe("Failed: fallback-error.pdf");
      expect(statusType).toBe("error");
      expect(toastErrorTitle).toBe("Import Failed");
      expect(toastErrorMessage).toBeUndefined();
      expect(progressShown).toBe(false);
      expect(controller.state.isProcessingQueue).toBe(false);
    } finally {
      toast.error = originalToastError;
    }
  });

  test("processFileQueue handles error in queue and continues processing subsequent items", async () => {
    const { AppController } = await import("../../src/core/AppController.js");
    const { toast } = await import("../../src/components/Toast.js");

    const toastErrors = [];
    const originalToastError = toast.error;
    toast.error = (title, message) => {
      toastErrors.push({ title, message });
    };

    try {
      const controller = new AppController();
      controller.ui.setStatus = () => {};
      controller.ui.modal.showProgress = () => {};

      controller.processImageUpload = async (record) => {
        if (record.name === "fail.png") {
          throw new Error("Failed image");
        }
      };

      const record1 = {
        name: "fail.png",
        kind: "image",
        file: new Blob([""], { type: "image/png" }),
        status: "Pending"
      };
      const record2 = {
        name: "success.png",
        kind: "image",
        file: new Blob([""], { type: "image/png" }),
        status: "Pending"
      };

      controller.state.uploadedFiles = [record1, record2];
      controller.state.fileQueue = [record1, record2];

      await controller.processFileQueue();

      expect(record1.status).toBe("Failed");
      expect(record2.status).toBe("Processing");
      expect(toastErrors.length).toBe(1);
      expect(toastErrors[0]).toEqual({
        title: "Import Failed",
        message: "Failed image"
      });
      expect(controller.state.isProcessingQueue).toBe(false);
    } finally {
      toast.error = originalToastError;
    }
  });


  test("handleFileSelected triggers processFileQueue which handles async processing error", async () => {
    const { AppController } = await import("../../src/core/AppController.js");
    const { toast } = await import("../../src/components/Toast.js");

    let toastErrorTitle = null;
    let toastErrorMessage = null;
    const originalToastError = toast.error;
    toast.error = (title, message) => {
      toastErrorTitle = title;
      toastErrorMessage = message;
    };

    try {
      const controller = new AppController();
      let statusText = null;
      let statusType = null;
      controller.ui.setStatus = (text, type) => {
        statusText = text;
        statusType = type;
      };

      controller.processImageUpload = async () => {
        throw new Error("Async queue processing error");
      };

      const file = new File(["dummy content"], "queued-error-image.png", { type: "image/png" });

      controller.handleFileSelected(file);

      // Wait for processFileQueue async promise to settle
      await new Promise((resolve) => setTimeout(resolve, 50));

      const record = controller.state.uploadedFiles[0];
      expect(record).toBeDefined();
      expect(record.name).toBe("queued-error-image.png");
      expect(record.status).toBe("Failed");
      expect(statusText).toBe("Failed: queued-error-image.png");
      expect(statusType).toBe("error");
      expect(toastErrorTitle).toBe("Import Failed");
      expect(toastErrorMessage).toBe("Async queue processing error");
      expect(controller.state.isProcessingQueue).toBe(false);
    } finally {
      toast.error = originalToastError;
    }
  });


  test("handleFileSelected triggers processFileQueue for PDF files when processPdfUpload throws async error", async () => {
    const { AppController } = await import("../../src/core/AppController.js");
    const { toast } = await import("../../src/components/Toast.js");

    let toastErrorTitle = null;
    let toastErrorMessage = null;
    const originalToastError = toast.error;
    toast.error = (title, message) => {
      toastErrorTitle = title;
      toastErrorMessage = message;
    };

    try {
      const controller = new AppController();
      let statusText = null;
      let statusType = null;
      controller.ui.setStatus = (text, type) => {
        statusText = text;
        statusType = type;
      };

      controller.processPdfUpload = async () => {
        throw new Error("Async PDF queue processing error");
      };

      const file = new File(["dummy pdf content"], "queued-error-doc.pdf", { type: "application/pdf" });

      controller.handleFileSelected(file);

      await new Promise((resolve) => setTimeout(resolve, 50));

      const record = controller.state.uploadedFiles[0];
      expect(record).toBeDefined();
      expect(record.name).toBe("queued-error-doc.pdf");
      expect(record.status).toBe("Failed");
      expect(statusText).toBe("Failed: queued-error-doc.pdf");
      expect(statusType).toBe("error");
      expect(toastErrorTitle).toBe("Import Failed");
      expect(toastErrorMessage).toBe("Async PDF queue processing error");
      expect(controller.state.isProcessingQueue).toBe(false);
    } finally {
      toast.error = originalToastError;
    }
  });

  test("handleFileSelected handles concurrent enqueuing when queue is already processing and secondary item fails", async () => {
    const { AppController } = await import("../../src/core/AppController.js");
    const { toast } = await import("../../src/components/Toast.js");

    const toastErrors = [];
    const originalToastError = toast.error;
    toast.error = (title, message) => {
      toastErrors.push({ title, message });
    };

    try {
      const controller = new AppController();
      controller.ui.setStatus = () => {};
      const progressCalls = [];
      controller.ui.modal.showProgress = (show) => {
        progressCalls.push(show);
      };

      controller.processImageUpload = async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      };

      controller.processPdfUpload = async () => {
        throw new Error("Secondary file processing error");
      };

      const file1 = new File(["img data"], "first-success.png", { type: "image/png" });
      const file2 = new File(["pdf data"], "second-fail.pdf", { type: "application/pdf" });

      controller.handleFileSelected(file1);
      expect(controller.state.isProcessingQueue).toBe(true);

      controller.handleFileSelected(file2);

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(controller.state.uploadedFiles.length).toBe(2);
      expect(controller.state.uploadedFiles[1].status).toBe("Failed");
      expect(toastErrors.length).toBe(1);
      expect(toastErrors[0]).toEqual({
        title: "Import Failed",
        message: "Secondary file processing error"
      });
      expect(progressCalls.includes(false)).toBe(true);
      expect(controller.state.isProcessingQueue).toBe(false);
    } finally {
      toast.error = originalToastError;
    }
  });


  test('handleView3d creates spinner element securely using DOM methods without innerHTML XSS risk', async () => {
    /* eslint-disable-next-line no-console */
    const { AppController } = await import('../../src/core/AppController.js');
    const controller = new AppController();
    controller.state.getFilledPageCount = () => 1;
    controller.state.isMiniZineLayout = () => true;
    controller.ensureBlankPageUrl = async () => 'data:image/png;base64,fake';
    controller.ensureBookletPreview = () => {};
    controller.ui.toggle3DModal = () => {};
    const zine3dContainer = document.createElement('div');
    controller.ui.elements.zine3dContainer = zine3dContainer;

    controller.getZine3DViewerClass = async () => {
      // Check spinner while class is being fetched
      const spinner = zine3dContainer.querySelector('.zine-3d-spinner');
      expect(spinner).not.toBeNull();
      expect(spinner.querySelector('.spinner')).not.toBeNull();
      expect(spinner.querySelector('p').textContent).toBe('Loading 3D Viewer...');

      class DummyViewer {
        constructor() {}
        updateLayout() {}
      }
      return DummyViewer;
    };

    await controller.handleView3d();
  });


  test('getSelectedPagesForImport revokes generated thumbnail blob URLs and hides progress when thumbnail rendering fails', async () => {
    const { AppController } = await import('../../src/core/AppController.js');

    const originalInit = AppController.prototype.init;
    AppController.prototype.init = async () => {};

    try {
      const controller = new AppController();
      controller.state.gridSize = { rows: 2, cols: 4 };

      const revokedUrls = [];
      controller.pdfProcessor.revokeBlobUrl = (url) => {
        revokedUrls.push(url);
      };

      controller.pdfProcessor.renderPageThumbnail = async (pageNumber) => {
        if (pageNumber === 1) {
          return {};
        }
        throw new Error('Thumbnail rendering error on page 2');
      };

      controller.pdfProcessor.canvasToBlob = async () => 'blob:http://localhost/thumb-1';

      const progressCalls = [];
      controller.ui.modal.showProgress = (show) => {
        progressCalls.push(show);
      };

      await expect(
        controller.getSelectedPagesForImport('multi_page_doc.pdf', 10)
      ).rejects.toThrow('Thumbnail rendering error on page 2');

      expect(revokedUrls).toEqual(['blob:http://localhost/thumb-1']);
      expect(progressCalls).toContain(false);
    } finally {
      AppController.prototype.init = originalInit;
    }
  });

  test("getSelectedPagesForImport revokes generated thumbnail blob URLs when canvasToBlob fails", async () => {
    const { AppController } = await import("../../src/core/AppController.js");

    const originalInit = AppController.prototype.init;
    AppController.prototype.init = async () => {};

    try {
      const controller = new AppController();
      controller.state.gridSize = { rows: 2, cols: 4 };

      const revokedUrls = [];
      controller.pdfProcessor.revokeBlobUrl = (url) => {
        revokedUrls.push(url);
      };

      let pageCount = 0;
      controller.pdfProcessor.renderPageThumbnail = async () => {
        pageCount++;
        return { id: pageCount };
      };

      controller.pdfProcessor.canvasToBlob = async (canvas) => {
        if (canvas.id === 1) {
          return "blob:http://localhost/thumb-1";
        }
        throw new Error("Blob conversion failed for page 2");
      };

      const progressCalls = [];
      controller.ui.modal.showProgress = (show) => {
        progressCalls.push(show);
      };

      await expect(
        controller.getSelectedPagesForImport("multi_page_doc.pdf", 10)
      ).rejects.toThrow("Blob conversion failed for page 2");

      expect(revokedUrls).toEqual(["blob:http://localhost/thumb-1"]);
      expect(progressCalls).toContain(false);
    } finally {
      AppController.prototype.init = originalInit;
    }
  });

  test('getSelectedPagesForImport revokes all thumbnail blob URLs after showPagePicker completes', async () => {
    const { AppController } = await import('../../src/core/AppController.js');

    const originalInit = AppController.prototype.init;
    AppController.prototype.init = async () => {};

    try {
      const controller = new AppController();
      controller.state.gridSize = { rows: 2, cols: 4 };

      const revokedUrls = [];
      controller.pdfProcessor.revokeBlobUrl = (url) => {
        revokedUrls.push(url);
      };

      controller.pdfProcessor.renderPageThumbnail = async () => ({});
      controller.pdfProcessor.canvasToBlob = async () => 'blob:http://localhost/thumb-url';

      controller.ui.modal.showProgress = () => {};
      controller.ui.modal.showPagePicker = async ({ thumbnails }) => {
        expect(thumbnails.length).toBe(10);
        return [1, 2, 3];
      };

      const selected = await controller.getSelectedPagesForImport('doc.pdf', 10);
      expect(selected).toEqual([1, 2, 3]);

      expect(revokedUrls.length).toBe(10);
    } finally {
      AppController.prototype.init = originalInit;
    }
  });
  test("handleView3d handles error during preview rendering with custom error message", async () => {
    const { AppController } = await import("../../src/core/AppController.js");
    const { toast } = await import("../../src/components/Toast.js");

      class DummyViewer {
        constructor() {}
        updateLayout() {}
      }
      return DummyViewer;
    };

    try {
      const controller = new AppController();
      controller.state.getFilledPageCount = () => 1;
      controller.state.isMiniZineLayout = () => true;
      controller.ensureBlankPageUrl = async () => "data:image/png;base64,fake";
      controller.ensureBookletPreview = () => {};
      controller.ui.toggle3DModal = () => {};

      controller.viewer3d = {
        loadPages: () => {
          throw new Error("3D rendering engine crash");
        }
      };

      await controller.handleView3d();

      expect(toastErrorTitle).toBe("3D Preview Failed");
      expect(toastErrorMessage).toBe("3D rendering engine crash");
    } finally {
      toast.error = originalToastError;
    }
  });

  test("handleView3d handles error during preview rendering with default fallback error message", async () => {
    const { AppController } = await import("../../src/core/AppController.js");
    const { toast } = await import("../../src/components/Toast.js");

    let toastErrorTitle = null;
    let toastErrorMessage = null;
    const originalToastError = toast.error;
    toast.error = (title, message) => {
      toastErrorTitle = title;
      toastErrorMessage = message;
    };

    try {
      const controller = new AppController();
      controller.state.getFilledPageCount = () => 1;
      controller.state.isMiniZineLayout = () => true;
      controller.ensureBlankPageUrl = async () => "data:image/png;base64,fake";
      controller.ensureBookletPreview = () => {};
      controller.ui.toggle3DModal = () => {};

      controller.viewer3d = {
        loadPages: () => {
          throw {};
        }
      };

      await controller.handleView3d();

      expect(toastErrorTitle).toBe("3D Preview Failed");
      expect(toastErrorMessage).toBe("Unable to load the fold preview.");
    } finally {
      toast.error = originalToastError;
    }
  });

  test('handleExport handles error thrown during state post-processing after export', async () => {
    const { AppController } = await import('../../src/core/AppController.js');
    const { toast } = await import('../../src/components/Toast.js');

    let toastErrorTitle = null;
    let toastErrorMessage = null;
    const originalToastError = toast.error;
    toast.error = (title, message) => {
      toastErrorTitle = title;
      toastErrorMessage = message;
    };

    const originalInit = AppController.prototype.init;
    AppController.prototype.init = async () => {};

    try {
      const controller = new AppController();
      controller.state.getFilledPageCount = () => 1;

      controller.exportService = {
        handleExport: async () => {}
      };

      controller.state.markExported = () => {
        throw new Error('State update failed');
      };

      const progressCalls = [];
      controller.ui.modal = {
        showProgress: (show, message) => {
          progressCalls.push({ show, message });
        }
      };

      await controller.handleExport();

      expect(toastErrorTitle).toBe('Export Failed');
      expect(toastErrorMessage).toBe('State update failed');
      expect(progressCalls).toEqual([
        { show: true, message: 'Generating PDF...' },
        { show: false, message: undefined }
      ]);
    } finally {
      AppController.prototype.init = originalInit;
      toast.error = originalToastError;
    }
  });
  test('processFileQueue handles error when pdfProcessor.renderImageFile fails during image upload', async () => {
    const { AppController } = await import('../../src/core/AppController.js');
    const { toast } = await import('../../src/components/Toast.js');

    let toastErrorTitle = null;
    let toastErrorMessage = null;
    const originalToastError = toast.error;
    toast.error = (title, message) => {
      toastErrorTitle = title;
      toastErrorMessage = message;
    };

    try {
      const controller = new AppController();
      let statusText = null;
      let statusType = null;
      controller.ui.setStatus = (text, type) => {
        statusText = text;
        statusType = type;
      };

      const progressCalls = [];
      controller.ui.modal.showProgress = (show, message) => {
        progressCalls.push({ show, message });
      };

      controller.pdfProcessor.renderImageFile = async () => {
        throw new Error('Image rendering/decoding failed');
      };

      const record = {
        name: 'failing-image.png',
        kind: 'image',
        file: new Blob(['invalid image data'], { type: 'image/png' }),
        status: 'Pending'
      };

      controller.state.uploadedFiles = [record];
      controller.state.fileQueue = [record];

      await controller.processFileQueue();

      expect(record.status).toBe('Failed');
      expect(statusText).toBe('Failed: failing-image.png');
      expect(statusType).toBe('error');
      expect(toastErrorTitle).toBe('Import Failed');
      expect(toastErrorMessage).toBe('Image rendering/decoding failed');
      expect(progressCalls).toContainEqual({ show: false, message: undefined });
      expect(controller.state.isProcessingQueue).toBe(false);
    } finally {
      toast.error = originalToastError;
    }
  });

  test('processFileQueue handles error when pdfProcessor.loadPDF fails during PDF upload', async () => {
    const { AppController } = await import('../../src/core/AppController.js');
    const { toast } = await import('../../src/components/Toast.js');

    let toastErrorTitle = null;
    let toastErrorMessage = null;
    const originalToastError = toast.error;
    toast.error = (title, message) => {
      toastErrorTitle = title;
      toastErrorMessage = message;
    };

    try {
      const controller = new AppController();
      let statusText = null;
      let statusType = null;
      controller.ui.setStatus = (text, type) => {
        statusText = text;
        statusType = type;
      };

      const progressCalls = [];
      controller.ui.modal.showProgress = (show, message) => {
        progressCalls.push({ show, message });
      };

      controller.pdfProcessor.loadPDF = async () => {
        throw new Error('Corrupt or password-protected PDF');
      };

      const record = {
        name: 'corrupt-doc.pdf',
        kind: 'pdf',
        file: new Blob(['invalid pdf data'], { type: 'application/pdf' }),
        status: 'Pending'
      };

      controller.state.uploadedFiles = [record];
      controller.state.fileQueue = [record];

      await controller.processFileQueue();

      expect(record.status).toBe('Failed');
      expect(statusText).toBe('Failed: corrupt-doc.pdf');
      expect(statusType).toBe('error');
      expect(toastErrorTitle).toBe('Import Failed');
      expect(toastErrorMessage).toBe('Corrupt or password-protected PDF');
      expect(progressCalls).toContainEqual({ show: false, message: undefined });
      expect(controller.state.isProcessingQueue).toBe(false);
    } finally {
      toast.error = originalToastError;
    }
  });

  test("handleView3d handles Zine3DViewer initialization error gracefully", async () => {
    const { AppController } = await import("../../src/core/AppController.js");
    const { toast } = await import("../../src/components/Toast.js");

    let toastErrorTitle = null;
    let toastErrorMessage = null;
    const originalToastError = toast.error;
    toast.error = (title, message) => {
      toastErrorTitle = title;
      toastErrorMessage = message;
    };

    try {
      const controller = new AppController();
      controller.state.getFilledPageCount = () => 1;
      controller.state.isMiniZineLayout = () => true;
      controller.ensureBlankPageUrl = async () => "data:image/png;base64,fake";
      controller.ensureBookletPreview = () => {};

      let modalToggled = null;
      controller.ui.toggle3DModal = (show) => {
        modalToggled = show;
      };

      const zine3dContainer = document.createElement("div");
      const fallbackCanvas = document.createElement("div");
      fallbackCanvas.className = "zine-3d-fallback-canvas";
      zine3dContainer.appendChild(fallbackCanvas);
      controller.ui.elements.zine3dContainer = zine3dContainer;

      controller.getZine3DViewerClass = async () => {
        return class FailingZine3DViewer {
          constructor() {
            throw new Error("WebGL Context Creation Failed");
          }
        };
      };

      await controller.handleView3d();

      expect(zine3dContainer.querySelector(".zine-3d-fallback-canvas")).toBeNull();
      expect(controller.viewer3d).toBeNull();
      expect(modalToggled).toBe(false);
      expect(toastErrorTitle).toBe("3D Preview Failed");
      expect(toastErrorMessage).toBe("Unable to initialize the fold preview.");
    } finally {
      toast.error = originalToastError;
    }
  });

});
