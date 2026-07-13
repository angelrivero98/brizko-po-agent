import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { supplierCatalogSchema, type SupplierCatalog } from '@po/shared';

export type CatalogSource =
  | { kind: 'text'; text: string }
  | { kind: 'pdf'; data: string }
  | { kind: 'image'; data: string; mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' };

const extractedCatalogSchema = supplierCatalogSchema.extend({
  warnings: z.array(z.string()).default([])
});

const CATALOG_TOOL = {
  name: 'submit_supplier_catalog',
  description: 'Submit the supplier and all catalog line items extracted from the source.',
  input_schema: {
    type: 'object' as const,
    additionalProperties: false,
    properties: {
      name: { type: 'string', description: 'Supplier or catalog name. Use "Imported catalog" only when no name is present.' },
      currency: { type: 'string', description: 'Three-letter ISO currency used by the catalog.' },
      items: {
        type: 'array',
        minItems: 1,
        maxItems: 500,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            sku: { type: 'string' },
            description: { type: 'string' },
            unitPrice: { type: 'number' },
            currency: { type: 'string' }
          },
          required: ['sku', 'description', 'unitPrice', 'currency']
        }
      },
      warnings: { type: 'array', items: { type: 'string' } }
    },
    required: ['name', 'currency', 'items', 'warnings']
  }
};

const SYSTEM_PROMPT = `You extract a supplier price catalog from a PDF, image, spreadsheet-like text, CSV, JSON, email, or pasted list.

Rules:
- Extract every actual purchasable line item visible in the source, up to 500 rows.
- Never invent an SKU, description, or price.
- Preserve SKU punctuation and normalize SKU letters to uppercase.
- unitPrice is the price for one listed purchasing unit. Do not confuse pack size, quantity breaks, MSRP, totals, taxes, or freight with unitPrice.
- Normalize currency to a three-letter ISO code. When a source uses one currency globally, apply it to each item.
- Ignore headings, subtotals, contact information, payment terms, and notes that are not catalog items.
- Add concise warnings for unreadable rows, ambiguous prices, multiple price tiers, or omitted rows.
- Do not compare this catalog with a purchase order and do not decide whether an order is valid.
- Finish by calling submit_supplier_catalog exactly once. Do not answer in prose.`;

export class AnthropicCatalogExtractor {
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(apiKey = process.env.ANTHROPIC_API_KEY, model = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6') {
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured.');
    this.client = new Anthropic({ apiKey, timeout: 120_000, maxRetries: 2 });
    this.model = model;
  }

  async extract(source: CatalogSource): Promise<{ catalog: SupplierCatalog; warnings: string[]; modelUsed: string }> {
    const content: Anthropic.MessageParam['content'] = source.kind === 'pdf'
      ? [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: source.data }, title: 'Supplier catalog' },
          { type: 'text', text: 'Extract this supplier catalog.' }
        ]
      : source.kind === 'image'
        ? [
            { type: 'image', source: { type: 'base64', media_type: source.mediaType, data: source.data } },
            { type: 'text', text: 'Extract this supplier catalog.' }
          ]
        : source.text;

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content }],
      tools: [CATALOG_TOOL],
      tool_choice: { type: 'tool', name: CATALOG_TOOL.name }
    });

    const toolCall = response.content.find(block => block.type === 'tool_use' && block.name === CATALOG_TOOL.name);
    if (!toolCall || toolCall.type !== 'tool_use') {
      throw new Error('The model did not return structured catalog data.');
    }

    const extracted = extractedCatalogSchema.parse(toolCall.input);
    return {
      catalog: { name: extracted.name, currency: extracted.currency, items: extracted.items },
      warnings: extracted.warnings,
      modelUsed: response.model
    };
  }
}
