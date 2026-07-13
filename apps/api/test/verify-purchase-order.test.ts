import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ExtractedPurchaseOrder } from '@po/shared';
import { verifyPurchaseOrder } from '../src/domain/verify-purchase-order.js';

const baseOrder: ExtractedPurchaseOrder = {
  poNumber: 'PO-1042',
  supplierName: 'Northstar Industrial Supply',
  buyerName: 'Acme Distribution',
  orderDate: '2026-07-12',
  currency: 'USD',
  items: [
    { sku: 'BOLT-M8-50', description: 'Bolts', quantity: 4, unitPrice: 18.5, lineTotal: 74 },
    { sku: 'GLV-NIT-M', description: 'Gloves', quantity: 2, unitPrice: 12.75, lineTotal: 25.5 }
  ],
  statedTotal: 99.5,
  extractionWarnings: []
};

describe('verifyPurchaseOrder', () => {
  it('confirms an order that matches the catalog', () => {
    const result = verifyPurchaseOrder(baseOrder, 'test-model');
    assert.equal(result.status, 'confirmed');
    assert.equal(result.discrepancies.length, 0);
    assert.deepEqual(result.totals, {
      stated: 99.5,
      submitted: 99.5,
      submittedInCatalogCurrency: 99.5,
      catalog: 99.5
    });
  });

  it('flags price, unknown SKU, and total discrepancies', () => {
    const result = verifyPurchaseOrder({
      ...baseOrder,
      items: [
        { ...baseOrder.items[0]!, unitPrice: 21, lineTotal: 84 },
        { sku: 'NOT-REAL', description: 'Mystery item', quantity: 1, unitPrice: 5, lineTotal: 5 }
      ],
      statedTotal: 100
    }, 'test-model');

    assert.equal(result.status, 'review_required');
    assert.deepEqual(result.discrepancies.map(issue => issue.code), [
      'PRICE_MISMATCH', 'UNKNOWN_SKU', 'TOTAL_MISMATCH'
    ]);
  });

  it('rejects non-positive or fractional quantities', () => {
    const result = verifyPurchaseOrder({
      ...baseOrder,
      items: [{ ...baseOrder.items[0]!, quantity: 1.5 }]
    }, 'test-model');
    assert.equal(result.discrepancies[0]?.code, 'INVALID_QUANTITY');
  });

  it('uses a caller-provided catalog for comparison', () => {
    const result = verifyPurchaseOrder(baseOrder, 'test-model', [
      { sku: 'BOLT-M8-50', description: 'Contract bolts', unitPrice: 20, currency: 'USD' },
      { sku: 'GLV-NIT-M', description: 'Contract gloves', unitPrice: 12.75, currency: 'USD' }
    ]);

    assert.equal(result.status, 'review_required');
    assert.equal(result.discrepancies[0]?.code, 'PRICE_MISMATCH');
    assert.equal(result.discrepancies[0]?.expected, 20);
  });

  it('converts order prices into the catalog currency before comparing', () => {
    const result = verifyPurchaseOrder({
      ...baseOrder,
      currency: 'EUR',
      items: [{ sku: 'BOLT-M8-50', description: 'Bolts', quantity: 4, unitPrice: 9.25, lineTotal: 37 }],
      statedTotal: 37
    }, 'test-model', [
      { sku: 'BOLT-M8-50', description: 'Contract bolts', unitPrice: 18.5, currency: 'USD' }
    ], {
      from: 'EUR', to: 'USD', rate: 2, date: '2026-07-12', source: 'frankfurter'
    });

    assert.equal(result.status, 'confirmed');
    assert.equal(result.lines[0]?.convertedUnitPrice, 18.5);
    assert.equal(result.totals.submitted, 37);
    assert.equal(result.totals.submittedInCatalogCurrency, 74);
    assert.equal(result.conversion.from, 'EUR');
    assert.equal(result.conversion.to, 'USD');
  });
});
