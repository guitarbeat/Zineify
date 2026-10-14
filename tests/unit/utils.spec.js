import { JSDOM } from 'jsdom';
import DOMPurify from 'dompurify';
import { test, expect } from '@playwright/test';
import { clampNumber, formatFileSize, isNumber, debounce, parseBoundedInteger, resizeAndFillArray, sanitizeHTML, runWithConcurrencyLimit } from '../../src/utils/helpers.js';
import {
  classifyFileKind,
  getFileTypeLabel,
  validateUploadFile,
  partitionSupportedFiles
} from '../../src/utils/fileValidation.js';

test.describe('Utils', () => {
  test.beforeAll(() => {
    const window = new JSDOM('').window;
    // Set up global document for document.createDocumentFragment
    global.document = window.document;

    // Initialize DOMPurify factory and override the default
    const purify = DOMPurify(window);
    DOMPurify.sanitize = purify.sanitize;
  });

  test('sanitizeHTML preserves allowed tags and strips scripts', () => {
    // Edge cases: null, undefined, empty string, non-string
    expect(sanitizeHTML(null).nodeType).toBe(11); // 11 is Node.DOCUMENT_FRAGMENT_NODE
    expect(sanitizeHTML(undefined).nodeType).toBe(11);
    expect(sanitizeHTML('').nodeType).toBe(11);
    expect(sanitizeHTML(123).nodeType).toBe(11);

    // Content retention for allowed tags
    const cleanFragm = sanitizeHTML('<b>bold</b> <i>italic</i> <code>code</code>');
    expect(cleanFragm.childNodes.length).toBeGreaterThan(0);
    expect(cleanFragm.textContent).toBe('bold italic code');

    // Stripping malicious tags and disallowed attributes
    const dirtyFragm = sanitizeHTML('<script>alert("xss")</script><b onclick="bad()">bold</b>');
    expect(dirtyFragm.textContent).toBe('bold');

    // Check if script tag was completely removed
    const tmpDiv = global.document.createElement('div');
    tmpDiv.appendChild(dirtyFragm);
    expect(tmpDiv.innerHTML).toBe('<b>bold</b>');
  });

  test.afterAll(() => {
    delete global.document;
  });
  test('formatFileSize', () => {
    expect(formatFileSize(0)).toBe('0 B');
    expect(formatFileSize(1024)).toBe('1.0 KB');
    expect(formatFileSize(1048576)).toBe('1.0 MB');
    expect(formatFileSize(1073741824)).toBe('1.0 GB');
    expect(formatFileSize('not a number')).toBe('0 B');
  });

  test('isNumber', () => {
    expect(isNumber(123)).toBe(true);
    expect(isNumber(0)).toBe(true);
    expect(isNumber(-123)).toBe(true);
    expect(isNumber(1.23)).toBe(true);
    expect(isNumber('123')).toBe(false);
    expect(isNumber(NaN)).toBe(false);
    expect(isNumber(Infinity)).toBe(false);
  });

  test('clampNumber', () => {
    expect(clampNumber(5, 1, 10)).toBe(5);
    expect(clampNumber(-3, 1, 10)).toBe(1);
    expect(clampNumber(42, 1, 10)).toBe(10);
  });

  test('parseBoundedInteger', () => {
    expect(parseBoundedInteger('7', { min: 1, max: 10, fallback: 2 })).toBe(7);
    expect(parseBoundedInteger('1000', { min: 1, max: 10, fallback: 2 })).toBe(10);
    expect(parseBoundedInteger('0', { min: 1, max: 10, fallback: 2 })).toBe(1);
    expect(parseBoundedInteger('abc', { min: 1, max: 10, fallback: 2 })).toBe(2);
  });

  test('debounce', async () => {
    let count = 0;
    const increment = () => { count++; };
    const debouncedIncrement = debounce(increment, 100);

    debouncedIncrement();
    debouncedIncrement();
    debouncedIncrement();

    expect(count).toBe(0);

    await new Promise(resolve => setTimeout(resolve, 150));
    expect(count).toBe(1);
  });

  test('sanitizeHTML handles empty and nested content', () => {
    // 1. Valid inputs with allowed tags
    const doc1 = sanitizeHTML('<b>bold</b> and <i>italic</i>');
    expect(doc1.childNodes.length).toBeGreaterThan(0);
    expect(doc1.textContent).toBe('bold and italic');
    expect(doc1.querySelector('b')).not.toBeNull();
    expect(doc1.querySelector('i')).not.toBeNull();

    // 2. Stripping disallowed tags
    const doc2 = sanitizeHTML('<script>alert("xss")</script><p>text</p><span>span</span>');
    expect(doc2.querySelector('script')).toBeNull();
    expect(doc2.textContent).toBe('textspan');
    expect(doc2.querySelector('span')).not.toBeNull();

    // 3. Handling invalid inputs
    const doc3 = sanitizeHTML(null);
    expect(doc3).toBeTruthy();
    expect(doc3.nodeType).toBe(11); // DocumentFragment
    expect(doc3.childNodes.length).toBe(0);

    const doc4 = sanitizeHTML('');
    expect(doc4.nodeType).toBe(11);
    expect(doc4.childNodes.length).toBe(0);

    const doc5 = sanitizeHTML(123);
    expect(doc5.nodeType).toBe(11);
    expect(doc5.childNodes.length).toBe(0);
  });

  test('classifyFileKind', () => {
    expect(classifyFileKind({ type: 'application/pdf', name: 'test.pdf' })).toBe('pdf');
    expect(classifyFileKind({ type: 'image/png', name: 'test.png' })).toBe('image');
    expect(classifyFileKind({ type: 'image/jpeg', name: 'test.jpg' })).toBe('image');
    expect(classifyFileKind({ type: 'text/plain', name: 'test.txt' })).toBeNull();
  });

  test('getFileTypeLabel', () => {
    expect(getFileTypeLabel('pdf')).toBe('PDF');
    expect(getFileTypeLabel('image')).toBe('Image');
    expect(getFileTypeLabel('unknown')).toBe('File');
  });

  test('validateUploadFile', () => {
    expect(validateUploadFile({ type: 'application/pdf', name: 'doc.pdf', size: 1024 })).toEqual({
      valid: true,
      errors: [],
      kind: 'pdf'
    });

    expect(validateUploadFile({ type: 'image/png', name: 'photo.png', size: 2048 })).toEqual({
      valid: true,
      errors: [],
      kind: 'image'
    });

    const invalid = validateUploadFile({ type: 'text/plain', name: 'doc.txt', size: 12 });
    expect(invalid.valid).toBe(false);
    expect(invalid.kind).toBeNull();
    expect(invalid.errors).toContain('Please select a PDF or image file.');

    // Test spoofed mime type
    const spoofed = validateUploadFile({ type: 'application/pdf', size: 1024, name: 'exploit.html' });
    expect(spoofed.valid).toBe(false);
    expect(spoofed.kind).toBeNull();
  });

  test('partitionSupportedFiles', () => {
    // Empty array
    expect(partitionSupportedFiles([])).toEqual({
      acceptedFiles: [],
      rejectedFiles: []
    });

    // Only accepted files
    const accepted = [{ type: 'application/pdf', name: 'a.pdf' }, { type: 'image/png', name: 'b.png' }];
    expect(partitionSupportedFiles(accepted)).toEqual({
      acceptedFiles: accepted,
      rejectedFiles: []
    });

    // Only rejected files
    const rejected = [{ type: 'text/plain', name: 'c.txt' }, { type: 'audio/mp3', name: 'd.mp3' }];
    expect(partitionSupportedFiles(rejected)).toEqual({
      acceptedFiles: [],
      rejectedFiles: rejected
    });

    // Mixed array
    const mixed = [{ type: 'application/pdf', name: 'e.pdf' }, { type: 'text/plain', name: 'f.txt' }, { type: 'image/jpeg', name: 'g.jpg' }];
    expect(partitionSupportedFiles(mixed)).toEqual({
      acceptedFiles: [mixed[0], mixed[2]],
      rejectedFiles: [mixed[1]]
    });

    // Array with edge cases and malformed objects (null, undefined, primitives, missing/invalid properties)
    const sym = Symbol("file");
    const fn = () => {};
    const malformedFiles = [
      null,
      undefined,
      123,
      "string_file",
      true,
      {},
      { type: 'application/pdf' },
      { name: 'document.pdf' },
      { name: 123 },
      { name: ".pdf" },
      { name: "test.pdf", type: null },
      { name: "test.png", type: 123 },
      { name: {}, type: 'application/pdf' },
      { name: 'image.png', type: [] },
      { name: sym, type: 'application/pdf' },
      { name: NaN, type: 'application/pdf' },
      { name: fn, type: 'application/pdf' },
      { name: 10n, type: 'application/pdf' },
      new Date(),
      new Error('malformed'),
      { name: "test.", type: "application/pdf" },
      { name: "UPPER.PDF", type: "application/pdf" },
      { name: "test.pdf", type: "application/pdf" }
    ];
    expect(partitionSupportedFiles(malformedFiles)).toEqual({
      acceptedFiles: [malformedFiles[21], malformedFiles[22]],
      rejectedFiles: malformedFiles.slice(0, 21)
    });

    // Sparse array input
    const sparseArray = [, { name: "test.pdf", type: "application/pdf" }];
    expect(partitionSupportedFiles(sparseArray)).toEqual({
      acceptedFiles: [{ name: "test.pdf", type: "application/pdf" }],
      rejectedFiles: [undefined]
    });

    // Non-array inputs (null, undefined, non-array object, array-like object, primitive)
    expect(partitionSupportedFiles(null)).toEqual({ acceptedFiles: [], rejectedFiles: [] });
    expect(partitionSupportedFiles(undefined)).toEqual({ acceptedFiles: [], rejectedFiles: [] });
    expect(partitionSupportedFiles({})).toEqual({ acceptedFiles: [], rejectedFiles: [] });
    expect(partitionSupportedFiles({ 0: { name: "test.pdf", type: "application/pdf" }, length: 1 })).toEqual({ acceptedFiles: [], rejectedFiles: [] });
    expect(partitionSupportedFiles(42)).toEqual({ acceptedFiles: [], rejectedFiles: [] });
  });


  test('sanitizeHTML', () => {
    // Non-string or empty input
    let result = sanitizeHTML(null);
    expect(result.nodeType).toBe(11); // DocumentFragment
    expect(result.childNodes.length).toBe(0);

    result = sanitizeHTML('');
    expect(result.nodeType).toBe(11);
    expect(result.childNodes.length).toBe(0);

    result = sanitizeHTML(123);
    expect(result.nodeType).toBe(11);
    expect(result.childNodes.length).toBe(0);

    // Sanitizes HTML and returns a DocumentFragment with allowed tags
    const input = '<b>Bold</b> and <em>italic</em> with <script>alert(1)</script>';
    result = sanitizeHTML(input);
    expect(result.nodeType).toBe(11);
    const div = document.createElement('div');
    div.appendChild(result);
    expect(div.innerHTML).toBe('<b>Bold</b> and <em>italic</em> with ');

    // Removes disallowed tags but keeps text content
    const input2 = '<div>Div content</div><span>Span content</span>';
    result = sanitizeHTML(input2);
    const div2 = document.createElement('div');
    div2.appendChild(result);
    expect(div2.innerHTML).toBe('Div content<span>Span content</span>');

    // Handles complex nested allowed tags
    const input3 = '<b><strong><i><em><u><br><code><span>text</span></code></u></em></i></strong></b>';
    result = sanitizeHTML(input3);
    const div3 = document.createElement('div');
    div3.appendChild(result);
    expect(div3.innerHTML).toBe('<b><strong><i><em><u><br><code><span>text</span></code></u></em></i></strong></b>');
  });

  test('resizeAndFillArray', () => {
    // Growing: fills remainder with null by default
    expect(resizeAndFillArray([1, 2], 4)).toEqual([1, 2, null, null]);

    // Shrinking: truncates to requested length
    expect(resizeAndFillArray([1, 2, 3], 2)).toEqual([1, 2]);

    // Same length: returns copy of same values
    expect(resizeAndFillArray([1, 2, 3], 3)).toEqual([1, 2, 3]);

    // Custom fill value
    expect(resizeAndFillArray([1], 3, 0)).toEqual([1, 0, 0]);

    // Empty input
    expect(resizeAndFillArray([], 3)).toEqual([null, null, null]);

    // Negative requiredLength: treated as 0, returns empty array
    expect(resizeAndFillArray([1, 2], -1)).toEqual([]);
    expect(resizeAndFillArray([1, 2], 0)).toEqual([]);
    // Infinity requiredLength: throws RangeError
    expect(() => resizeAndFillArray([1, 2], Infinity)).toThrow(RangeError);

    // NaN requiredLength: throws RangeError
    expect(() => resizeAndFillArray([1, 2], NaN)).toThrow(RangeError);

    // Floating-point requiredLength: throws RangeError
    expect(() => resizeAndFillArray([1, 2], 3.5)).toThrow(RangeError);

    // Input array immutability check
    const original = [1, 2, 3];
    const result = resizeAndFillArray(original, 5, 'x');
    expect(result).toEqual([1, 2, 3, 'x', 'x']);
    expect(original).toEqual([1, 2, 3]);

    // Preserving falsy values in input array
    expect(resizeAndFillArray([0, '', false, null, undefined], 6, 'pad')).toEqual([0, '', false, null, undefined, 'pad']);

    // Explicit undefined fillValue uses default parameter fillValue = null
    expect(resizeAndFillArray([1], 3, undefined)).toEqual([1, null, null]);

    // Complex object fillValue reference
    const fillObj = { placeholder: true };
    const filledWithObj = resizeAndFillArray([1], 3, fillObj);
    expect(filledWithObj).toEqual([1, fillObj, fillObj]);
    expect(filledWithObj[1]).toBe(fillObj);
    expect(filledWithObj[2]).toBe(fillObj);

    // Sparse input array handling
    const sparse = [1, , 3]; // eslint-disable-line no-sparse-arrays
    expect(resizeAndFillArray(sparse, 4, null)).toEqual([1, undefined, 3, null]);
  });

  test('runWithConcurrencyLimit', async () => {
    // 1. Basic task execution for all items
    const processedItems = [];
    await runWithConcurrencyLimit([1, 2, 3], 2, async (item) => {
      processedItems.push(item);
    });
    expect(processedItems).toEqual([1, 2, 3]);

    // 2. Concurrency limit adherence
    const active = new Set();
    let maxActive = 0;
    await runWithConcurrencyLimit([10, 20, 30, 40, 50], 2, async (item) => {
      active.add(item);
      maxActive = Math.max(maxActive, active.size);
      await new Promise((resolve) => setTimeout(resolve, 20));
      active.delete(item);
    });
    expect(maxActive).toBeLessThanOrEqual(2);

    // 3. Handles empty array
    let called = false;
    await runWithConcurrencyLimit([], 3, async () => {
      called = true;
    });
    expect(called).toBe(false);

    // 4. Handles task failure and propagates error
    const failedPromise = runWithConcurrencyLimit([1, 2, 3], 2, async (item) => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      if (item === 2) {
        throw new Error('Task failed');
      }
    });
    await expect(failedPromise).rejects.toThrow('Task failed');

    // 5. Handles non-Array Iterables (Set and Generator)
    const setIter = new Set(['a', 'b', 'c']);
    const setResults = [];
    await runWithConcurrencyLimit(setIter, 2, async (item) => {
      setResults.push(item);
    });
    expect(setResults).toEqual(['a', 'b', 'c']);

    function* generateItems() {
      yield 100;
      yield 200;
      yield 300;
    }
    const genResults = [];
    await runWithConcurrencyLimit(generateItems(), 2, async (item) => {
      genResults.push(item);
    });
    expect(genResults).toEqual([100, 200, 300]);

    // 6. Concurrency limit = 1 runs sequentially
    const seqActive = new Set();
    let seqMaxActive = 0;
    await runWithConcurrencyLimit([1, 2, 3, 4], 1, async (item) => {
      seqActive.add(item);
      seqMaxActive = Math.max(seqMaxActive, seqActive.size);
      await new Promise((resolve) => setTimeout(resolve, 10));
      seqActive.delete(item);
    });
    expect(seqMaxActive).toBe(1);

    // 7. Concurrency limit higher than item count
    const highLimitResults = [];
    await runWithConcurrencyLimit([1, 2], 10, async (item) => {
      highLimitResults.push(item);
    });
    expect(highLimitResults).toEqual([1, 2]);

    // 8. Handles out-of-order task completions correctly
    const completedInOrder = [];
    await runWithConcurrencyLimit([30, 10, 5], 2, async (delay) => {
      await new Promise((resolve) => setTimeout(resolve, delay));
      completedInOrder.push(delay);
    });
    expect(completedInOrder).toEqual([10, 5, 30]);

    // 9. Ensures active promises complete/settle on error without unhandled rejections
    let taskFinishedCount = 0;
    const cleanupFailPromise = runWithConcurrencyLimit([10, 50, 100], 2, async (delay) => {
      await new Promise((resolve) => setTimeout(resolve, delay));
      taskFinishedCount++;
      if (delay === 10) {
        throw new Error('Early failure');
      }
    });
    await expect(cleanupFailPromise).rejects.toThrow('Early failure');
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(taskFinishedCount).toBe(2);

    // 10. Handles synchronous taskFn returning non-Promise values or resolved promises immediately
    const syncResults = [];
    await runWithConcurrencyLimit([1, 2, 3], 2, async (item) => {
      syncResults.push(item * 2);
      return item * 2;
    });
    expect(syncResults).toEqual([2, 4, 6]);

    // 11. Edge case: concurrencyLimit of 0 or negative
    const zeroLimitResults = [];
    await runWithConcurrencyLimit([1, 2], 0, async (item) => {
      zeroLimitResults.push(item);
    });
    expect(zeroLimitResults).toEqual([1, 2]);

    // 12. Ensures error path in catch block invokes Promise.allSettled and re-throws error during loop or final Promise.all
    let settledPromisesCountLoop = 0;
    let settledPromisesCountAll = 0;
    const originalAllSettled = Promise.allSettled;

    // Test 12a: Error thrown during loop iteration (await Promise.race path)
    Promise.allSettled = async function(promises) {
      settledPromisesCountLoop = Array.from(promises).length;
      return originalAllSettled.call(this, promises);
    };

    try {
      const loopRejectionTask = runWithConcurrencyLimit([1, 2, 3], 2, async (item) => {
        if (item === 1) {
          throw new Error('Loop iteration error');
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
      });
      await expect(loopRejectionTask).rejects.toThrow('Loop iteration error');
      expect(settledPromisesCountLoop).toBeGreaterThan(0);
    } finally {
      Promise.allSettled = originalAllSettled;
    }

    // Test 12b: Error caught from Promise.all after iteration loop completes
    Promise.allSettled = async function(promises) {
      settledPromisesCountAll = Array.from(promises).length;
      return originalAllSettled.call(this, promises);
    };

    try {
      const allRejectionTask = runWithConcurrencyLimit([10, 20, 30], 5, async (item) => {
        if (item === 10) {
          throw new Error('Late Promise.all rejection');
        }
        await new Promise((resolve) => setTimeout(resolve, 30));
      });
      await expect(allRejectionTask).rejects.toThrow('Late Promise.all rejection');
      expect(settledPromisesCountAll).toBeGreaterThan(0);
    } finally {
      Promise.allSettled = originalAllSettled;
    }
  });

});
