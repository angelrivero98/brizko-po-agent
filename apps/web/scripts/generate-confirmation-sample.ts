import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { AnalysisResponse } from '@po/shared';
import { createConfirmationPdf } from '../src/confirmation-pdf.ts';

const items = [
  { sku: 'BOLT-M8-50', description: 'M8 x 50 mm hex bolts, box of 100', quantity: 4, unitPrice: 18.5, lineTotal: 74 },
  { sku: 'GLV-NIT-M', description: 'Nitrile work gloves, medium, box of 50', quantity: 2, unitPrice: 12.75, lineTotal: 25.5 },
  { sku: 'WRAP-STRETCH', description: 'Industrial stretch wrap, 18 in x 1500 ft', quantity: 3, unitPrice: 16.25, lineTotal: 48.75 }
];

const result: AnalysisResponse = {
  id: '6b862af0-d285-4e9d-b104-f2fd978acdf1',
  status: 'confirmed',
  extracted: {
    poNumber: 'PO-2001',
    supplierName: 'Northstar Industrial Supply',
    buyerName: 'Acme Distribution Center',
    orderDate: '2026-07-12',
    currency: 'USD',
    items,
    statedTotal: 148.25,
    extractionWarnings: []
  },
  lines: items.map(item => ({
    ...item,
    catalogDescription: item.description,
    catalogUnitPrice: item.unitPrice,
    convertedUnitPrice: item.unitPrice,
    expectedLineTotal: item.lineTotal,
    status: 'matched' as const
  })),
  discrepancies: [],
  totals: { stated: 148.25, submitted: 148.25, submittedInCatalogCurrency: 148.25, catalog: 148.25 },
  conversion: { from: 'USD', to: 'USD', rate: 1, date: '2026-07-12', source: 'identity' },
  confirmation: 'PO-2001 from Northstar Industrial Supply is confirmed. 3 line items verified against the catalog for 148.25 USD.',
  modelUsed: 'gpt-5.4-mini-2026-03-17'
};

const output = fileURLToPath(new URL('../../../output/pdf/po-2001-confirmed-po-guard.pdf', import.meta.url));
await mkdir(fileURLToPath(new URL('../../../output/pdf', import.meta.url)), { recursive: true });
const { bytes } = await createConfirmationPdf(result, {
  catalogName: 'Northstar Industrial Supply',
  issuedAt: new Date('2026-07-13T04:30:00.000Z')
});
await writeFile(output, bytes);
