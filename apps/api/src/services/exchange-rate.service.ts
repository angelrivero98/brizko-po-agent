import { z } from 'zod';

export type CurrencyConversion = {
  from: string;
  to: string;
  rate: number;
  date: string | null;
  source: 'identity' | 'frankfurter';
};

const rateResponseSchema = z.object({
  date: z.string(),
  base: z.string(),
  quote: z.string(),
  rate: z.number().positive()
});

const cache = new Map<string, { conversion: CurrencyConversion; expiresAt: number }>();
const CACHE_MS = 60 * 60 * 1000;

export async function getCurrencyConversion(fromInput: string, toInput: string, orderDate?: string | null): Promise<CurrencyConversion> {
  const from = fromInput.trim().toUpperCase();
  const to = toInput.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to)) {
    throw new Error(`Currency conversion requires ISO codes; received ${from}/${to}.`);
  }
  if (from === to) return { from, to, rate: 1, date: null, source: 'identity' };

  const requestedDate = orderDate && /^\d{4}-\d{2}-\d{2}$/.test(orderDate) ? orderDate : null;
  const key = `${from}:${to}:${requestedDate ?? 'latest'}`;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.conversion;

  const url = new URL(`https://api.frankfurter.dev/v2/rate/${from}/${to}`);
  if (requestedDate) url.searchParams.set('date', requestedDate);
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(8_000)
    });
  } catch {
    throw new Error(`Currency conversion service is unavailable for ${from}/${to}.`);
  }
  if (!response.ok) {
    throw new Error(`Currency conversion is unavailable for ${from}/${to}.`);
  }

  const parsed = rateResponseSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error(`Currency conversion returned an invalid rate for ${from}/${to}.`);
  const conversion: CurrencyConversion = {
    from,
    to,
    rate: parsed.data.rate,
    date: parsed.data.date,
    source: 'frankfurter'
  };
  cache.set(key, { conversion, expiresAt: Date.now() + CACHE_MS });
  return conversion;
}
