# PO Guard

PO Guard is a small, deployable purchase-order intake workflow for logistics teams. It accepts pasted PO/email text or a PDF/TXT/EML upload, uses Claude to extract structured line items, verifies them against a supplier catalog, flags discrepancies, and produces a clean confirmation draft.

The core design rule is **LLM extracts; code decides**. Claude handles messy, semi-structured documents. Prices, totals, acceptance status, and discrepancy rules are deterministic TypeScript.

## What it does

- Accepts pasted text, email content, PDF, CSV, TXT, or EML files (up to 10 MB).
- Lets a reviewer import a CSV/JSON supplier catalog directly, or use Claude to extract an irregular catalog from PDF, image, text, CSV, or JSON.
- Keeps extracted catalog rows editable before they are used for comparison.
- Extracts PO metadata and line items with Anthropic tool use and a forced JSON schema.
- Validates the model response with Zod before using it.
- Checks SKU, quantity, unit price, line totals, and stated PO total against a small supplier catalog.
- Supports orders in a different currency from the catalog and converts order prices before comparison.
- Shows a review-ready result and generates a copyable confirmation.
- Does not store uploaded documents or place orders automatically.

## Architecture

```text
apps/web (React + Vite)
        │ multipart/form-data
        ▼
apps/api (Express)
        ├── Anthropic extractor ──► structured PO validated with Zod
        ├── deterministic verifier ──► supplier catalog + discrepancy rules
        └── serves the built frontend in production

packages/shared
        └── request/result schemas and shared TypeScript types
```

This is an npm-workspaces monorepo. Render builds one Docker image and runs one web service, so the demo has a single URL and no cross-service CORS/configuration burden.

## Run locally

Requirements: Node.js 22+ and an Anthropic API key.

```bash
cp .env.example .env
# Add ANTHROPIC_API_KEY to .env
npm install
npm run dev
```

Open `http://localhost:5173`. Vite proxies `/api` requests to the Express server on port 3000.

Useful commands:

```bash
npm run typecheck
npm test
npm run build
npm start       # serves API + built frontend after npm run build
```

## Supplier price list

The demo catalog is intentionally small and lives in `apps/api/src/domain/catalog.ts`:

| SKU | Item | Unit price |
| --- | --- | ---: |
| `BOLT-M8-50` | M8 × 50 mm hex bolts, box of 100 | $18.50 |
| `GLV-NIT-M` | Nitrile work gloves, medium, box of 50 | $12.75 |
| `TAPE-PACK-48` | 48 mm clear packing tape, 6-pack | $21.00 |
| `PALLET-STD` | Standard 48 × 40 in recycled pallet | $32.00 |
| `WRAP-STRETCH` | Industrial stretch wrap, 18 in × 1500 ft | $16.25 |
| `LABEL-THERM-4X6` | 4 × 6 in direct thermal labels, roll of 500 | $14.40 |

## API

- `GET /api/health` — service and AI configuration status.
- `GET /api/catalog` — demo supplier and price list.
- `POST /api/catalog/extract` — AI extraction of a supplier catalog file (PDF, image, TXT, CSV, or JSON).
- `POST /api/analyze` — multipart body with either `text` or `file`; it optionally accepts a `catalog` JSON field containing the supplier name, currency, and items to use for that comparison.

The analysis result contains the extracted PO, verified lines, discrepancies, totals, status, model used, and confirmation draft.

When the order currency differs from the catalog currency, the API retrieves a daily reference rate from [Frankfurter](https://frankfurter.dev/), using the PO date when one was extracted and the latest rate otherwise. It converts PO prices into the catalog currency and returns the rate, date, original amounts, and converted amounts in the analysis result. Rates are cached for one hour. Frankfurter requires no API key.

## Deploy to Render

1. Push this repository to GitHub.
2. In Render, create a **Blueprint** and select the repository. Render reads `render.yaml` and the root `Dockerfile`.
3. Set the secret `ANTHROPIC_API_KEY` when prompted.
4. Deploy. The health check is `/api/health`.

`ANTHROPIC_MODEL` defaults to `claude-sonnet-4-6` and can be changed in Render without a code change.

## Key decisions and tradeoffs

- **Tool use instead of free-form JSON.** The model is forced to call one extraction tool whose input has a JSON schema. Zod then validates the result. This costs a little prompt/schema space but substantially reduces malformed responses.
- **Claude receives PDFs directly.** This preserves tables and layout without adding OCR/PDF parsing infrastructure. The tradeoff is provider coupling for PDF intake.
- **Catalog extraction is review-first.** Claude can turn an irregular price list or image into editable rows, but the user must save that catalog before it becomes the deterministic comparison source.
- **Deterministic verification.** The model never sees the approved catalog and cannot approve an order. Business rules are testable, explainable, and safe to change independently.
- **Currency conversion before comparison.** PO amounts remain in their source currency for auditability. A daily reference rate creates separate catalog-currency values; only those converted values are compared with catalog prices. Reference rates are suitable for this prototype, not settlement or accounting.
- **No database.** The weekend scope is intake and verification, not order lifecycle management. Results are intentionally ephemeral; production would store an audit record and document hash.
- **Browser-local custom catalog.** Imported price lists are kept in `localStorage` for convenience and sent with each analysis. This avoids server-side persistence in the prototype, but production would use authenticated, versioned supplier contracts.
- **One deployable service.** The monorepo still separates UI, API, and contracts, while a single container keeps deployment and demo reliability simple.
- **Human in the loop.** PO Guard drafts a result but does not transmit a supplier confirmation or create an ERP order. Those are natural next actions after authentication, roles, and audit history exist.

## Production next steps

- Persist a document hash, extraction, reviewer decision, and price-list version for auditability.
- Move supplier catalogs to a database or ERP connector with effective dates and contract pricing.
- Add authentication, tenant isolation, virus scanning, and retention controls.
- Add a reviewer correction loop and extraction-quality metrics.
- Support taxes, freight, discounts, units of measure, and multi-currency tolerances.

## Demo flow

For a short demo, open **PO with issues** from the example buttons and analyze it. It demonstrates three useful failure modes: a price mismatch, an unknown SKU, and a stated-total mismatch. Then run **Clean PO** to show the confirmation path.
