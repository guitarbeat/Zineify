import { test, expect } from '@playwright/test';
import { jsPDF } from 'jspdf';

function createPdfBuffer(label) {
  const doc = new jsPDF();
  doc.text(label, 10, 10);
  return Buffer.from(doc.output('arraybuffer'));
}

async function setQuadrantInputFile(page, name = 'cover-map.png') {
  const dataTransfer = await page.evaluateHandle((fileName) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1000;
    canvas.height = 1414;

    const context = canvas.getContext('2d');
    context.fillStyle = '#ff0000';
    context.fillRect(0, 0, 500, 707);
    context.fillStyle = '#00ff00';
    context.fillRect(500, 0, 500, 707);
    context.fillStyle = '#0000ff';
    context.fillRect(0, 707, 500, 707);
    context.fillStyle = '#ffff00';
    context.fillRect(500, 707, 500, 707);

    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Failed to generate preview test image'));
          return;
        }

        const data = new DataTransfer();
        data.items.add(new File([blob], fileName, { type: 'image/png' }));
        resolve(data);
      }, 'image/png');
    });
  }, name);

  await page.evaluate((dt) => {
    const input = document.querySelector('#pdf-upload');
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: dt.files
    });
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, dataTransfer);
}

async function samplePreviewPixel(page, selector, xRatio = 0.1, yRatio = 0.1) {
  return page.evaluate(async ({ targetSelector, x, y }) => {
    const imageElement = document.querySelector(targetSelector);
    const src = imageElement?.getAttribute('src');

    if (!src) {
      return null;
    }

    const image = new Image();
    image.src = src;
    await image.decode();

    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth || image.width || 1;
    canvas.height = image.naturalHeight || image.height || 1;

    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);

    const sampleX = Math.max(0, Math.min(canvas.width - 1, Math.floor(canvas.width * x)));
    const sampleY = Math.max(0, Math.min(canvas.height - 1, Math.floor(canvas.height * y)));
    const [r, g, b, a] = context.getImageData(sampleX, sampleY, 1, 1).data;

    return { r, g, b, a };
  }, { targetSelector: selector, x: xRatio, y: yRatio });
}

test.skip('opens the 3D preview modal with a sized canvas', async ({ page }) => {
  await page.goto('/');

  await page.locator('#pdf-upload').setInputFiles({
    name: '3d-preview.pdf',
    mimeType: 'application/pdf',
    buffer: createPdfBuffer('3D')
  });

  await expect(page.locator('#upload-status')).toHaveText('Imported 1 of 1 pages from 3d-preview.pdf', { timeout: 30000 });

  await expect(page.locator('#printBtn')).toHaveCount(0);
  await page.locator('#view3dBtn').click();

  const modal = page.locator('#zine-3d-modal');
  await expect(modal).toBeVisible();

  await page.waitForFunction(() => {
    const canvas = document.querySelector('#zine-3d-container canvas');
    if (!canvas) {
      return false;
    }

    return canvas.clientWidth > 0 && canvas.clientHeight > 0;
  }, { timeout: 10000 });

  const canvasBox = await page.locator('#zine-3d-container canvas').boundingBox();
  expect(canvasBox?.width || 0).toBeGreaterThan(0);
  expect(canvasBox?.height || 0).toBeGreaterThan(0);

  await expect(page.locator('#booklet-status')).toHaveText('Cover');
  await expect(page.locator('.booklet-spread')).toHaveClass(/is-single-right/);

  await page.locator('#fold-slider').fill('1');
  await expect(page.locator('#fold-status')).toHaveText('Folded Strip');

  await page.locator('#fold-slider').fill('2');
  await expect(page.locator('#fold-status')).toHaveText('Diamond Open');

  await page.locator('#fold-slider').fill('3');
  await expect(page.locator('#fold-status')).toHaveText('Booklet');

  await page.locator('#booklet-next-btn').click();
  await expect(page.locator('#booklet-status')).toHaveText('Pages 2-3');
});

test.skip('booklet preview reflects flip adjustments from the sheet preview', async ({ page }) => {
  await page.goto('/');

  await setQuadrantInputFile(page);

  await expect(page.locator('#upload-status')).toHaveText('Imported image: cover-map.png', { timeout: 30000 });

  await page.locator('.page-cell[data-page-index="0"]').hover();
  await page.getByRole('button', { name: 'Rotate Cover 180 degrees (R)' }).click();
  await page.locator('#view3dBtn').click();

  const modal = page.locator('#zine-3d-modal');
  await expect(modal).toBeVisible();
  await expect(page.locator('#booklet-status')).toHaveText('Cover');

  const pixel = await samplePreviewPixel(page, '.booklet-page-right .booklet-page-media', 0.1, 0.1);

  expect(pixel).not.toBeNull();
  expect(pixel.r).toBeGreaterThan(200);
  expect(pixel.g).toBeGreaterThan(200);
  expect(pixel.b).toBeLessThan(80);
});
