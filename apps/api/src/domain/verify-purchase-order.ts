import { randomUUID } from 'node:crypto';
import {
  analysisResponseSchema,
  type AnalysisResponse,
  type CatalogItem,
  type Discrepancy,
  type ExtractedPurchaseOrder
} from '@po/shared';
import { catalog } from './catalog.js';
import type { CurrencyConversion } from '../services/exchange-rate.service.js';

const MONEY_TOLERANCE = 0.01;

const money = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

export function verifyPurchaseOrder(
  extracted: ExtractedPurchaseOrder,
  modelUsed: string,
  priceList: readonly CatalogItem[] = catalog,
  conversion: CurrencyConversion = {
    from: extracted.currency,
    to: priceList[0]?.currency ?? extracted.currency,
    rate: 1,
    date: null,
    source: 'identity'
  }
): AnalysisResponse {
  const discrepancies: Discrepancy[] = [];
  const catalogBySku = new Map(priceList.map(item => [item.sku.trim().toUpperCase(), item]));
  const catalogCurrency = conversion.to;

  const lines = extracted.items.map(item => {
    const sku = item.sku.trim().toUpperCase();
    const catalogItem = catalogBySku.get(sku);

    if (!catalogItem) {
      discrepancies.push({
        code: 'UNKNOWN_SKU',
        severity: 'error',
        sku,
        message: `${sku} is not in the approved supplier catalog.`
      });
    }

    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      discrepancies.push({
        code: 'INVALID_QUANTITY',
        severity: 'error',
        sku,
        received: item.quantity,
        message: `${sku} has an invalid quantity (${item.quantity}).`
      });
    }

    const convertedUnitPrice = item.unitPrice === null ? null : money(item.unitPrice * conversion.rate);

    if (item.unitPrice === null) {
      discrepancies.push({
        code: 'MISSING_PRICE',
        severity: 'error',
        sku,
        expected: catalogItem?.unitPrice,
        message: `${sku} has no unit price in the purchase order.`
      });
    } else if (catalogItem && convertedUnitPrice !== null && Math.abs(convertedUnitPrice - catalogItem.unitPrice) > MONEY_TOLERANCE) {
      discrepancies.push({
        code: 'PRICE_MISMATCH',
        severity: 'error',
        sku,
        expected: catalogItem.unitPrice,
        received: convertedUnitPrice,
        message: conversion.rate === 1
          ? `${sku} is priced at ${item.unitPrice.toFixed(2)} ${catalogCurrency}; the catalog price is ${catalogItem.unitPrice.toFixed(2)} ${catalogCurrency}.`
          : `${sku} is priced at ${item.unitPrice.toFixed(2)} ${conversion.from} (${convertedUnitPrice.toFixed(2)} ${catalogCurrency} after conversion); the catalog price is ${catalogItem.unitPrice.toFixed(2)} ${catalogCurrency}.`
      });
    }

    const expectedLineTotal = catalogItem && item.quantity > 0
      ? money(catalogItem.unitPrice * item.quantity)
      : null;

    const hasLineIssue = discrepancies.some(issue => issue.sku === sku);
    return {
      ...item,
      sku,
      catalogDescription: catalogItem?.description ?? null,
      catalogUnitPrice: catalogItem?.unitPrice ?? null,
      convertedUnitPrice,
      expectedLineTotal,
      status: hasLineIssue ? 'review' as const : 'matched' as const
    };
  });

  const submittedTotal = money(lines.reduce((sum, line) => {
    if (line.lineTotal !== null) return sum + line.lineTotal;
    if (line.unitPrice !== null) return sum + line.unitPrice * line.quantity;
    return sum;
  }, 0));
  const catalogTotal = money(lines.reduce((sum, line) => sum + (line.expectedLineTotal ?? 0), 0));
  const submittedInCatalogCurrency = money(submittedTotal * conversion.rate);

  if (extracted.statedTotal !== null && Math.abs(extracted.statedTotal - submittedTotal) > MONEY_TOLERANCE) {
    discrepancies.push({
      code: 'TOTAL_MISMATCH',
      severity: 'warning',
      expected: submittedTotal,
      received: extracted.statedTotal,
      message: `The stated PO total is $${extracted.statedTotal.toFixed(2)}, but its line items add up to $${submittedTotal.toFixed(2)}.`
    });
  }

  const status = discrepancies.length === 0 ? 'confirmed' as const : 'review_required' as const;
  const poLabel = extracted.poNumber ?? 'Unnumbered PO';
  const supplierLabel = extracted.supplierName ?? 'the supplier';
  const confirmation = status === 'confirmed'
    ? `${poLabel} from ${supplierLabel} is confirmed. ${lines.length} line item${lines.length === 1 ? '' : 's'} verified against the catalog for ${catalogTotal.toFixed(2)} ${catalogCurrency}.`
    : `${poLabel} from ${supplierLabel} requires review. ${discrepancies.length} discrepanc${discrepancies.length === 1 ? 'y was' : 'ies were'} found before confirmation.`;

  return analysisResponseSchema.parse({
    id: randomUUID(),
    status,
    extracted,
    lines,
    discrepancies,
    totals: { stated: extracted.statedTotal, submitted: submittedTotal, submittedInCatalogCurrency, catalog: catalogTotal },
    conversion,
    confirmation,
    modelUsed
  });
}
