import { z } from 'zod';

export const catalogItemSchema = z.object({
  sku: z.string().trim().min(1).max(100),
  description: z.string().trim().min(1).max(500),
  unitPrice: z.number().nonnegative(),
  currency: z.string().trim().length(3).transform(value => value.toUpperCase())
});

export const supplierCatalogSchema = z.object({
  name: z.string().trim().min(1).max(200),
  currency: z.string().trim().length(3).transform(value => value.toUpperCase()),
  items: z.array(catalogItemSchema).min(1).max(500)
});

export const purchaseOrderItemSchema = z.object({
  sku: z.string().min(1),
  description: z.string().default(''),
  quantity: z.number(),
  unitPrice: z.number().nullable(),
  lineTotal: z.number().nullable().default(null)
});

export const extractedPurchaseOrderSchema = z.object({
  poNumber: z.string().nullable(),
  supplierName: z.string().nullable(),
  buyerName: z.string().nullable(),
  orderDate: z.string().nullable(),
  currency: z.string().length(3).default('USD'),
  items: z.array(purchaseOrderItemSchema).min(1),
  statedTotal: z.number().nullable(),
  extractionWarnings: z.array(z.string()).default([])
});

export const discrepancySchema = z.object({
  code: z.enum(['UNKNOWN_SKU', 'PRICE_MISMATCH', 'INVALID_QUANTITY', 'MISSING_PRICE', 'TOTAL_MISMATCH']),
  severity: z.enum(['warning', 'error']),
  message: z.string(),
  sku: z.string().optional(),
  expected: z.number().optional(),
  received: z.number().optional()
});

export const verifiedLineSchema = purchaseOrderItemSchema.extend({
  catalogDescription: z.string().nullable(),
  catalogUnitPrice: z.number().nullable(),
  convertedUnitPrice: z.number().nullable(),
  expectedLineTotal: z.number().nullable(),
  status: z.enum(['matched', 'review'])
});

export const analysisResponseSchema = z.object({
  id: z.string(),
  status: z.enum(['confirmed', 'review_required']),
  extracted: extractedPurchaseOrderSchema,
  lines: z.array(verifiedLineSchema),
  discrepancies: z.array(discrepancySchema),
  totals: z.object({
    stated: z.number().nullable(),
    submitted: z.number(),
    submittedInCatalogCurrency: z.number(),
    catalog: z.number()
  }),
  conversion: z.object({
    from: z.string().length(3),
    to: z.string().length(3),
    rate: z.number().positive(),
    date: z.string().nullable(),
    source: z.enum(['identity', 'frankfurter'])
  }),
  confirmation: z.string(),
  modelUsed: z.string()
});

export type ExtractedPurchaseOrder = z.infer<typeof extractedPurchaseOrderSchema>;
export type AnalysisResponse = z.infer<typeof analysisResponseSchema>;
export type Discrepancy = z.infer<typeof discrepancySchema>;
export type CatalogItem = z.infer<typeof catalogItemSchema>;
export type SupplierCatalog = z.infer<typeof supplierCatalogSchema>;
