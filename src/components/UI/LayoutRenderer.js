import { getPageLabel } from '../../utils/previewHelpers.js';

const TOOLBAR_BUTTONS = [
  {
    selector: '.replace-btn',
    title: (label) => `Replace ${label} with another file`,
    ariaLabel: (label) => `Replace ${label} with another file`
  },
  {
    selector: '.crop-btn',
    title: (label) => `Fit / Fill ${label} — toggle between showing the full page or filling the slot (C)`,
    ariaLabel: (label) => `Toggle fit or fill for ${label} (C)`
  },
  {
    selector: '.rotate-btn',
    title: (label) => `Rotate ${label} 90° clockwise (T)`,
    ariaLabel: (label) => `Rotate ${label} 90 degrees clockwise (T)`
  },
  {
    selector: '.flip-btn',
    title: (label) => `Rotate ${label} 180° — flip the page upside-down (R)`,
    ariaLabel: (label) => `Rotate ${label} 180 degrees (R)`
  },
  {
    selector: '.duplicate-btn',
    title: (label) => `Duplicate ${label} to next open slot (D)`,
    ariaLabel: (label) => `Duplicate ${label} (D)`
  }
];

/**
 * LayoutRenderer.js
 * Handles the rendering of zine sheets, imposition slots, and press mark overlays
 */
export class LayoutRenderer {
  constructor(container, cellTemplate) {
    this.container = container;
    this.cellTemplate = cellTemplate;
  }

  render(numPages, template, options, handlers, paper = {}) {
    this.container.replaceChildren();

    const slotsPerSheet = template.grid.rows * template.grid.cols;
    const sheetCount = Math.max(1, Math.ceil(numPages / slotsPerSheet));
    const guideToggles = options?.guideToggles || {
      cut: true,
      fold: true,
      cropMarks: true,
      bleed: false,
      numbers: options?.pageNumbersVisible !== false
    };

    for (let s = 0; s < sheetCount; s++) {
      const { sheetWrapper, grid } = this.createSheetGrid({
        sheetNumber: s + 1,
        template: template.label,
        columns: template.grid.cols,
        rows: template.grid.rows,
        id: `zine-grid-sheet-${s + 1}`,
        paper,
        guideToggles
      });

      if (template.gridAreas) {
        grid.style.gridTemplateAreas = template.gridAreas;
      }

      // Fill grid based on template layout or sequential order
      for (let i = 0; i < slotsPerSheet; i++) {
        const slotConfig = this.normalizeSlotConfig(template, i);
        const pageNumberInSheet = slotConfig.page;
        const pageIndex = (s * slotsPerSheet) + (pageNumberInSheet - 1);
        const overallPageNumber = pageIndex + 1;

        const labelText = getPageLabel(overallPageNumber, numPages, true);
        const accessibleLabelText = getPageLabel(overallPageNumber, numPages, false);

        const cell = this.createPageCell({
          pageIndex,
          pageNumber: pageNumberInSheet,
          labelText,
          accessibleLabelText,
          altText: `${accessibleLabelText} preview`,
          upsideDown: slotConfig.upsideDown,
          options,
          handlers
        });

        if (template.gridAreas) {
          cell.style.gridArea = `page${pageNumberInSheet}`;
        }

        if (options.pageImages && options.pageImages[pageIndex]) {
          const url = options.pageImages[pageIndex];
          const img = cell.querySelector('.page-content-img');
          const placeholder = cell.querySelector('.page-placeholder');
          if (img) {
            img.src = url || '';
            img.classList.toggle('hidden', !url);
          }
          if (placeholder) {
            placeholder.classList.toggle('hidden', Boolean(url));
          }
          cell.classList.toggle('has-page', Boolean(url));
          cell.setAttribute('aria-label', `${accessibleLabelText}, has content`);
        }

        const rawRotation = Number.isFinite(options.pageRotations?.[pageIndex])
          ? ((options.pageRotations[pageIndex] % 360) + 360) % 360
          : (options.pageFlips?.[pageIndex] ? 180 : 0);

        if (rawRotation === 180 || (options.pageFlips && options.pageFlips[pageIndex])) {
          cell.classList.add('is-flipped');
        }
        if (rawRotation > 0) {
          cell.style.setProperty('--page-image-rotation', `${rawRotation}deg`);
          const rotBadge = cell.querySelector('.page-rotation-badge');
          if (rotBadge && options.pageImages?.[pageIndex]) {
            rotBadge.textContent = `${rawRotation}°`;
            rotBadge.classList.remove('hidden');
          }
        }

        if (options.pageZooms && options.pageZooms[pageIndex]) {
          cell.classList.add('page-zoomed');
        }

        grid.appendChild(cell);
      }

      this.appendPressOverlays(grid, sheetWrapper, template);

      sheetWrapper.appendChild(grid);
      this.container.appendChild(sheetWrapper);
    }
  }

  appendPressOverlays(grid, sheetWrapper, template) {
    // 1. Fold Crease Grid Lines (Valley/Mountain dashed guides)
    const foldOverlay = document.createElement('div');
    foldOverlay.className = 'sheet-fold-overlay';
    foldOverlay.setAttribute('aria-hidden', 'true');

    for (let c = 1; c < template.grid.cols; c++) {
      const vLine = document.createElement('div');
      vLine.className = 'sheet-fold-line sheet-fold-line-v';
      vLine.style.left = `${(c / template.grid.cols) * 100}%`;
      foldOverlay.appendChild(vLine);
    }

    for (let r = 1; r < template.grid.rows; r++) {
      const hLine = document.createElement('div');
      hLine.className = 'sheet-fold-line sheet-fold-line-h';
      hLine.style.top = `${(r / template.grid.rows) * 100}%`;
      foldOverlay.appendChild(hLine);
    }
    grid.appendChild(foldOverlay);

    // 2. Center Slit Cut Line
    if (template.cutLines?.horizontal) {
      const { afterRow, fromPct = 0, toPct = 100 } = template.cutLines.horizontal;
      const cutLine = document.createElement('div');
      cutLine.className = 'sheet-cut-line sheet-cut-line-h';
      cutLine.setAttribute('aria-hidden', 'true');
      cutLine.style.top = `${(afterRow / template.grid.rows) * 100}%`;
      cutLine.style.left = `${fromPct}%`;
      cutLine.style.right = `${100 - toPct}%`;
      grid.appendChild(cutLine);
    }

    // 3. Corner Crop & Registration Marks on the Sheet Wrapper
    const cropOverlay = document.createElement('div');
    cropOverlay.className = 'sheet-crop-overlay';
    cropOverlay.setAttribute('aria-hidden', 'true');
    ['tl', 'tr', 'bl', 'br'].forEach((corner) => {
      const tick = document.createElement('span');
      tick.className = `sheet-crop-tick sheet-crop-tick--${corner}`;
      cropOverlay.appendChild(tick);
    });
    sheetWrapper.appendChild(cropOverlay);

    // 4. Safe Bleed / Trim Guide Overlay
    const bleedOverlay = document.createElement('div');
    bleedOverlay.className = 'sheet-bleed-overlay';
    bleedOverlay.setAttribute('aria-hidden', 'true');
    grid.appendChild(bleedOverlay);
  }

  normalizeSlotConfig(template, index) {
    const rawSlot = template.layout ? template.layout[index] : null;
    if (typeof rawSlot === 'number') {
      return {
        page: rawSlot,
        upsideDown: Array.isArray(template.upsideDownPages) && template.upsideDownPages.includes(rawSlot)
      };
    }

    if (rawSlot && typeof rawSlot === 'object') {
      return {
        page: rawSlot.page,
        upsideDown: Boolean(rawSlot.upsideDown)
      };
    }

    return { page: index + 1, upsideDown: false };
  }

  createSheetGrid(config) {
    const { sheetNumber, template, columns, rows, id, paper, guideToggles = {} } = config;
    const sheetWrapper = document.createElement('div');
    sheetWrapper.className = 'print-sheet p-0 relative';
    sheetWrapper.setAttribute('data-sheet', sheetNumber);
    sheetWrapper.setAttribute('data-template', template);
    sheetWrapper.setAttribute('data-guide-cut', String(guideToggles.cut !== false));
    sheetWrapper.setAttribute('data-guide-fold', String(guideToggles.fold !== false));
    sheetWrapper.setAttribute('data-guide-crop', String(guideToggles.cropMarks !== false));
    sheetWrapper.setAttribute('data-guide-bleed', String(Boolean(guideToggles.bleed)));

    if (paper?.paperSize) {
      sheetWrapper.setAttribute('data-paper-size', paper.paperSize);
    }

    if (paper?.orientation) {
      sheetWrapper.setAttribute('data-paper-orientation', paper.orientation);
    }

    if (paper?.width && paper?.height) {
      const aspectRatio = `${paper.width} / ${paper.height}`;
      sheetWrapper.style.aspectRatio = aspectRatio;
      sheetWrapper.style.setProperty('--sheet-width', String(paper.width));
      sheetWrapper.style.setProperty('--sheet-height', String(paper.height));
      const scale = this.getResponsiveSheetScale(paper.width, paper.height);
      sheetWrapper.style.setProperty('--sheet-scale', String(scale));
    }

    const grid = document.createElement('div');
    grid.className = 'zine-grid';
    grid.id = id;
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = `repeat(${columns}, 1fr)`;
    grid.style.gridTemplateRows = `repeat(${rows}, 1fr)`;

    if (paper?.margin > 0 && paper?.width && paper?.height) {
      const padX = (paper.margin / paper.width) * 100;
      const padY = (paper.margin / paper.height) * 100;
      sheetWrapper.setAttribute('data-has-margin', 'true');
      sheetWrapper.style.setProperty('--margin-x', `${padX}%`);
      sheetWrapper.style.setProperty('--margin-y', `${padY}%`);
      grid.style.position = 'absolute';
      grid.style.left = `${padX}%`;
      grid.style.right = `${padX}%`;
      grid.style.top = `${padY}%`;
      grid.style.bottom = `${padY}%`;
      grid.style.width = 'auto';
      grid.style.height = 'auto';
    } else {
      grid.style.position = 'relative';
    }

    return { sheetWrapper, grid };
  }

  getResponsiveSheetScale(width, height) {
    if (!width || !height) {
      return 1;
    }

    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || width;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || height;
    const usableWidth = Math.max(320, viewportWidth - 32);
    const usableHeight = Math.max(320, viewportHeight - 180);
    const sheetRatio = width / height;
    const viewportRatio = usableWidth / usableHeight;

    if (sheetRatio > viewportRatio) {
      return Math.min(1, usableWidth / width);
    }

    return Math.min(1, usableHeight / height);
  }

  createPageCell(config) {
    const { pageIndex, pageNumber, labelText, accessibleLabelText, altText, upsideDown, options, handlers } = config;
    const cell = document.createElement('div');
    cell.className = 'page-cell h-full w-full bg-white relative flex items-center justify-center overflow-hidden transition-all duration-200 group';
    cell.setAttribute('data-page-index', pageIndex);
    cell.setAttribute('data-page', pageNumber);
    cell.setAttribute('draggable', 'true');
    cell.setAttribute('role', 'button');
    cell.setAttribute('tabindex', '0');
    cell.setAttribute('aria-label', `${accessibleLabelText}, empty slot`);

    if (upsideDown) {
      cell.classList.add('is-template-upside-down');
    }

    cell.replaceChildren(this.cellTemplate.content.cloneNode(true));
    const label = cell.querySelector('.page-label');
    label.textContent = labelText;
    if (!options.pageNumbersVisible) {
      label.classList.add('hidden');
    }

    const orientTag = cell.querySelector('.page-orientation-tag');
    if (orientTag && upsideDown) {
      orientTag.textContent = '180° Fold';
      orientTag.classList.remove('hidden');
    }

    const placeholderRole = cell.querySelector('.page-placeholder-role');
    if (placeholderRole) {
      placeholderRole.textContent = accessibleLabelText;
    }

    const img = cell.querySelector('.page-content-img');
    img.alt = altText;

    cell.addEventListener('dragstart', (e) => handlers.onDragStart(e, cell));
    cell.addEventListener('dragover', (e) => handlers.onDragOver(e, cell));
    cell.addEventListener('dragleave', (e) => handlers.onDragLeave(cell, e));
    cell.addEventListener('drop', (e) => handlers.onDrop(e, cell));
    cell.addEventListener('dragend', () => handlers.onDragEnd(cell));
    cell.addEventListener('click', (e) => handlers.onClick(e, pageIndex));
    cell.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handlers.onClick(e, pageIndex);
      }
    });

    const toolbar = cell.querySelector('.page-toolbar');
    if (toolbar) {
      TOOLBAR_BUTTONS.forEach(({ selector, title, ariaLabel }) => {
        const button = toolbar.querySelector(selector);
        if (!button) {
          return;
        }

        button.type = 'button';
        button.setAttribute('title', title(accessibleLabelText));
        button.setAttribute('aria-label', ariaLabel(accessibleLabelText));
      });

      const replaceBtn = toolbar.querySelector('.replace-btn');
      if (replaceBtn) { replaceBtn.onclick = (e) => { e.stopPropagation(); handlers.onReplace?.(pageIndex); }; }

      const rotateBtn = toolbar.querySelector('.rotate-btn');
      if (rotateBtn) { rotateBtn.onclick = (e) => { e.stopPropagation(); handlers.onRotate?.(pageIndex); }; }

      const flipBtn = toolbar.querySelector('.flip-btn');
      if (flipBtn) { flipBtn.onclick = (e) => { e.stopPropagation(); handlers.onFlip(pageIndex); }; }

      const cropBtn = toolbar.querySelector('.crop-btn');
      if (cropBtn) { cropBtn.onclick = (e) => { e.stopPropagation(); handlers.onCrop(pageIndex); }; }

      const duplicateBtn = toolbar.querySelector('.duplicate-btn');
      if (duplicateBtn) { duplicateBtn.onclick = (e) => { e.stopPropagation(); handlers.onDuplicate?.(pageIndex); }; }
    }

    const removeBtn = cell.querySelector('.page-cell-remove-hint');
    if (removeBtn) {
      removeBtn.onclick = (e) => {
        e.stopPropagation();
        handlers.onRemove?.(pageIndex);
      };
    }

    return cell;
  }
}
