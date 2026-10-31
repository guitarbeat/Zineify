import DOMPurify from 'dompurify';
import { ZINE_TEMPLATES, PAPER_SIZES, resolvePaperSize } from '../utils/config.js';

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
    const isLandscape = dims.width >= dims.height;
    const doc = new jsPDF({
      orientation: isLandscape ? 'landscape' : 'portrait',
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
        doc.addPage([dims.width, dims.height], isLandscape ? 'landscape' : 'portrait');
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
      uniqueUrls.map((url) =>
        this._loadImage(url).then((img) => {
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
      upsideDown = Boolean(rawSlot.upsideDown);
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

      const isFlipped = Boolean(this.state.pageFlips[pageIndex]);
      const userRotation = Number.isFinite(this.state.pageRotations?.[pageIndex])
        ? this.state.pageRotations[pageIndex]
        : (isFlipped ? 180 : 0);
      const transform = typeof this.state.getPageTransform === 'function'
        ? this.state.getPageTransform(pageIndex)
        : (this.state.pageTransforms?.[pageIndex] || {});
      const isZoomed = Boolean(this.state.pageZooms[pageIndex]) || transform.fit === 'fill' || transform.fit === 'cover';
      const rotateDeg = (((upsideDown ? 180 : 0) + userRotation) % 360 + 360) % 360;
      const userZoom = Number.isFinite(transform.zoom) ? Math.max(1, Math.min(2.5, transform.zoom)) : 1;
      const scale = userZoom > 1 ? userZoom : (isZoomed ? 1.08 : 1);
      const objectFit = isZoomed ? 'cover' : 'contain';
      const panX = Number.isFinite(transform.pan?.x) ? transform.pan.x : 0;
      const panY = Number.isFinite(transform.pan?.y) ? transform.pan.y : 0;

      const row = Math.floor(slot / cols);
      const col = slot % cols;
      const cellX = marginPx + col * cellW;
      const cellY = marginPx + row * cellH;

      draws.push({ url, cellX, cellY, rotateDeg, scale, objectFit, panX, panY, upsideDown });
    }

    for (const { url, cellX, cellY, rotateDeg, scale, objectFit, panX, panY, upsideDown } of draws) {
      const img = imageCache.get(url);
      if (img) {
        this._drawCell({ ctx, img, cellX, cellY, cellW, cellH, rotateDeg, scale, objectFit, panX, panY, upsideDown });
      }
    }

    this._drawPressMarksToCanvas(ctx, rows, cols, metrics, template);
  }

  _drawPressMarksToCanvas(ctx, rows, cols, metrics, template) {
    const { canvasW, canvasH, marginPx, cellW, cellH } = metrics;
    const guides = this.state.guideToggles || {};
    const allowMarks = guides.includeInExport !== false;
    if (!allowMarks) {
      return;
    }

    const shouldBakeFold = guides.bakeFoldGuides !== false && guides.fold !== false;
    const shouldBakeCut = guides.bakeCutMarks !== false && guides.cut !== false;
    const shouldBakeCrop = guides.bakeCropMarks !== false && guides.cropMarks !== false;

    ctx.save();

    // 1. Fold lines
    if (shouldBakeFold) {
      ctx.strokeStyle = 'rgba(20, 18, 16, 0.42)';
      ctx.lineWidth = 2.2;
      ctx.setLineDash([16, 11]);

      for (let c = 1; c < cols; c++) {
        const x = marginPx + c * cellW;
        ctx.beginPath();
        ctx.moveTo(x, marginPx);
        ctx.lineTo(x, canvasH - marginPx);
        ctx.stroke();
      }

      for (let r = 1; r < rows; r++) {
        const y = marginPx + r * cellH;
        ctx.beginPath();
        ctx.moveTo(marginPx, y);
        ctx.lineTo(canvasW - marginPx, y);
        ctx.stroke();
      }
    }

    // 2. Center slit cut line with stop ticks and scissor badge
    if (shouldBakeCut && template?.cutLines?.horizontal) {
      const { afterRow = 1, fromPct = 25, toPct = 75 } = template.cutLines.horizontal;
      const gridW = canvasW - 2 * marginPx;
      const cutY = marginPx + afterRow * cellH;
      const startX = marginPx + (fromPct / 100) * gridW;
      const endX = marginPx + (toPct / 100) * gridW;
      const midX = (startX + endX) / 2;

      // Dashed crimson cut slit
      ctx.setLineDash([20, 10]);
      ctx.strokeStyle = '#e02424';
      ctx.lineWidth = 5.5;
      ctx.beginPath();
      ctx.moveTo(startX, cutY);
      ctx.lineTo(endX, cutY);
      ctx.stroke();

      // Solid stop ticks & stop dots at inner creases
      ctx.setLineDash([]);
      const tickHalf = 22;
      ctx.lineWidth = 4.5;
      ctx.beginPath();
      ctx.moveTo(startX, cutY - tickHalf);
      ctx.lineTo(startX, cutY + tickHalf);
      ctx.moveTo(endX, cutY - tickHalf);
      ctx.lineTo(endX, cutY + tickHalf);
      ctx.stroke();

      ctx.fillStyle = '#e02424';
      ctx.beginPath();
      ctx.arc(startX, cutY, 7, 0, Math.PI * 2);
      ctx.arc(endX, cutY, 7, 0, Math.PI * 2);
      ctx.fill();

      // Compact circular scissor badge at center of slit
      const badgeRadius = 22;
      ctx.fillStyle = '#e02424';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.arc(midX, cutY, badgeRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = '700 24px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('✂', midX, cutY + 1);
    }

    // 3. Corner crop marks
    if (shouldBakeCrop) {
      ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(15, 15, 15, 0.78)';
      ctx.lineWidth = 2.5;
      const tickLen = 28;
      const inset = Math.max(12, marginPx);

      // Top-left
      ctx.beginPath();
      ctx.moveTo(inset, inset + tickLen);
      ctx.lineTo(inset, inset);
      ctx.lineTo(inset + tickLen, inset);
      // Top-right
      ctx.moveTo(canvasW - inset - tickLen, inset);
      ctx.lineTo(canvasW - inset, inset);
      ctx.lineTo(canvasW - inset, inset + tickLen);
      // Bottom-left
      ctx.moveTo(inset, canvasH - inset - tickLen);
      ctx.lineTo(inset, canvasH - inset);
      ctx.lineTo(inset + tickLen, canvasH - inset);
      // Bottom-right
      ctx.moveTo(canvasW - inset - tickLen, canvasH - inset);
      ctx.lineTo(canvasW - inset, canvasH - inset);
      ctx.lineTo(canvasW - inset, canvasH - inset - tickLen);
      ctx.stroke();
    }

    ctx.restore();
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

  _drawCell({ ctx, img, cellX, cellY, cellW, cellH, rotateDeg, scale, objectFit, panX = 0, panY = 0, upsideDown = false }) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(cellX, cellY, cellW, cellH);
    ctx.clip();

    const cx = cellX + cellW / 2;
    const cy = cellY + cellH / 2;
    const panSign = upsideDown ? -1 : 1;
    const offsetX = panSign * (panX / 100) * (cellW * 0.35);
    const offsetY = panSign * (panY / 100) * (cellH * 0.35);
    ctx.translate(cx + offsetX, cy + offsetY);

    if (rotateDeg) {
      ctx.rotate((rotateDeg * Math.PI) / 180);
    }

    const isQuarterTurn = rotateDeg === 90 || rotateDeg === 270;
    const boundW = isQuarterTurn ? cellH : cellW;
    const boundH = isQuarterTurn ? cellW : cellH;

    const imgAspect = img.naturalWidth / img.naturalHeight;
    const cellAspect = boundW / boundH;
    let drawW, drawH;

    if (objectFit === 'cover') {
      if (imgAspect > cellAspect) {
        drawH = boundH * scale;
        drawW = drawH * imgAspect;
      } else {
        drawW = boundW * scale;
        drawH = drawW / imgAspect;
      }
    } else {
      if (imgAspect > cellAspect) {
        drawW = boundW * scale;
        drawH = drawW / imgAspect;
      } else {
        drawH = boundH * scale;
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
    const guides = this.state.guideToggles || {};
    const allowMarks = guides.includeInExport !== false;
    const showFold = allowMarks && guides.bakeFoldGuides !== false && guides.fold !== false;
    const showCut = allowMarks && guides.bakeCutMarks !== false && guides.cut !== false && Boolean(template?.cutLines?.horizontal);

    const gridStyle = template?.gridAreas
      ? `display:grid;grid-template-columns:repeat(${cols},1fr);grid-template-rows:repeat(${rows},1fr);grid-template-areas:${template.gridAreas.trim().split('\n').map((l) => l.trim()).join(' ')};width:${gridW}mm;height:${gridH}mm;position:relative;`
      : `display:grid;grid-template-columns:repeat(${cols},1fr);grid-template-rows:repeat(${rows},1fr);width:${gridW}mm;height:${gridH}mm;position:relative;`;

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
          upsideDown = Boolean(rawSlot.upsideDown);
        } else {
          pageNum = slot + 1;
          upsideDown = false;
        }

        const pageIndex = (s * slotsPerSheet) + (pageNum - 1);
        const url = this.state.allPageImages[pageIndex] || null;
        const isFlipped = Boolean(this.state.pageFlips[pageIndex]);
        const userRotation = Number.isFinite(this.state.pageRotations?.[pageIndex])
          ? this.state.pageRotations[pageIndex]
          : (isFlipped ? 180 : 0);
        const transform = typeof this.state.getPageTransform === 'function'
          ? this.state.getPageTransform(pageIndex)
          : (this.state.pageTransforms?.[pageIndex] || {});
        const isZoomed = Boolean(this.state.pageZooms[pageIndex]) || transform.fit === 'fill' || transform.fit === 'cover';
        const userZoom = Number.isFinite(transform.zoom) ? Math.max(1, Math.min(2.5, transform.zoom)) : 1;

        const rotateDeg = (((upsideDown ? 180 : 0) + userRotation) % 360 + 360) % 360;
        const scale = userZoom > 1 ? String(userZoom) : (isZoomed ? '1.08' : '1');
        const objectFit = isZoomed ? 'cover' : 'contain';
        const panSign = upsideDown ? -1 : 1;
        const panX = Math.round((Number(transform.pan?.x) || 0) * 0.35 * panSign);
        const panY = Math.round((Number(transform.pan?.y) || 0) * 0.35 * panSign);

        const areaStyle = template?.gridAreas ? `grid-area:page${pageNum};` : '';
        const borderStyle = showFold
          ? 'border:0.5pt dashed rgba(0,0,0,0.28);'
          : '';
        const cellStyle = `position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center;${borderStyle}${areaStyle}`;
        const imgStyle = `width:100%;height:100%;object-fit:${objectFit};transform:translate(${panX}%,${panY}%) rotate(${rotateDeg}deg) scale(${scale});`;

        cells.push(url
          ? `<div style="${cellStyle}"><img src="${url}" style="${imgStyle}" alt="Page ${pageNum}"></div>`
          : `<div style="${cellStyle};background:#f0f0f0;"></div>`);
      }

      const cutOverlayHtml = showCut
        ? '<div style="position:absolute;top:50%;left:25%;width:50%;height:0;border-top:2pt dashed #e02424;z-index:10;pointer-events:none;"><span style="position:absolute;left:50%;top:0;transform:translate(-50%,-50%);background:#e02424;color:#fff;font:700 8pt sans-serif;padding:1pt 4pt;border-radius:999px;">✂</span></div>'
        : '';

      sheets.push(`<div class="sheet" style="width:${dims.width}mm;height:${dims.height}mm;overflow:hidden;page-break-after:always;display:flex;align-items:center;justify-content:center;"><div style="${gridStyle}">${cells.join('')}${cutOverlayHtml}</div></div>`);
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
    const paper = resolvePaperSize(this.state.paperSize, this.state.customPaper) || PAPER_SIZES.letter;
    const isLandscape = this.state.orientation === 'landscape';
    return isLandscape
      ? { width: Math.max(paper.width, paper.height), height: Math.min(paper.width, paper.height) }
      : { width: Math.min(paper.width, paper.height), height: Math.max(paper.width, paper.height) };
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
