import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import type { ResponseInputContent } from 'openai/resources/responses/responses';
import { z } from 'zod';
import { supplierCatalogSchema, type SupplierCatalog } from '@po/shared';

export type CatalogSource =
  | { kind: 'text'; text: string }
  | { kind: 'pdf'; data: string }
  | { kind: 'image'; data: string; mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' };

const aiCatalogSchema = z.object({
  name: z.string(),
  currency: z.string().length(3),
  items: z.array(z.object({
    sku: z.string(),
    description: z.string(),
    unitPrice: z.number().nonnegative(),
    currency: z.string().length(3)
  })).min(1).max(500),
  warnings: z.array(z.string())
});

const SYSTEM_PROMPT = `You extract a supplier price catalog from a PDF, image, spreadsheet-like text, CSV, JSON, email, or pasted list.

Rules:
- Extract every actual purchasable line item visible in the source, up to 500 rows.
- Never invent an SKU, description, or price.
- Preserve SKU punctuation and normalize SKU letters to uppercase.
- unitPrice is the price for one listed purchasing unit. Do not confuse pack size, quantity breaks, MSRP, totals, taxes, or freight with unitPrice.
- Normalize currency to a three-letter ISO code. When a source uses one currency globally, apply it to each item.
- Ignore headings, subtotals, contact information, payment terms, and notes that are not catalog items.
- Add concise warnings for unreadable rows, ambiguous prices, multiple price tiers, or omitted rows.
- Use "Imported catalog" as the name only when no supplier or catalog name is present.
- Do not compare this catalog with a purchase order and do not decide whether an order is valid.`;

export class OpenAICatalogExtractor {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(apiKey = process.env.OPENAI_API_KEY, model = process.env.OPENAI_MODEL ?? 'gpt-5.4-mini') {
    if (!apiKey) throw new Error('OPENAI_API_KEY is not configured.');
    this.client = new OpenAI({ apiKey, timeout: 120_000, maxRetries: 2 });
    this.model = model;
  }

  async extract(source: CatalogSource): Promise<{ catalog: SupplierCatalog; warnings: string[]; modelUsed: string }> {
    const content: ResponseInputContent[] = source.kind === 'pdf'
      ? [
          { type: 'input_file', filename: 'supplier-catalog.pdf', file_data: source.data, detail: 'high' },
          { type: 'input_text', text: 'Extract this supplier catalog.' }
        ]
      : source.kind === 'image'
        ? [
            { type: 'input_image', image_url: `data:${source.mediaType};base64,${source.data}`, detail: 'high' },
            { type: 'input_text', text: 'Extract this supplier catalog.' }
          ]
        : [{ type: 'input_text', text: source.text }];

    const response = await this.client.responses.parse({
      model: this.model,
      instructions: SYSTEM_PROMPT,
      input: [{ role: 'user', content }],
      text: { format: zodTextFormat(aiCatalogSchema, 'supplier_catalog') },
      max_output_tokens: 8192,
      store: false
    });

    if (!response.output_parsed) {
      throw new Error('OpenAI did not return structured catalog data.');
    }

    const normalized = {
      name: response.output_parsed.name,
      currency: response.output_parsed.currency.toUpperCase(),
      items: response.output_parsed.items.map(item => ({
        ...item,
        sku: item.sku.toUpperCase(),
        currency: item.currency.toUpperCase()
      }))
    };
    return {
      catalog: supplierCatalogSchema.parse(normalized),
      warnings: response.output_parsed.warnings,
      modelUsed: response.model
    };
  }
}
