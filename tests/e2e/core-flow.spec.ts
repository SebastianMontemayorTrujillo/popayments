import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

test.skip(!process.env.E2E_EMAIL || !process.env.E2E_PASSWORD, 'Configura E2E_EMAIL y E2E_PASSWORD');

test('carga PO y factura, identifica discrepancia y registra revisión humana', async ({ page }) => {
  const suffix = randomUUID().slice(0, 8);
  const number = `PO-E2E-${suffix}`;
  await page.goto('/login');
  await page.getByLabel('Correo').fill(process.env.E2E_EMAIL!);
  await page.getByLabel('Contraseña').fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Casos de compra' })).toBeVisible();
  await page.getByLabel('Nombre de la compra').fill(`Prueba ${suffix}`);
  await page.getByRole('button', { name: 'Crear caso' }).click();
  await expect(page.getByRole('heading', { name: `Prueba ${suffix}` })).toBeVisible();
  const base = { schemaVersion: '1', supplierId: 'acteck', supplierName: 'Acteck', issuedAt: '2026-10-09',
    total: { currency: 'MXN', minorUnits: '5000' } };
  const po = { ...base, kind: 'PO', documentNumber: number, poReference: number,
    items: [{ sku: 'SKU-DEMO', description: 'Equipo', quantity: 1, unitPriceMinorUnits: '5000' }] };
  const invoice = { ...base, kind: 'INVOICE', documentNumber: `F-${suffix}`, poReference: 'PO-EQUIVOCADA', items: [] };
  await page.getByLabel('Archivo JSON o XML').first().setInputFiles({ name: 'po.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(po)) });
  await page.getByRole('button', { name: 'Cargar PO' }).click();
  await expect(page.getByText('Versión 1 · Documento cargado').first()).toBeVisible();
  await page.getByLabel('Archivo JSON o XML').setInputFiles({ name: 'factura.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(invoice)) });
  await page.getByRole('button', { name: 'Cargar factura' }).click();
  await page.getByRole('button', { name: 'Conciliar' }).click();
  await expect(page.getByText('La PO y la factura no coinciden.')).toBeVisible();
  await expect(page.getByRole('row', { name: /Referencia de PO/ })).toContainText('PO-EQUIVOCADA');
  await page.getByRole('button', { name: 'Marcar factura como revisada' }).click();
  await expect(page.getByText(/Factura revisada y registrada/)).toBeVisible();
});
