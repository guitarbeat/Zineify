import { logger } from '../utils/logger.js';
import { validateUploadFile, MAX_UPLOAD_FILE_SIZE } from '../utils/fileValidation.js';
import { formatFileSize } from '../utils/helpers.js';
import { MediaProcessor } from './MediaProcessor.js';

export class PDFProcessor extends MediaProcessor {
  constructor() {
    super();
    this.pdf = null;
    this.fileUrl = null;
    this.isProcessing = false;
    this.loadingTask = null;
    this.pdfjsLib = null;
    this._pdfJsReadyPromise = null;
  }

  /**
   * Initialize PDF.js worker
   */
  async initialize() {
    return Promise.resolve();
  }

  async ensurePdfJs() {
    if (!this._pdfJsReadyPromise) {
      this._pdfJsReadyPromise = Promise.all([
        import('pdfjs-dist'),
        // Defer PDF.js worker initialization until needed for heavy conversion tasks
        import('pdfjs-dist/build/pdf.worker.min.mjs?url')
      ]).then(([pdfjsModule, pdfWorkerModule]) => {
        this.pdfjsLib = pdfjsModule;
        this.pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerModule.default;
        return this.pdfjsLib;
      });
    }

    return this._pdfJsReadyPromise;
  }

  /**
   * Validate PDF file
   * @param {File} file - PDF file to validate
   * @returns {Object} Validation result
   */
  validateFile(file) {
    const result = validateUploadFile(file);
    const errors = [...result.errors];

    if (result.kind !== 'pdf') {
      errors.push('Please select a PDF file');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Load PDF from file
   * @param {File} file - PDF file to load
   * @param {Function} onProgress - Progress callback
   * @returns {Promise<Object>} PDF loading result
   */
  async loadPDF(file, onProgress = null) {
    if (this.isProcessing) {
      throw new Error('PDF processing already in progress');
    }

    this.isProcessing = true;
    let timeoutId;

    try {
      const pdfjsLib = await this.ensurePdfJs();
      const validation = this.validateFile(file);
      if (!validation.valid) {
        throw new Error(validation.errors.join('. '));
      }

      onProgress?.('Reading PDF file...');

      // Security check: Validate file signature
      const isValidSignature = await this.validateFileSignature(file);
      if (!isValidSignature) {
        throw new Error('Invalid file signature. Please select a valid PDF file.');
      }

      // Cleanup previous file before loading a new one to prevent memory leaks
      if (this.fileUrl) {
        URL.revokeObjectURL(this.fileUrl);
        this.fileUrl = null;
      }
      if (this.pdf) {
        this.pdf.destroy();
        this.pdf = null;
      }

      if (file.size > MAX_UPLOAD_FILE_SIZE) {
        throw new Error(`File too large (${formatFileSize(file.size)}). Maximum size is ${formatFileSize(MAX_UPLOAD_FILE_SIZE)}`);
      }

      // Use Blob URL instead of reading entire file into ArrayBuffer
      this.fileUrl = URL.createObjectURL(file);

      onProgress?.('Processing PDF...');

      this.loadingTask = pdfjsLib.getDocument({
        url: this.fileUrl,
        verbosity: 0,
        enableScripting: false,
        isEvalSupported: false
      });

      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(async () => {
          try {
            await this.loadingTask?.destroy();
          } catch {
            logger.warn('Failed to destroy PDF loading task on timeout');
          }
          this.loadingTask = null;
          reject(new Error('PDF loading timed out'));
        }, 60000);
      });

      this.pdf = await Promise.race([this.loadingTask.promise, timeoutPromise]);
      clearTimeout(timeoutId);
      this.loadingTask = null;

      const numPages = this.pdf.numPages;

      if (numPages === 0) {
        throw new Error('PDF appears to be empty or corrupted');
      }

      const MAX_PAGES = 128;
      if (numPages > MAX_PAGES) {
        throw new Error(`PDF has too many pages (${numPages}). Maximum allowed is ${MAX_PAGES} pages to prevent performance issues.`);
      }

      return {
        pdf: this.pdf,
        numPages,
        fileName: file.name,
        fileSize: file.size
      };

    } catch (error) {
      await this.cleanupFailedLoad();
      throw this.handlePDFError(error);
    } finally {
      clearTimeout(timeoutId);
      this.isProcessing = false;
    }
  }

  /**
   * Validate file signature (magic bytes) to ensure it's a PDF
   * @param {File} file - File to validate
   * @returns {Promise<boolean>} True if file signature matches PDF
   */
  async validateFileSignature(file) {
    const HEADER_LIMIT = 5;
    const slice = file.slice(0, HEADER_LIMIT);
    if (typeof slice.bytes === 'function') {
      const bytes = await slice.bytes();
      return bytes.length >= 5 &&
        bytes[0] === 0x25 && // '%'
        bytes[1] === 0x50 && // 'P'
        bytes[2] === 0x44 && // 'D'
        bytes[3] === 0x46 && // 'F'
        bytes[4] === 0x2D;   // '-'
    }
    const buffer = await slice.arrayBuffer();
    if (buffer.byteLength < 5) {
      return false;
    }
    const view = new DataView(buffer);
    return view.getUint32(0, false) === 0x25504446 && view.getUint8(4) === 0x2D;
  }

  /**
   * Internal common rendering logic
   * @private
   */
  async _internalRender(pageNum, scaleCalculator) {
    if (!this.pdf) {
      throw new Error('No PDF loaded');
    }

    let page = null;
    try {
      await this.ensurePdfJs();
      page = await this.pdf.getPage(pageNum);
      const baseViewport = page.getViewport({ scale: 1 });

      const scale = scaleCalculator(baseViewport);
      const viewport = page.getViewport({ scale });
      const width = Math.floor(viewport.width);
      const height = Math.floor(viewport.height);

      const { canvas, context } = this.createRenderCanvas(width, height);

      // Fill background white
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, width, height);

      // Render page to canvas
      const renderContext = {
        canvasContext: context,
        viewport,
        background: 'white'
      };

      await page.render(renderContext).promise;

      return canvas;
    } catch (error) {
      throw new Error(`Failed to render page ${pageNum}`, { cause: error });
    } finally {
      if (page) {
        page.cleanup();
      }
    }
  }

  /**
   * Render PDF page to canvas
   * @param {number} pageNum - Page number to render
   * @param {Function} onProgress - Progress callback
   * @returns {Promise<HTMLCanvasElement | OffscreenCanvas>} Rendered canvas
   */
  async renderPage(pageNum, onProgress = null) {
    onProgress?.(`Rendering page ${pageNum}...`);
    return this._internalRender(pageNum, (baseViewport) => {
      const maxDimension = 4096;
      const maxPixels = 4096 * 4096;
      const preferredScale = 1.5;
      const dimensionScale = Math.min(
        1,
        maxDimension / Math.max(baseViewport.width, baseViewport.height)
      );
      const pixelScale = Math.min(
        1,
        Math.sqrt(maxPixels / (baseViewport.width * baseViewport.height))
      );
      return Math.max(0.1, preferredScale * Math.min(dimensionScale, pixelScale));
    });
  }

  /**
   * Render a lower-resolution page preview for selection UIs
   * @param {number} pageNum - Page number to render
   * @returns {Promise<HTMLCanvasElement | OffscreenCanvas>} Rendered preview canvas
   */
  async renderPageThumbnail(pageNum) {
    return this._internalRender(pageNum, (baseViewport) => {
      const maxEdge = 420;
      return Math.max(
        0.2,
        Math.min(maxEdge / Math.max(baseViewport.width, baseViewport.height), 0.6)
      );
    });
  }

  /**
   * Render image file to canvas using MediaProcessor logic
   * @param {File} file 
   * @returns {Promise<HTMLCanvasElement | OffscreenCanvas>}
   */
  async renderImageFile(file) {
    const validation = validateUploadFile(file);
    if (!validation.valid || validation.kind !== 'image') {
      throw new Error(validation.errors[0] || 'Image processing failed.');
    }

    let objectUrl = null;
    let imageSource = null;

    try {
      if (typeof createImageBitmap === 'function') {
        imageSource = await createImageBitmap(file);
      } else {
        objectUrl = URL.createObjectURL(file);
        imageSource = await this.loadImageElement(objectUrl);
      }

      const sourceWidth = imageSource.width || imageSource.naturalWidth;
      const sourceHeight = imageSource.height || imageSource.naturalHeight;

      if (!sourceWidth || !sourceHeight) {
        throw new Error('Image dimensions could not be read.');
      }

      const maxDimension = 4096;
      const maxPixels = 4096 * 4096;
      const dimensionScale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
      const pixelScale = Math.min(1, Math.sqrt(maxPixels / (sourceWidth * sourceHeight)));
      const scale = Math.max(0.1, Math.min(dimensionScale, pixelScale));
      const width = Math.max(1, Math.floor(sourceWidth * scale));
      const height = Math.max(1, Math.floor(sourceHeight * scale));

      const { canvas, context } = this.createRenderCanvas(width, height);

      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, width, height);
      context.drawImage(imageSource, 0, 0, width, height);

      return canvas;
    } catch (error) {
      throw new Error(`Image processing failed: ${error.message || 'Unknown error'}`, { cause: error });
    } finally {
      if (imageSource && typeof imageSource.close === 'function') {
        imageSource.close();
      }

      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    }
  }

  async cleanupFailedLoad() {
    try {
      await this.loadingTask?.destroy();
    } catch {
      /* Ignore error when destroying PDF loading task on cleanup */
    }
    this.loadingTask = null;

    if (this.pdf) {
      this.pdf.destroy();
      this.pdf = null;
    }

    if (this.fileUrl) {
      URL.revokeObjectURL(this.fileUrl);
      this.fileUrl = null;
    }
  }

  /**
   * Handle PDF-specific errors
   * @param {Error} error - Original error
   * @returns {Error} Processed error
   */
  handlePDFError(error) {
    const message = error.message || 'Unknown error';

    if (message.includes('timed out')) {
      return new Error('PDF loading timed out. The file may be corrupted or too large.');
    }

    if (message.includes('corrupted') || message.includes('InvalidPDFException')) {
      return new Error('The PDF file appears to be corrupted or invalid.');
    }

    if (message.includes('password') || message.includes('protected')) {
      return new Error('The PDF file is password-protected.');
    }

    if (message.includes('not loaded') || message.includes('MissingPDFException')) {
      return new Error('PDF.js library failed to load. Please refresh the page.');
    }

    return new Error(`PDF processing failed: ${message}`);
  }

  /**
   * Clean up resources
   */
  cleanup() {
    this.loadingTask?.destroy().catch(() => {});
    this.loadingTask = null;
    if (this.pdf) {
      this.pdf.destroy();
      this.pdf = null;
    }
    if (this.fileUrl) {
      URL.revokeObjectURL(this.fileUrl);
      this.fileUrl = null;
    }
    this.isProcessing = false;
  }
}
