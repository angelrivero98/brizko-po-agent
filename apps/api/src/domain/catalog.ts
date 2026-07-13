export type CatalogItem = {
  sku: string;
  description: string;
  unitPrice: number;
  currency: 'USD';
};

export const supplier = {
  id: 'northstar-industrial',
  name: 'Northstar Industrial Supply',
  currency: 'USD' as const
};

export const catalog: readonly CatalogItem[] = [
  { sku: 'BOLT-M8-50', description: 'M8 × 50 mm hex bolts, box of 100', unitPrice: 18.5, currency: 'USD' },
  { sku: 'GLV-NIT-M', description: 'Nitrile work gloves, medium, box of 50', unitPrice: 12.75, currency: 'USD' },
  { sku: 'TAPE-PACK-48', description: '48 mm clear packing tape, 6-pack', unitPrice: 21.0, currency: 'USD' },
  { sku: 'PALLET-STD', description: 'Standard 48 × 40 in recycled pallet', unitPrice: 32.0, currency: 'USD' },
  { sku: 'WRAP-STRETCH', description: 'Industrial stretch wrap, 18 in × 1500 ft', unitPrice: 16.25, currency: 'USD' },
  { sku: 'LABEL-THERM-4X6', description: '4 × 6 in direct thermal labels, roll of 500', unitPrice: 14.4, currency: 'USD' }
];

export const catalogBySku = new Map(catalog.map(item => [item.sku, item]));
