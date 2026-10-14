import { test, expect } from '@playwright/test';
import { jsPDF } from 'jspdf';

function createPdfBuffer(label) {
  const doc = new jsPDF();
  doc.setFontSize(48);
  doc.text(label, 20, 40);
  return Buffer.from(doc.output('arraybuffer'));
}

async function waitForFinalStatus(page, text) {
  await expect(page.locator('#upload-status')).toHaveText(text, { timeout: 30000 });
  await page.waitForFunction(() => {
    const progress = document.querySelector('#progress-container');
    return !progress || progress.classList.contains('hidden');
  }, { timeout: 30000 });
}

async function getRenderedPixel(page, pageIndex) {
  return page.evaluate(async (index) => {
    const img = document.querySelector(`.page-cell[data-page-index="${index}"] .page-content-img`);
    if (!img || !img.getAttribute('src')) {
      return null;
    }

    const image = new Image();
    image.src = img.getAttribute('src');
    await image.decode();

    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth || image.width || 1;
    canvas.height = image.naturalHeight || image.height || 1;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
    return { r, g, b, a };
  }, pageIndex);
}

async function createDataTransfer(page, files) {
  return page.evaluateHandle((items) => {
    const blobFromBase64 = (base64, mimeType) => {
      const binary = atob(base64);
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      return new Blob([bytes], { type: mimeType });
    };

    const makeImageBlob = (color, mimeType) => {
      const canvas = document.createElement('canvas');
      canvas.width = 16;
      canvas.height = 16;
      const context = canvas.getContext('2d');
      context.fillStyle = color;
      context.fillRect(0, 0, 16, 16);

      return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to create test image blob'));
          }
        }, mimeType, 0.92);
      });
    };

    return Promise.all(items.map(async (item) => {
      if (item.kind === 'generated-image') {
        const blob = await makeImageBlob(item.color, item.mimeType);
        return new File([blob], item.name, { type: item.mimeType });
      }

      const blob = blobFromBase64(item.base64, item.mimeType);
      return new File([blob], item.name, { type: item.mimeType });
    })).then((fileList) => {
      const dt = new DataTransfer();
      fileList.forEach((file) => dt.items.add(file));
      return dt;
    });
  }, files);
}

async function setGeneratedInputFiles(page, files) {
  const dataTransfer = await createDataTransfer(page, files);

  await page.evaluate((dt) => {
    const input = document.querySelector('#pdf-upload');
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: dt.files
    });
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, dataTransfer);
}

async function dispatchDrop(page, files) {
  const dataTransfer = await createDataTransfer(page, files);
  await page.locator('#upload-zone').dispatchEvent('drop', { dataTransfer });
}

test('uploads a single JPEG as one zine page', async ({ page }) => {
  await page.goto('/');

  await setGeneratedInputFiles(page, [{
    kind: 'generated-image',
    name: 'cover.jpg',
    mimeType: 'image/jpeg',
    color: '#d97706'
  }]);

  await waitForFinalStatus(page, 'Imported image: cover.jpg');
  await expect(page.locator('#uploaded-files-list .uploaded-file-item')).toHaveCount(1);
  await expect(page.locator('#uploaded-files-list')).toContainText('Image');
});

test('appends multiple images in upload order', async ({ page }) => {
  await page.goto('/');

  await setGeneratedInputFiles(page, [
    {
      kind: 'generated-image',
      name: 'red.png',
      mimeType: 'image/png',
      color: '#ff0000'
    },
    {
      kind: 'generated-image',
      name: 'blue.png',
      mimeType: 'image/png',
      color: '#0000ff'
    }
  ]);

  await waitForFinalStatus(page, 'Imported image: blue.png');

  const firstPixel = await getRenderedPixel(page, 0);
  const secondPixel = await getRenderedPixel(page, 1);

  expect(firstPixel.r).toBeGreaterThan(firstPixel.b);
  expect(secondPixel.b).toBeGreaterThan(secondPixel.r);
});

test('preserves mixed upload order across images and PDFs', async ({ page }) => {
  await page.goto('/');

  await setGeneratedInputFiles(page, [
    {
      kind: 'generated-image',
      name: 'red.png',
      mimeType: 'image/png',
      color: '#ff0000'
    },
    {
      kind: 'base64',
      name: 'middle.pdf',
      mimeType: 'application/pdf',
      base64: createPdfBuffer('PDF').toString('base64')
    },
    {
      kind: 'generated-image',
      name: 'blue.png',
      mimeType: 'image/png',
      color: '#0000ff'
    }
  ]);

  await waitForFinalStatus(page, 'Imported image: blue.png');

  const firstPixel = await getRenderedPixel(page, 0);
  const thirdPixel = await getRenderedPixel(page, 2);

  expect(firstPixel.r).toBeGreaterThan(firstPixel.b);
  expect(thirdPixel.b).toBeGreaterThan(thirdPixel.r);
});

test('queues mixed uploads without concurrent processing errors', async ({ page }) => {
  await page.goto('/');

  await setGeneratedInputFiles(page, [
    {
      kind: 'base64',
      name: 'queue.pdf',
      mimeType: 'application/pdf',
      base64: createPdfBuffer('Q').toString('base64')
    },
    {
      kind: 'generated-image',
      name: 'queue-image.png',
      mimeType: 'image/png',
      color: '#ff0000'
    }
  ]);

  await waitForFinalStatus(page, 'Imported image: queue-image.png');
  await expect(page.locator('#toast-container')).not.toContainText('PDF processing already in progress');
});

test('accepts mixed PDF and image drag-and-drop', async ({ page }) => {
  await page.goto('/');

  await dispatchDrop(page, [
    {
      kind: 'base64',
      name: 'drop.pdf',
      mimeType: 'application/pdf',
      base64: createPdfBuffer('DROP').toString('base64')
    },
    {
      kind: 'generated-image',
      name: 'drop.png',
      mimeType: 'image/png',
      color: '#ff0000'
    }
  ]);

  await waitForFinalStatus(page, 'Imported image: drop.png');
  await expect(page.locator('#uploaded-files-list .uploaded-file-item')).toHaveCount(2);
});
