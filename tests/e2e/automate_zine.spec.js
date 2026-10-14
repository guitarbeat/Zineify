import { test, expect } from '@playwright/test';
import path from 'path';

test.skip('imports a 16-page PDF into a 4 x 4 layout and exports it', async ({ page }) => {
  test.setTimeout(90000);

  await page.goto('/');

  await page.locator('#grid-rows').fill('4');
  await page.locator('#grid-cols').fill('4');

  await expect(page.locator('#grid-total')).toHaveText('16 slots', { timeout: 10000 });

  const pdfPath = path.resolve('tests/assets/test-16-pages.pdf');
  await page.locator('#pdf-upload').setInputFiles(pdfPath);

  await expect(page.locator('#upload-status')).toHaveText('Imported 16 of 16 pages from test-16-pages.pdf', {
    timeout: 45000
  });

  await expect(page.locator('#preview-count-chip')).toHaveText('16/16');
  await page.waitForFunction(() => {
    const images = Array.from(document.querySelectorAll('.page-cell .page-content-img'));
    return images.filter((img) => /^blob:/.test(img.getAttribute('src') || '')).length >= 16;
  }, { timeout: 45000 });

  const downloadPromise = page.waitForEvent('download');
  await page.locator('#exportPdfBtn').click();

  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.pdf$/i);

  const outputPath = path.resolve('zine-output.pdf');
  await download.saveAs(outputPath);
});
