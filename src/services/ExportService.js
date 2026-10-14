import DOMPurify from 'dompurify';
import { ZINE_TEMPLATES, PAPER_SIZES } from '../utils/config.js';

const MM_TO_PX_300DPI = 300 / 25.4;

export class ExportService {
  constructor(ui, state) {
    this.ui = ui;
    this.state = state;
    this._imageCache = new Map();
  }

  async handleExport() {
    const { rows, cols } = this.state.gridSize;
    const slotsPerSheet = rows * cols;
    const totalSlots = this.state.allPageImages.length;
    const sheetCount = Math.max(1, Math.ceil(totalSlots / slotsPerSheet));
    const template = rows === 2 && cols === 4 ? ZINE_TEMPLATES['mini-8'] : null;

    const filledSlots = this.state.allPageImages.filter(Boolean);
    if (!filledSlots.length) {
      throw new Error('No pages to export.');
    }

    const { jsPDF } = await import('jspdf').then((m) => m);

    const dims = this.getPaperDimensions();
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: [dims.width, dims.height]
    });

    const metrics = this._calculatePdfGridMetrics(dims, rows, cols);
    const imageCache = await this._preloadImages(filledSlots);

    const offscreen = document.createElement('canvas');
    offscreen.width = metrics.canvasW;
    offscreen.height = metrics.canvasH;
    const ctx = offscreen.getContext('2d');

    for (let sheetIndex = 0; sheetIndex < sheetCount; sheetIndex++) {
      this._renderSheetToCanvas(ctx, sheetIndex, slotsPerSheet, template, rows, cols, metrics, imageCache);

      const imgData = offscreen.toDataURL('image/jpeg', 0.92);
      if (sheetIndex > 0) {
        doc.addPage([dims.width, dims.height], 'landscape');
      }
      doc.addImage(imgData, 'JPEG', 0, 0, dims.width, dims.height);
    }

    doc.save('zine.pdf');
  }

  _calculatePdfGridMetrics(dims, rows, cols) {
    const marginMm = this.state.margin || 0;
    const marginPx = Math.round(marginMm * MM_TO_PX_300DPI);
    const canvasW = Math.round(dims.width * MM_TO_PX_300DPI);
    const canvasH = Math.round(dims.height * MM_TO_PX_300DPI);
    const drawW = canvasW - 2 * marginPx;
    const drawH = canvasH - 2 * marginPx;
    const cellW = drawW / cols;
    const cellH = drawH / rows;

    return { marginPx, canvasW, canvasH, cellW, cellH };
  }

  async _preloadImages(filledSlots) {
    const uniqueUrls = [...new Set(filledSlots)];
    const imageCache = new Map();
    await Promise.all(
      uniqueUrls.map(url =>
        this._loadImage(url).then(img => {
          imageCache.set(url, img);
        })
      )
    );
    return imageCache;
  }

  _getSlotInfo(template, slot) {
    const rawSlot = template?.layout ? template.layout[slot] : null;
    let pageNum, upsideDown;

    if (typeof rawSlot === 'number') {
      pageNum = rawSlot;
      upsideDown = template.upsideDownPages?.includes(rawSlot) ?? false;
    } else if (rawSlot && typeof rawSlot === 'object') {
      pageNum = rawSlot.page;
      upsideDown = !!rawSlot.upsideDown;
    } else {
      pageNum = slot + 1;
      upsideDown = false;
    }

    return { pageNum, upsideDown };
  }

  _renderSheetToCanvas(ctx, sheetIndex, slotsPerSheet, template, rows, cols, metrics, imageCache) {
    const { canvasW, canvasH, marginPx, cellW, cellH } = metrics;

    ctx.clearRect(0, 0, canvasW, canvasH);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvasW, canvasH);

    const draws = [];

    for (let slot = 0; slot < slotsPerSheet; slot++) {
      const { pageNum, upsideDown } = this._getSlotInfo(template, slot);

      const pageIndex = (sheetIndex * slotsPerSheet) + (pageNum - 1);
      const url = this.state.allPageImages[pageIndex];
      if (!url) {
        continue;
      }

      const isFlipped = !!this.state.pageFlips[pageIndex];
      const isZoomed = !!this.state.pageZooms[pageIndex];
      const rotateDeg = (upsideDown !== isFlipped) ? 180 : 0;
      const scale = isZoomed ? 1.1 : 1;
      const objectFit = isZoomed ? 'cover' : 'contain';

      const row = Math.floor(slot / cols);
      const col = slot % cols;
      const cellX = marginPx + col * cellW;
      const cellY = marginPx + row * cellH;

      draws.push({ url, cellX, cellY, rotateDeg, scale, objectFit });
    }

    for (const { url, cellX, cellY, rotateDeg, scale, objectFit } of draws) {
      const img = imageCache.get(url);
      if (img) {
        this._drawCell(ctx, img, cellX, cellY, cellW, cellH, rotateDeg, scale, objectFit);
      }
    }
  }

  _loadImage(url) {
    if (this._imageCache.has(url)) {
      return this._imageCache.get(url);
    }
    const imagePromise = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = (err) => {
        this._imageCache.delete(url);
        reject(err);
      };
      img.src = url;
    });
    this._imageCache.set(url, imagePromise);
    return imagePromise;
  }

  _drawCell({ ctx, img, cellX, cellY, cellW, cellH, rotateDeg, scale, objectFit }) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(cellX, cellY, cellW, cellH);
    ctx.clip();

    const cx = cellX + cellW / 2;
    const cy = cellY + cellH / 2;
    ctx.translate(cx, cy);

    if (rotateDeg) {
      ctx.rotate((rotateDeg * Math.PI) / 180);
    }

    const imgAspect = img.naturalWidth / img.naturalHeight;
    const cellAspect = cellW / cellH;
    let drawW, drawH;

    if (objectFit === 'cover') {
      if (imgAspect > cellAspect) {
        drawH = cellH * scale;
        drawW = drawH * imgAspect;
      } else {
        drawW = cellW * scale;
        drawH = drawW / imgAspect;
      }
    } else {
      if (imgAspect > cellAspect) {
        drawW = cellW * scale;
        drawH = drawW / imgAspect;
      } else {
        drawH = cellH * scale;
        drawW = drawH * imgAspect;
      }
    }

    ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();
  }

  async handlePrint() {
    const dims = this.getPaperDimensions();
    const sheetsHtml = this.buildSheetsHtml();
    const html = this.buildPrintHtml(sheetsHtml, dims);
    await this.openPrintWindow(html);
  }

  buildSheetsHtml() {
    const { rows, cols } = this.state.gridSize;
    const slotsPerSheet = rows * cols;
    const isMini8 = rows === 2 && cols === 4;
    const template = isMini8 ? ZINE_TEMPLATES['mini-8'] : null;
    const totalSlots = this.state.allPageImages.length;
    const sheetCount = Math.max(1, Math.ceil(totalSlots / slotsPerSheet));
    const dims = this.getPaperDimensions();
    const marginMm = this.state.margin || 0;
    const gridW = dims.width - 2 * marginMm;
    const gridH = dims.height - 2 * marginMm;

    const gridStyle = template?.gridAreas
      ? `display:grid;grid-template-columns:repeat(${cols},1fr);grid-template-rows:repeat(${rows},1fr);grid-template-areas:${template.gridAreas.trim().split('\n').map((l) => l.trim()).join(' ')};width:${gridW}mm;height:${gridH}mm;`
      : `display:grid;grid-template-columns:repeat(${cols},1fr);grid-template-rows:repeat(${rows},1fr);width:${gridW}mm;height:${gridH}mm;`;

    const sheets = [];

    for (let s = 0; s < sheetCount; s++) {
      const cells = [];

      for (let slot = 0; slot < slotsPerSheet; slot++) {
        const rawSlot = template?.layout ? template.layout[slot] : null;
        let pageNum, upsideDown;

        if (typeof rawSlot === 'number') {
          pageNum = rawSlot;
          upsideDown = template.upsideDownPages?.includes(rawSlot) ?? false;
        } else if (rawSlot && typeof rawSlot === 'object') {
          pageNum = rawSlot.page;
          upsideDown = !!rawSlot.upsideDown;
        } else {
          pageNum = slot + 1;
          upsideDown = false;
        }

        const pageIndex = (s * slotsPerSheet) + (pageNum - 1);
        const url = this.state.allPageImages[pageIndex] || null;
        const isFlipped = !!this.state.pageFlips[pageIndex];
        const isZoomed = !!this.state.pageZooms[pageIndex];

        const rotateDeg = (upsideDown !== isFlipped) ? 180 : 0;
        const scale = isZoomed ? '1.1' : '1';
        const objectFit = isZoomed ? 'cover' : 'contain';

        const areaStyle = template?.gridAreas ? `grid-area:page${pageNum};` : '';
        const cellStyle = `position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center;${areaStyle}`;
        const imgStyle = `width:100%;height:100%;object-fit:${objectFit};transform:rotate(${rotateDeg}deg) scale(${scale});`;

        cells.push(url
          ? `<div style="${cellStyle}"><img src="${url}" style="${imgStyle}" alt="Page ${pageNum}"></div>`
          : `<div style="${cellStyle};background:#f0f0f0;"></div>`);
      }

      sheets.push(`<div class="sheet" style="width:${dims.width}mm;height:${dims.height}mm;overflow:hidden;page-break-after:always;display:flex;align-items:center;justify-content:center;"><div style="${gridStyle}">${cells.join('')}</div></div>`);
    }

    return sheets.join('');
  }

  buildPrintHtml(sheetsHtml, dims) {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Print Zine</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    @page { size: ${dims.width}mm ${dims.height}mm; margin: 0; }
    body { background: white; }
    .sheet { page-break-after: always; }
  </style>
</head>
<body>${sheetsHtml}</body>
</html>`;
  }

  getPaperDimensions() {
    const paper = PAPER_SIZES[this.state.paperSize] || PAPER_SIZES.letter;
    const isLandscape = this.state.orientation === 'landscape';
    return isLandscape
      ? { width: paper.height, height: paper.width }
      : { width: paper.width, height: paper.height };
  }

  async openPrintWindow(html) {
    const cleanHtml = DOMPurify.sanitize(html, { WHOLE_DOCUMENT: true });
    const win = window.open('', '_blank');
    if (win) {
      win.document.open();
      const docNode = new DOMParser().parseFromString(cleanHtml, 'text/html');
      win.document.replaceChild(win.document.importNode(docNode.documentElement, true), win.document.documentElement);
      win.document.close();
      win.focus();
      await new Promise((resolve) => {
        if (!win.document?.readyState || win.document.readyState === 'complete') {
          resolve();
          return;
        }
        let done = false;
        const onLoaded = () => {
          if (!done) {
            done = true;
            resolve();
          }
        };
        if (typeof win.addEventListener === 'function') {
          win.addEventListener('load', onLoaded, { once: true });
        }
        const origOnload = win.onload;
        win.onload = (...args) => {
          if (typeof origOnload === 'function') {
            origOnload(...args);
          }
          onLoaded();
        };
      });
      win.print();
      return;
    }

    const printFrame = document.createElement('iframe');
    printFrame.className = 'print-frame';
    printFrame.setAttribute('aria-hidden', 'true');
    document.body.appendChild(printFrame);

    const frameDoc = printFrame.contentDocument;
    frameDoc.open();
    const docNode = new DOMParser().parseFromString(cleanHtml, 'text/html');
    frameDoc.replaceChild(frameDoc.importNode(docNode.documentElement, true), frameDoc.documentElement);
    frameDoc.close();

    await new Promise((resolve) => {
      if (!printFrame.contentDocument?.readyState || printFrame.contentDocument.readyState === 'complete') {
        resolve();
        return;
      }
      let done = false;
      const onLoaded = () => {
        if (!done) {
          done = true;
          resolve();
        }
      };
      if (typeof printFrame.addEventListener === 'function') {
        printFrame.addEventListener('load', onLoaded, { once: true });
      }
      const origOnload = printFrame.onload;
      printFrame.onload = (...args) => {
        if (typeof origOnload === 'function') {
          origOnload(...args);
        }
        onLoaded();
      };
    });

    printFrame.contentWindow?.focus();
    printFrame.contentWindow?.print();

    setTimeout(() => {
      printFrame.remove();
    }, 1000);
  }
}
