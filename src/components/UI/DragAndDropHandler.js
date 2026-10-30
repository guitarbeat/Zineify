import Sortable from 'sortablejs';

/**
 * DragAndDropHandler.js
 * File-drop handling + SortableJS page reordering
 */
export class DragAndDropHandler {
  constructor(elements, emitter) {
    this.elements = elements;
    this.emitter = emitter;
    this._sortables = [];
  }

  setupEventListeners() {
    // Upload zone
    this.elements.uploadZone?.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.elements.uploadZone.classList.add('dragover');
    });
    this.elements.uploadZone?.addEventListener('dragleave', () => {
      this.elements.uploadZone.classList.remove('dragover');
    });
    this.elements.uploadZone?.addEventListener('drop', (e) => {
      e.preventDefault();
      this.elements.uploadZone.classList.remove('dragover');
      const files = Array.from(e.dataTransfer.files);
      if (files.length) {this.emitter.emit('filesDropped', files);}
    });

    // Unified drop zone (workspace canvas) — external file drops only
    const zone = document.getElementById('unified-drop-zone');
    if (zone) {
      zone.addEventListener('dragover', (e) => {
        // Ignore drags that originate from page cells (Sortable handles those)
        if (e.dataTransfer?.types.includes('text/plain')) {return;}
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        zone.classList.add('drag-active');
        const hoveredCell = e.target.closest?.('.page-cell');
        zone.querySelectorAll('.page-cell.is-file-drop-target').forEach((cell) => {
          if (cell !== hoveredCell) {cell.classList.remove('is-file-drop-target');}
        });
        if (hoveredCell) {hoveredCell.classList.add('is-file-drop-target');}
      });
      zone.addEventListener('dragleave', (e) => {
        if (!zone.contains(e.relatedTarget)) {
          zone.classList.remove('drag-active');
          zone.querySelectorAll('.page-cell.is-file-drop-target').forEach((cell) => {
            cell.classList.remove('is-file-drop-target');
          });
        }
      });
      zone.addEventListener('drop', (e) => {
        zone.classList.remove('drag-active');
        zone.querySelectorAll('.page-cell.is-file-drop-target').forEach((cell) => {
          cell.classList.remove('is-file-drop-target');
        });
        const files = Array.from(e.dataTransfer?.files ?? []);
        if (files.length) {
          e.preventDefault();
          const dropCell = e.target.closest?.('.page-cell');
          const rawSlotIdx = dropCell ? parseInt(dropCell.getAttribute('data-page-index'), 10) : NaN;
          const targetSlotIndex = Number.isFinite(rawSlotIdx) ? rawSlotIdx : null;
          this.emitter.emit('filesDropped', { files, targetSlotIndex });
        }
      });
    }
  }

  /**
   * Attach a Sortable instance to one zine grid.
   * Call after every render (LayoutRenderer re-creates DOM).
   */
  initSortable(gridEl) {
    if (!gridEl) {return;}

    let draggedPageIndex = null;
    let targetPageIndex  = null;
    let lastClientX      = null;
    let currentTiltDeg   = 0;

    const updateDragTilt = (e) => {
      const clientX = e.clientX ?? e.touches?.[0]?.clientX;
      if (typeof clientX !== 'number') { return; }
      if (lastClientX !== null) {
        const dx = clientX - lastClientX;
        const targetTilt = Math.max(-5, Math.min(5, dx * 0.42));
        currentTiltDeg = currentTiltDeg * 0.55 + targetTilt * 0.45;
        gridEl.style.setProperty('--drag-tilt', `${currentTiltDeg.toFixed(2)}deg`);
      }
      lastClientX = clientX;
    };

    const clearMagneticTargets = () => {
      gridEl.querySelectorAll('.page-cell.is-magnetic-target').forEach((el) => {
        el.classList.remove('is-magnetic-target');
      });
    };

    const s = new Sortable(gridEl, {
      animation: 220,
      easing: 'cubic-bezier(0.22, 1.28, 0.36, 1)',
      ghostClass:  'sortable-ghost',
      chosenClass: 'sortable-chosen',
      dragClass:   'sortable-drag',

      // Don't start a sort drag when clicking toolbar buttons
      filter: '.page-toolbar, button',
      preventOnFilter: false,

      onStart: ({ item }) => {
        draggedPageIndex = parseInt(item.dataset.pageIndex, 10);
        targetPageIndex  = null;
        lastClientX      = null;
        currentTiltDeg   = -1.5;
        gridEl.classList.add('is-tile-dragging');
        gridEl.style.setProperty('--drag-tilt', '-1.5deg');
        window.addEventListener('dragover', updateDragTilt, { passive: true });
        window.addEventListener('pointermove', updateDragTilt, { passive: true });
      },

      // Track the last cell the ghost hovered over and apply magnetic pull
      onMove: (evt) => {
        const rel = evt.related;
        if (rel?.classList.contains('page-cell')) {
          clearMagneticTargets();
          rel.classList.add('is-magnetic-target');
          targetPageIndex = parseInt(rel.dataset.pageIndex, 10);
        }
        return true;
      },

      onEnd: () => {
        window.removeEventListener('dragover', updateDragTilt);
        window.removeEventListener('pointermove', updateDragTilt);
        gridEl.classList.remove('is-tile-dragging');
        gridEl.style.removeProperty('--drag-tilt');
        clearMagneticTargets();

        if (
          draggedPageIndex !== null &&
          targetPageIndex  !== null &&
          draggedPageIndex !== targetPageIndex
        ) {
          const fromIdx = draggedPageIndex;
          const toIdx = targetPageIndex;
          const container = this.elements.zineSheetsContainer;
          const prevFromEl = container?.querySelector(`.page-cell[data-page-index="${fromIdx}"]`);
          const prevToEl = container?.querySelector(`.page-cell[data-page-index="${toIdx}"]`);
          const fromRect = prevFromEl?.getBoundingClientRect();
          const toRect = prevToEl?.getBoundingClientRect();

          this.emitter.emit('pagesSwapped', {
            fromIndex: fromIdx,
            toIndex:   toIdx,
          });

          // Animate the swapped tiles with a tactile FLIP spring settle
          if (fromRect && toRect && container) {
            const nextFromEl = container.querySelector(`.page-cell[data-page-index="${fromIdx}"]`);
            const nextToEl = container.querySelector(`.page-cell[data-page-index="${toIdx}"]`);
            this._animateMagneticSwap(nextToEl, fromRect, toRect);
            this._animateMagneticSwap(nextFromEl, toRect, fromRect);
          }
        }
        draggedPageIndex = null;
        targetPageIndex  = null;
      },
    });

    this._sortables.push(s);
    return s;
  }

  _animateMagneticSwap(cellEl, originRect, destRect) {
    if (!cellEl || !originRect || !destRect) { return; }
    cellEl.classList.add('is-magnetic-swapped');
    setTimeout(() => cellEl.classList.remove('is-magnetic-swapped'), 420);

    if (typeof cellEl.animate !== 'function') { return; }
    const dx = (originRect.left - destRect.left) * 0.38;
    const dy = (originRect.top - destRect.top) * 0.38;
    const tilt = dx >= 0 ? 2.4 : -2.4;

    try {
      cellEl.animate(
        [
          { transform: `translate(${dx}px, ${dy}px) scale(1.045) rotate(${tilt}deg)`, zIndex: 35 },
          { transform: 'translate(0px, -2px) scale(1.015) rotate(-0.6deg)', offset: 0.68, zIndex: 35 },
          { transform: 'translate(0px, 0px) scale(1) rotate(0deg)', zIndex: 1 }
        ],
        {
          duration: 360,
          easing: 'cubic-bezier(0.22, 1.28, 0.36, 1)'
        }
      );
    } catch {
      // Ignore animation errors in headless environments
    }
  }

  /** Destroy all Sortable instances (call before re-render) */
  destroySortables() {
    this._sortables.forEach(s => s.destroy());
    this._sortables = [];
  }
}
