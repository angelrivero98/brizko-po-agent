import path from 'node:path';
import { createHash, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import express, { type ErrorRequestHandler } from 'express';
import cors from 'cors';
import multer from 'multer';
import OpenAI from 'openai';
import { ZodError } from 'zod';
import { supplierCatalogSchema } from '@po/shared';
import { catalog, supplier } from './domain/catalog.js';
import { verifyPurchaseOrder } from './domain/verify-purchase-order.js';
import { OpenAICatalogExtractor, type CatalogSource } from './services/openai-catalog-extractor.js';
import { OpenAIExtractor } from './services/openai-extractor.js';
import { getCurrencyConversion } from './services/exchange-rate.service.js';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_BYTES } });
const DEMO_AUDIO_TOKEN_SHA256 = '601be757c8cf9333a2b4ef0911d8627c2fd8bfb12bdd268e9e76b90ebb27affc';
const DEMO_NARRATION = `Hola, soy Angel, y esta es PO Guard, una herramienta de recepción de órdenes de compra asistida por inteligencia artificial.

El objetivo es convertir documentos desordenados en confirmaciones verificables, manteniendo siempre a una persona en el circuito.

Primero, el usuario puede trabajar con el catálogo de demostración o cargar su propia lista de precios. El catálogo acepta CSV o JSON estructurado, y también PDFs, imágenes o texto que OpenAI convierte en filas editables. Nada se usa para comparar hasta que el usuario lo revisa.

Para la demostración voy a ejecutar un lote de tres órdenes. Cada archivo se analiza de forma independiente y en paralelo, por lo que un fallo no cancela el resto. El modelo extrae proveedor, número de orden, fecha, moneda y partidas. Después, reglas determinísticas en TypeScript comparan SKU, cantidad, precio y totales contra el catálogo.

La primera orden coincide completamente. El resultado muestra el total del documento, el total esperado y cada partida verificada. También asigna un identificador único al análisis y genera una confirmación lista para copiar.

La segunda orden requiere revisión. Aquí, PO Guard detecta un precio incorrecto para BOLT M ocho cincuenta, y un SKU que no existe en el catálogo. La inteligencia artificial no aprueba la orden: únicamente extrae. La decisión final proviene de reglas auditables y queda claramente marcada para revisión humana.

La tercera orden está en euros, mientras el catálogo está en dólares. El sistema obtiene un tipo de cambio de referencia, conserva los importes originales y compara los valores convertidos. En este caso, una diferencia de precio permanece marcada para revisión.

Finalmente, una orden confirmada puede descargarse como PDF con su badge, proveedor, comprador, partidas, totales, modelo utilizado y U U I D del análisis.

La solución está construida como monorepo TypeScript, con React, Express, Zod y la API de OpenAI, y está desplegada en Render. El principio central es simple: la inteligencia artificial extrae, las reglas verifican y las personas deciden.`;

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, aiConfigured: Boolean(process.env.OPENAI_API_KEY) });
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

      const extractor = new OpenAICatalogExtractor();
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
          res.status(400).json({ error: 'Paste purchase-order text or attach a PDF, CSV, TXT, or EML file.' });
        return;
      }

      let source: { kind: 'text'; text: string } | { kind: 'pdf'; data: string };
      if (file) {
        const isPdf = file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf');
        const isText = ['text/plain', 'text/csv', 'application/csv', 'message/rfc822'].includes(file.mimetype)
          || /\.(csv|txt|eml)$/i.test(file.originalname);
        if (!isPdf && !isText) {
          res.status(415).json({ error: 'Unsupported file. Use PDF, CSV, TXT, or EML.' });
          return;
        }
        source = isPdf
          ? { kind: 'pdf', data: file.buffer.toString('base64') }
          : { kind: 'text', text: file.buffer.toString('utf8') };
      } else {
        source = { kind: 'text', text: pastedText };
      }

      const extractor = new OpenAIExtractor();
      const { purchaseOrder, modelUsed } = await extractor.extract(source);
      const activeCatalog = customCatalog?.items ?? catalog;
      const catalogCurrency = customCatalog?.currency ?? supplier.currency;
      const conversion = await getCurrencyConversion(purchaseOrder.currency, catalogCurrency, purchaseOrder.orderDate);
      res.json(verifyPurchaseOrder(purchaseOrder, modelUsed, activeCatalog, conversion));
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/internal/demo-narration', async (req, res, next) => {
    try {
      const token = req.header('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
      const receivedHash = createHash('sha256').update(token).digest();
      const expectedHash = Buffer.from(DEMO_AUDIO_TOKEN_SHA256, 'hex');
      if (receivedHash.length !== expectedHash.length || !timingSafeEqual(receivedHash, expectedHash)) {
        res.status(404).json({ error: 'Not found.' });
        return;
      }

      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const speech = await client.audio.speech.create({
        model: 'tts-1-hd',
        voice: 'nova',
        input: DEMO_NARRATION,
        response_format: 'mp3',
        speed: 1.03
      });
      res.type('audio/mpeg').send(Buffer.from(await speech.arrayBuffer()));
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
    const status = message.includes('OPENAI_API_KEY') ? 503 : message.startsWith('Currency conversion') ? 422 : 500;
    res.status(status).json({ error: status === 503 ? 'AI analysis is not configured on this deployment.' : message });
  };
  app.use(errorHandler);

  return app;
}
