import { test, expect } from '@playwright/test';
import { jsPDF } from 'jspdf';

test.describe('Blank Page Optimization', () => {
  test('should use the same blob URL for all blank pages (Flyweight pattern)', async ({ page }) => {
    // 1. Generate a valid 1-page PDF
    const doc = new jsPDF();
    doc.text('Hello World', 10, 10);
    const pdfBuffer = Buffer.from(doc.output('arraybuffer'));

    // 2. Go to the app
    await page.goto('/');

    // 3. Upload the PDF
    const fileInput = page.locator('#pdf-upload');
    await fileInput.setInputFiles({
      name: 'test-1page.pdf',
      mimeType: 'application/pdf',
      buffer: pdfBuffer
    });

    // 4. Wait for processing to complete
    await expect(page.locator('#upload-status')).toHaveText('Imported 1 of 1 pages from test-1page.pdf', { timeout: 10000 });

    // 5. Get the image sources for blank pages
    // The default layout is 8 pages. Since we uploaded 1 page, pages 2-8 should be blank.
    // Let's check page 2 and page 3.
    // The pages are in .page-content-img inside .page-cell
    // data-page-index is 0-based. So page 2 is index 1, page 3 is index 2.

    const page2Img = page.locator('.page-cell[data-page-index="1"] .page-content-img');
    const page3Img = page.locator('.page-cell[data-page-index="2"] .page-content-img');

    // Check that elements exist
    await expect(page2Img).toBeAttached();
    await expect(page3Img).toBeAttached();

    const src2 = await page2Img.getAttribute('src');
    const src3 = await page3Img.getAttribute('src');

    expect(src2).toBeTruthy();
    expect(src3).toBeTruthy();

    expect(src2).toBe(src3);
  });
});
