
import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { jsPDF } from 'jspdf';

const TEST_PDF_PATH = path.resolve('test-blank-page-repro.pdf');

test.beforeAll(() => {
  const doc = new jsPDF();
  doc.setFontSize(40);
  doc.text('Page 1', 10, 50);
  const output = doc.output('arraybuffer');
  fs.writeFileSync(TEST_PDF_PATH, Buffer.from(output));
});

test.afterAll(() => {
  if (fs.existsSync(TEST_PDF_PATH)) {
    fs.unlinkSync(TEST_PDF_PATH);
  }
});

test('verify blank page blob URLs', async ({ page }) => {
  // Increase timeout for PDF processing
  test.setTimeout(60000);

  // Navigate to the app
  await page.goto('/');

  // Upload the file
  await page.setInputFiles('#pdf-upload', TEST_PDF_PATH);

  // Wait for processing to finish
  await expect(page.locator(".toast-success").filter({ hasText: 'Imported 1 of 1 pages from test-blank-page-repro.pdf' })).toBeVisible( { timeout: 20000 });

  const page1Image = page.locator('.page-cell[data-page-index="0"] .page-content-img');
  await expect(page1Image).toHaveAttribute('src', /^blob:/);
  const page1Src = await page1Image.getAttribute('src');

  const blankPageSrcs = [];
  for (let i = 1; i < 8; i++) {
    const blankImage = page.locator(`.page-cell[data-page-index="${i}"] .page-content-img`);
    await expect(blankImage).toHaveAttribute('src', /^blob:/);
    blankPageSrcs.push(await blankImage.getAttribute('src'));
  }

  expect(page1Src).toMatch(/^blob:/);

  const uniqueBlankSrcs = new Set(blankPageSrcs);
  expect(uniqueBlankSrcs.size).toBe(1);

  await page.setInputFiles('#pdf-upload', TEST_PDF_PATH);
  await expect(page.locator(".toast-success").filter({ hasText: 'Imported 1 of 1 pages from test-blank-page-repro.pdf' })).toBeVisible( { timeout: 20000 });
  await expect(page.locator('.zine-grid .page-content-img')).toHaveCount(8);
});
