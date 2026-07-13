import { z } from 'zod';

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
    catalog: z.number()
  }),
  confirmation: z.string(),
  modelUsed: z.string()
});

export type ExtractedPurchaseOrder = z.infer<typeof extractedPurchaseOrderSchema>;
export type AnalysisResponse = z.infer<typeof analysisResponseSchema>;
export type Discrepancy = z.infer<typeof discrepancySchema>;
