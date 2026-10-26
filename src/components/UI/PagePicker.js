import { toast } from '../Toast.js';

/**
 * PagePicker.js
 * Self-contained page picker UI component
 */
export class PagePicker {
  constructor(elements) {
    this.elements = elements;
    this.state = null;
    this._bindEvents();
  }

  _bindEvents() {
    const { pagePickerClose, pagePickerCancel, pagePickerBackdrop, pagePickerConfirm,
      pagePickerSelectFirst, pagePickerSelectLast, pagePickerSelectEven,
      pagePickerSelectOdd, pagePickerClear } = this.elements;

    pagePickerClose?.addEventListener('click', () => this.close(null));
    pagePickerCancel?.addEventListener('click', () => this.close(null));
    pagePickerBackdrop?.addEventListener('click', () => this.close(null));
    pagePickerConfirm?.addEventListener('click', () => this.confirm());
    pagePickerSelectFirst?.addEventListener('click', () => this.applyPreset('first'));
    pagePickerSelectLast?.addEventListener('click', () => this.applyPreset('last'));
    pagePickerSelectEven?.addEventListener('click', () => this.applyPreset('even'));
    pagePickerSelectOdd?.addEventListener('click', () => this.applyPreset('odd'));
    pagePickerClear?.addEventListener('click', () => this.applyPreset('clear'));
  }

  open({ fileName, totalPages, selectionLimit, thumbnails }) {
    if (!this.elements.pagePickerModal || !this.elements.pagePickerGrid) {
      return Promise.resolve(
        Array.from({ length: Math.min(selectionLimit, totalPages) }, (_, i) => i + 1)
      );
    }

    if (this.state?.resolve) {
      this.state.resolve(null);
    }

    const initial = thumbnails.slice(0, Math.min(selectionLimit, thumbnails.length))
      .map(({ pageNumber }) => pageNumber);

    this.state = {
      resolve: null,
      thumbnails,
      selectionLimit,
      selected: new Set(initial)
    };

    if (this.elements.pagePickerSubtitle) {
      this.elements.pagePickerSubtitle.textContent = `${fileName} has ${totalPages} pages. Pick up to ${selectionLimit}.`;
    }
    if (this.elements.pagePickerSelectFirst) {
      this.elements.pagePickerSelectFirst.textContent = `First ${selectionLimit}`;
      this.elements.pagePickerSelectFirst.setAttribute('aria-label', `Select first ${selectionLimit} pages`);
    }
    if (this.elements.pagePickerSelectLast) {
      this.elements.pagePickerSelectLast.textContent = `Last ${selectionLimit}`;
      this.elements.pagePickerSelectLast.setAttribute('aria-label', `Select last ${selectionLimit} pages`);
    }

    this._renderGrid(thumbnails, initial);
    this._updateStatus();
    this.elements.pagePickerModal.classList.remove('hidden');
    this.elements.pagePickerModal.classList.add('flex');
    document.body.style.overflow = 'hidden';

    return new Promise((resolve) => {
      this.state.resolve = resolve;
    });
  }

  close(selectedPages = null) {
    if (!this.state) {return;}
    const { resolve } = this.state;
    this.state = null;
    this.elements.pagePickerModal?.classList.add('hidden');
    this.elements.pagePickerModal?.classList.remove('flex');
    this.elements.pagePickerGrid?.replaceChildren();
    document.body.style.overflow = '';
    resolve?.(selectedPages);
  }

  confirm() {
    if (!this.state) {return;}
    const selectedPages = Array.from(this.state.selected).sort((a, b) => a - b);
    if (selectedPages.length === 0) {
      toast.warning('No Pages Selected', 'Choose at least one page to import.');
      return;
    }
    this.close(selectedPages);
  }

  _renderGrid(thumbnails, initialSelection = []) {
    const grid = this.elements.pagePickerGrid;
    if (!grid) {return;}
    grid.replaceChildren();

    if (!thumbnails || thumbnails.length === 0) {
      const emptyNotice = document.createElement('p');
      emptyNotice.className = 'page-picker-empty-notice';
      emptyNotice.textContent = 'No page thumbnails available to display.';
      grid.appendChild(emptyNotice);
      return;
    }

    const selectionSet = new Set(initialSelection);
    thumbnails.forEach(({ pageNumber, thumbnailUrl }) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'page-picker-thumb';
      btn.dataset.pageNumber = String(pageNumber);
      btn.setAttribute('aria-pressed', selectionSet.has(pageNumber) ? 'true' : 'false');
      btn.setAttribute('aria-label', `Toggle selection for page ${pageNumber}`);

      const media = document.createElement('div');
      media.className = 'page-picker-thumb-media';
      const img = document.createElement('img');
      img.src = thumbnailUrl;
      img.alt = `PDF page ${pageNumber}`;
      media.appendChild(img);

      const page = document.createElement('div');
      page.className = 'page-picker-thumb-page';
      const pageSpan = document.createElement('span');
      pageSpan.textContent = `Page ${pageNumber}`;
      const order = document.createElement('span');
      order.className = 'page-picker-thumb-order';
      order.setAttribute('aria-hidden', 'true');
      page.appendChild(pageSpan);
      page.appendChild(order);

      btn.appendChild(media);
      btn.appendChild(page);
      btn.addEventListener('click', () => this._toggle(pageNumber));
      grid.appendChild(btn);
    });
  }

  _toggle(pageNumber) {
    if (!this.state) {return;}
    const { selected, selectionLimit } = this.state;
    if (selected.has(pageNumber)) {
      selected.delete(pageNumber);
    } else {
      if (selected.size >= selectionLimit) {
        toast.warning('Selection Full', `Pick up to ${selectionLimit} pages for this upload.`);
        return;
      }
      selected.add(pageNumber);
    }
    this._updateStatus();
  }

  applyPreset(preset) {
    if (!this.state) {return;}
    const { thumbnails, selectionLimit, selected } = this.state;
    selected.clear();
    let next = [];
    if (preset === 'first') {
      next = thumbnails.slice(0, selectionLimit);
    } else if (preset === 'last') {
      next = thumbnails.slice(-selectionLimit);
    } else if (preset === 'even') {
      next = thumbnails.filter((t) => t.pageNumber % 2 === 0).slice(0, selectionLimit);
    } else if (preset === 'odd') {
      next = thumbnails.filter((t) => t.pageNumber % 2 === 1).slice(0, selectionLimit);
    }
    next.forEach((t) => selected.add(t.pageNumber));
    this._updateStatus();
  }

  _updateStatus() {
    if (!this.state) {return;}
    const selectedPages = Array.from(this.state.selected).sort((a, b) => a - b);
    const orderMap = new Map(selectedPages.map((n, i) => [n, i + 1]));
    const hasCapacity = selectedPages.length < this.state.selectionLimit;

    this.elements.pagePickerGrid?.querySelectorAll('.page-picker-thumb').forEach((btn) => {
      const pageNum = parseInt(btn.dataset.pageNumber || '', 10);
      const isSelected = orderMap.has(pageNum);
      const order = btn.querySelector('.page-picker-thumb-order');
      btn.classList.toggle('is-selected', isSelected);
      btn.classList.toggle('is-disabled', !isSelected && !hasCapacity);
      btn.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
      if (order) {order.textContent = isSelected ? String(orderMap.get(pageNum)) : '';}
    });

    if (this.elements.pagePickerCount) {
      this.elements.pagePickerCount.textContent = `${selectedPages.length} of ${this.state.selectionLimit} selected`;
    }
    if (this.elements.pagePickerConfirm) {
      this.elements.pagePickerConfirm.disabled = selectedPages.length === 0;
      this.elements.pagePickerConfirm.setAttribute('aria-disabled', selectedPages.length === 0 ? 'true' : 'false');
    }
  }
}
