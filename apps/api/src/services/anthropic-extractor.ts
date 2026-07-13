import Anthropic from '@anthropic-ai/sdk';
import { extractedPurchaseOrderSchema, type ExtractedPurchaseOrder } from '@po/shared';

type PurchaseOrderInput =
  | { kind: 'text'; text: string }
  | { kind: 'pdf'; data: string };

const EXTRACTION_TOOL = {
  name: 'submit_purchase_order',
  description: 'Submit the purchase order fields extracted from the source document.',
  input_schema: {
    type: 'object' as const,
    additionalProperties: false,
    properties: {
      poNumber: { type: ['string', 'null'] },
      supplierName: { type: ['string', 'null'] },
      buyerName: { type: ['string', 'null'] },
      orderDate: { type: ['string', 'null'], description: 'ISO YYYY-MM-DD when the date can be normalized.' },
      currency: { type: 'string', description: 'ISO 4217 three-letter code. Default to USD only when no currency is shown.' },
      items: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            sku: { type: 'string' },
            description: { type: 'string' },
            quantity: { type: 'number' },
            unitPrice: { type: ['number', 'null'] },
            lineTotal: { type: ['number', 'null'] }
          },
          required: ['sku', 'description', 'quantity', 'unitPrice', 'lineTotal']
        }
      },
      statedTotal: { type: ['number', 'null'] },
      extractionWarnings: { type: 'array', items: { type: 'string' } }
    },
    required: [
      'poNumber', 'supplierName', 'buyerName', 'orderDate', 'currency',
      'items', 'statedTotal', 'extractionWarnings'
    ]
  }
};

const SYSTEM_PROMPT = `You are a purchase-order intake specialist. Convert the supplied PO, email, or PDF into structured data.

Rules:
- Extract only values supported by the source; never invent SKUs, quantities, prices, totals, names, or dates.
- Preserve SKU punctuation and normalize letters to uppercase.
- A quantity must be the ordered number of units, not a pack size embedded in the description.
- unitPrice is the per-line-item unit price. lineTotal is the source's extended amount when present.
- Use null when a price, total, date, or party is absent or unreadable.
- Add a short extraction warning for ambiguity, illegible content, conflicting values, or assumptions.
- Do not validate against a catalog and do not decide whether to accept the order. Downstream code owns those decisions.
- Finish by calling submit_purchase_order exactly once. Do not answer in prose.`;

export class AnthropicExtractor {
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(apiKey = process.env.ANTHROPIC_API_KEY, model = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6') {
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured.');
    this.client = new Anthropic({ apiKey, timeout: 120_000, maxRetries: 2 });
    this.model = model;
  }

  async extract(input: PurchaseOrderInput): Promise<{ purchaseOrder: ExtractedPurchaseOrder; modelUsed: string }> {
    const sourceContent: Anthropic.MessageParam['content'] = input.kind === 'pdf'
      ? [
          {
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: input.data },
            title: 'Incoming purchase order'
          },
          { type: 'text', text: 'Extract this purchase order.' }
        ]
      : input.text;

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: sourceContent }],
      tools: [EXTRACTION_TOOL],
      tool_choice: { type: 'tool', name: EXTRACTION_TOOL.name }
    });

    const toolCall = response.content.find(block => block.type === 'tool_use' && block.name === EXTRACTION_TOOL.name);
    if (!toolCall || toolCall.type !== 'tool_use') {
      throw new Error('The model did not return structured purchase-order data.');
    }

    return {
      purchaseOrder: extractedPurchaseOrderSchema.parse(toolCall.input),
      modelUsed: response.model
    };
  }
}
