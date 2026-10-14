import { test, expect } from '@playwright/test';
import { jsPDF } from 'jspdf';

function createPdfBuffer(pageCount = 9) {
  const doc = new jsPDF();

  for (let index = 1; index <= pageCount; index++) {
    if (index > 1) {
      doc.addPage();
    }

    doc.setFontSize(32);
    doc.text(`Page ${index}`, 20, 40);
  }

  return Buffer.from(doc.output('arraybuffer'));
}

test('page picker opens without import overlays covering it', async ({ page }) => {
  await page.goto('/');

  await page.locator('#pdf-upload').setInputFiles({
    name: 'picker-test.pdf',
    mimeType: 'application/pdf',
    buffer: createPdfBuffer()
  });

  await expect(page.locator('#page-picker-modal')).toBeVisible({ timeout: 30000 });
  await expect(page.locator('#page-picker-subtitle')).toContainText('Pick up to 8');
  await expect(page.locator('#progress-container')).toBeHidden();
  await expect(page.locator('#toast-container .toast-success')).toHaveCount(0);
  await expect(page.locator('#toast-container')).not.toContainText('Importing PDF');
  await expect(page.locator('#toast-container')).not.toContainText('Choose Pages To Import');
});
