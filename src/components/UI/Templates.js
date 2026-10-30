import DOMPurify from 'dompurify';
/**
 * Templates.js
 * Centralized HTML templates for UI components
 */

const RAW_PAGE_CELL_TEMPLATE = `
  <span class="page-label"></span>
  <span class="page-orientation-tag hidden"></span>
  <span class="page-rotation-badge hidden"></span>
  <div class="page-toolbar absolute top-1.5 right-1.5 flex items-center gap-1 z-10" data-layout="row">
    <button class="replace-btn page-tool-btn" aria-label="Replace page file" title="Replace this slot with another file">
      <span class="material-symbols-outlined page-tool-icon" aria-hidden="true">upload_file</span>
      <span class="page-tool-label">Replace</span>
    </button>
    <button class="crop-btn page-tool-btn" aria-label="Toggle fit or fill for this page (C)" title="Fit — make the whole page visible. Fill — zoom to cover the slot. (C)">
      <span class="material-symbols-outlined page-tool-icon" aria-hidden="true">fit_screen</span>
      <span class="page-tool-label">Fit</span>
    </button>
    <button class="rotate-btn page-tool-btn" aria-label="Rotate page 90 degrees clockwise (T)" title="Rotate 90° clockwise (T)">
      <span class="material-symbols-outlined page-tool-icon" aria-hidden="true">rotate_90_degrees_cw</span>
      <span class="page-tool-label">90°</span>
    </button>
    <button class="flip-btn page-tool-btn" aria-label="Rotate page 180 degrees (R)" title="Rotate 180° — flip the page upside-down. (R)">
      <span class="material-symbols-outlined page-tool-icon" aria-hidden="true">rotate_right</span>
      <span class="page-tool-label">180°</span>
    </button>
    <button class="duplicate-btn page-tool-btn" aria-label="Duplicate this page (D)" title="Duplicate this page to next open slot (D)">
      <span class="material-symbols-outlined page-tool-icon" aria-hidden="true">content_copy</span>
      <span class="page-tool-label">Copy</span>
    </button>
  </div>
  <div class="page-placeholder flex flex-col items-center justify-center gap-1.5 absolute inset-0">
     <span class="material-symbols-outlined text-2xl">add_photo_alternate</span>
     <span class="page-placeholder-role"></span>
     <span class="page-placeholder-hint">click to add</span>
  </div>
  <button type="button" class="page-cell-remove-hint" aria-label="Remove page" title="Remove page from slot (Delete)">
    <div class="page-cell-remove-hint-inner">
      <span class="material-symbols-outlined">delete</span>
      <span class="page-cell-remove-hint-label">Clear</span>
    </div>
  </button>
  <img class="page-content-img w-full h-full object-contain hidden transition-transform duration-200 ease-in-out relative z-[5]" draggable="false" />
`;

export const PAGE_CELL_TEMPLATE = document.createElement('template');
PAGE_CELL_TEMPLATE.content.appendChild(
  DOMPurify.sanitize(RAW_PAGE_CELL_TEMPLATE, { RETURN_DOM_FRAGMENT: true })
);


import { formatFileSize } from '../../utils/helpers.js';

/**
 * Creates a DOM element representing an uploaded file item.
 * @param {Object} file - File metadata ({ name, kind, size })
 * @param {Function} onRemove - Callback invoked when the remove button is clicked
 * @returns {HTMLElement}
 */
export function createUploadedFileItem(file, onRemove) {
  const item = document.createElement('div');
  item.className = 'uploaded-file-item';

  const icon = document.createElement('span');
  icon.className = 'material-symbols-outlined';
  icon.style.fontSize = '14px';
  icon.textContent = 'description';
  icon.setAttribute('aria-hidden', 'true');

  const body = document.createElement('div');
  body.className = 'uploaded-file-body';

  const name = document.createElement('div');
  name.className = 'uploaded-file-name';
  name.textContent = file.name;
  name.title = file.name;

  const meta = document.createElement('div');
  meta.className = 'uploaded-file-meta';
  meta.textContent = `${file.kind === 'pdf' ? 'PDF' : 'Image'} \u2022 ${formatFileSize(file.size)}`;

  body.appendChild(name);
  body.appendChild(meta);

  const remove = document.createElement('button');
  remove.className = 'uploaded-file-remove';
  remove.type = 'button';
  remove.setAttribute('aria-label', `Remove ${file.name}`);

  const removeIcon = document.createElement('span');
  removeIcon.className = 'material-symbols-outlined';
  removeIcon.style.fontSize = '14px';
  removeIcon.textContent = 'close';
  removeIcon.setAttribute('aria-hidden', 'true');

  remove.appendChild(removeIcon);
  if (typeof onRemove === 'function') {
    remove.addEventListener('click', onRemove);
  }

  item.appendChild(icon);
  item.appendChild(body);
  item.appendChild(remove);

  return item;
}
