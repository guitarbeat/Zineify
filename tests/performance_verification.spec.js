import { test, expect } from '@playwright/test';
import { jsPDF } from 'jspdf';
import fs from 'fs';

const pdfPath = 'test-1-page.pdf';

test.beforeAll(async () => {
  const doc = new jsPDF();
  doc.setFontSize(40);
  doc.text('Page 1', 10, 50);
  const output = doc.output('arraybuffer');
  fs.writeFileSync(pdfPath, Buffer.from(output));
});

test.afterAll(async () => {
  if (fs.existsSync(pdfPath)) {
    fs.unlinkSync(pdfPath);
  }
});

test('Verify basic PDF processing and page visibility', async ({ page }) => {
  // Start the app
  await page.goto('/');

  // Wait for the app to be ready
  await expect(page.locator('#pdf-upload')).toBeAttached();

  // Upload the 1-page PDF
  const fileInput = page.locator('#pdf-upload');
  await fileInput.setInputFiles(pdfPath);

  // Wait for processing to complete
  await expect(page.locator(".toast-success").filter({ hasText: 'Imported 1 of 1 pages from test-1-page.pdf' })).toBeVisible( { timeout: 15000 });

  // Check that page 1 is attached
  const page1Img = page.locator('.page-cell[data-page-index="0"] .page-content-img');
  await expect(page1Img).toHaveAttribute('src', /^blob:/);

  // Verify it has a blob URL
  const src = await page1Img.getAttribute('src');
  expect(src).toBeTruthy();
  expect(src).toMatch(/^blob:/);
});
