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
    assert.deepEqual(result.totals, { stated: 99.5, submitted: 99.5, catalog: 99.5 });
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
});
