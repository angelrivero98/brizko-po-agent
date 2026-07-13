import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type ErrorRequestHandler } from 'express';
import cors from 'cors';
import multer from 'multer';
import { ZodError } from 'zod';
import { supplierCatalogSchema } from '@po/shared';
import { catalog, supplier } from './domain/catalog.js';
import { verifyPurchaseOrder } from './domain/verify-purchase-order.js';
import { AnthropicCatalogExtractor, type CatalogSource } from './services/anthropic-catalog-extractor.js';
import { AnthropicExtractor } from './services/anthropic-extractor.js';
import { getCurrencyConversion } from './services/exchange-rate.service.js';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_BYTES } });

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, aiConfigured: Boolean(process.env.ANTHROPIC_API_KEY) });
  });

  app.get('/api/catalog', (_req, res) => {
    res.json({ supplier, items: catalog });
  });

  app.post('/api/catalog/extract', upload.single('file'), async (req, res, next) => {
    try {
      const file = req.file;
      if (!file) {
        res.status(400).json({ error: 'Attach a catalog file to extract.' });
        return;
      }

      const extension = path.extname(file.originalname).toLowerCase();
      let source: CatalogSource;
      if (file.mimetype === 'application/pdf' || extension === '.pdf') {
        source = { kind: 'pdf', data: file.buffer.toString('base64') };
      } else if (['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.mimetype)) {
        source = {
          kind: 'image',
          data: file.buffer.toString('base64'),
          mediaType: file.mimetype as Extract<CatalogSource, { kind: 'image' }>['mediaType']
        };
      } else if (
        ['text/plain', 'text/csv', 'application/json'].includes(file.mimetype)
        || ['.txt', '.csv', '.json'].includes(extension)
      ) {
        source = { kind: 'text', text: file.buffer.toString('utf8') };
      } else {
        res.status(415).json({ error: 'AI catalog extraction supports PDF, PNG, JPG, WEBP, GIF, TXT, CSV, and JSON.' });
        return;
      }

      const extractor = new AnthropicCatalogExtractor();
      res.json(await extractor.extract(source));
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/analyze', upload.single('file'), async (req, res, next) => {
    try {
      const pastedText = typeof req.body.text === 'string' ? req.body.text.trim() : '';
      const file = req.file;

      let customCatalog = null;
      if (typeof req.body.catalog === 'string' && req.body.catalog.trim()) {
        try {
          const parsedCatalog = supplierCatalogSchema.safeParse(JSON.parse(req.body.catalog));
          if (!parsedCatalog.success) {
            res.status(400).json({ error: 'The custom catalog is invalid.' });
            return;
          }
          customCatalog = parsedCatalog.data;
        } catch {
          res.status(400).json({ error: 'The custom catalog must be valid JSON.' });
          return;
        }
      }

      if (!pastedText && !file) {
        res.status(400).json({ error: 'Paste purchase-order text or attach a PDF, TXT, or EML file.' });
        return;
      }

      let source: { kind: 'text'; text: string } | { kind: 'pdf'; data: string };
      if (file) {
        const isPdf = file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf');
        const isText = ['text/plain', 'message/rfc822'].includes(file.mimetype)
          || /\.(txt|eml)$/i.test(file.originalname);
        if (!isPdf && !isText) {
          res.status(415).json({ error: 'Unsupported file. Use PDF, TXT, or EML.' });
          return;
        }
        source = isPdf
          ? { kind: 'pdf', data: file.buffer.toString('base64') }
          : { kind: 'text', text: file.buffer.toString('utf8') };
      } else {
        source = { kind: 'text', text: pastedText };
      }

      const extractor = new AnthropicExtractor();
      const { purchaseOrder, modelUsed } = await extractor.extract(source);
      const activeCatalog = customCatalog?.items ?? catalog;
      const catalogCurrency = customCatalog?.currency ?? supplier.currency;
      const conversion = await getCurrencyConversion(purchaseOrder.currency, catalogCurrency, purchaseOrder.orderDate);
      res.json(verifyPurchaseOrder(purchaseOrder, modelUsed, activeCatalog, conversion));
    } catch (error) {
      next(error);
    }
  });

  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const webDist = path.resolve(currentDir, '../../web/dist');
  app.use(express.static(webDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) {
      res.status(404).json({ error: 'Not found.' });
      return;
    }
    res.sendFile(path.join(webDist, 'index.html'), error => error ? next(error) : undefined);
  });

  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    console.error(error);
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ error: 'The file exceeds the 10 MB limit.' });
      return;
    }
    if (error instanceof ZodError) {
      res.status(502).json({ error: 'The AI response could not be validated. Please try again.' });
      return;
    }
    const message = error instanceof Error ? error.message : 'Unexpected error.';
    const status = message.includes('ANTHROPIC_API_KEY') ? 503 : message.startsWith('Currency conversion') ? 422 : 500;
    res.status(status).json({ error: status === 503 ? 'AI analysis is not configured on this deployment.' : message });
  };
  app.use(errorHandler);

  return app;
}
