import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import type { ResponseInputContent } from 'openai/resources/responses/responses';
import { z } from 'zod';
import { extractedPurchaseOrderSchema, type ExtractedPurchaseOrder } from '@po/shared';

type PurchaseOrderInput =
  | { kind: 'text'; text: string }
  | { kind: 'pdf'; data: string };

const aiPurchaseOrderSchema = z.object({
  poNumber: z.string().nullable(),
  supplierName: z.string().nullable(),
  buyerName: z.string().nullable(),
  orderDate: z.string().nullable(),
  currency: z.string().length(3),
  items: z.array(z.object({
    sku: z.string(),
    description: z.string(),
    quantity: z.number(),
    unitPrice: z.number().nullable(),
    lineTotal: z.number().nullable()
  })).min(1),
  statedTotal: z.number().nullable(),
  extractionWarnings: z.array(z.string())
});

const SYSTEM_PROMPT = `You are a purchase-order intake specialist. Convert the supplied PO, email, CSV, or PDF into structured data.

Rules:
- Extract only values supported by the source; never invent SKUs, quantities, prices, totals, names, or dates.
- Preserve SKU punctuation and normalize letters to uppercase.
- A quantity must be the ordered number of units, not a pack size embedded in the description.
- unitPrice is the per-line-item unit price. lineTotal is the source's extended amount when present.
- Use null when a price, total, date, or party is absent or unreadable.
- Normalize dates to ISO YYYY-MM-DD when possible.
- Normalize currency to a three-letter ISO 4217 code. Default to USD only when no currency is shown.
- Add a short extraction warning for ambiguity, illegible content, conflicting values, or assumptions.
- Do not validate against a catalog and do not decide whether to accept the order. Downstream code owns those decisions.`;

export class OpenAIExtractor {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(apiKey = process.env.OPENAI_API_KEY, model = process.env.OPENAI_MODEL ?? 'gpt-5.4-mini') {
    if (!apiKey) throw new Error('OPENAI_API_KEY is not configured.');
    this.client = new OpenAI({ apiKey, timeout: 120_000, maxRetries: 2 });
    this.model = model;
  }

  async extract(input: PurchaseOrderInput): Promise<{ purchaseOrder: ExtractedPurchaseOrder; modelUsed: string }> {
    const content: ResponseInputContent[] = input.kind === 'pdf'
      ? [
          { type: 'input_file', filename: 'incoming-purchase-order.pdf', file_data: input.data, detail: 'high' },
          { type: 'input_text', text: 'Extract this purchase order.' }
        ]
      : [{ type: 'input_text', text: input.text }];

    const response = await this.client.responses.parse({
      model: this.model,
      instructions: SYSTEM_PROMPT,
      input: [{ role: 'user', content }],
      text: { format: zodTextFormat(aiPurchaseOrderSchema, 'purchase_order') },
      max_output_tokens: 4096,
      store: false
    });

    if (!response.output_parsed) {
      throw new Error('OpenAI did not return structured purchase-order data.');
    }

    const normalized = {
      ...response.output_parsed,
      currency: response.output_parsed.currency.toUpperCase(),
      items: response.output_parsed.items.map(item => ({ ...item, sku: item.sku.toUpperCase() }))
    };
    return {
      purchaseOrder: extractedPurchaseOrderSchema.parse(normalized),
      modelUsed: response.model
    };
  }
}
