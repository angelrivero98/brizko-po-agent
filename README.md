# PO Guard

PO Guard is a small, deployable purchase-order intake workflow for logistics teams. It accepts pasted PO/email text or a PDF/CSV/TXT/EML upload, uses OpenAI to extract structured line items, verifies them against a supplier catalog, flags discrepancies, and produces a clean confirmation draft.

The core design rule is **LLM extracts; code decides**. OpenAI handles messy, semi-structured documents. Prices, totals, acceptance status, and discrepancy rules are deterministic TypeScript.

## What it does

- Accepts pasted text, email content, PDF, CSV, TXT, or EML files (up to 10 MB).
- Accepts multiple order files at once, analyzes them concurrently in isolated requests, and keeps each result independently reviewable.
- Lets a reviewer import a CSV/JSON supplier catalog directly, or use OpenAI to extract an irregular catalog from PDF, image, text, CSV, or JSON.
- Keeps extracted catalog rows editable before they are used for comparison.
- Extracts PO metadata and line items with the OpenAI Responses API and strict Structured Outputs.
- Validates the model response with Zod before using it.
- Checks SKU, quantity, unit price, line totals, and stated PO total against a small supplier catalog.
- Supports orders in a different currency from the catalog and converts order prices before comparison.
- Shows a review-ready result and generates a copyable confirmation.
- Generates a downloadable PDF verification record with the status badge, analysis reference, catalog, order metadata, line-item checks, totals, currency conversion, model, and confirmation text.
- Provides a responsive mobile workflow: touch-sized controls, safe-area support, stacked catalog editing, compact batch navigation, and card-based line-item verification without horizontal scrolling.
- Does not store uploaded documents or place orders automatically.

## Architecture

```text
apps/web (React + Vite)
        │ multipart/form-data
        ▼
apps/api (Express)
        ├── OpenAI extractor ──► structured PO validated with Zod
        ├── deterministic verifier ──► supplier catalog + discrepancy rules
        └── serves the built frontend in production

packages/shared
        └── request/result schemas and shared TypeScript types
```

This is an npm-workspaces monorepo. Render builds one Docker image and runs one web service, so the demo has a single URL and no cross-service CORS/configuration burden.

## Run locally

Requirements: Node.js 22+ and an OpenAI API key.

Create the key at <https://platform.openai.com/api-keys>. API billing is separate from a ChatGPT Plus/Pro subscription, so configure API billing at <https://platform.openai.com/settings/organization/billing/overview> if the project has no credits. Copy the secret when it is created; OpenAI does not show the full value again.

```bash
cp .env.example .env
# Add OPENAI_API_KEY to .env
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

The analysis result contains the extracted PO, verified lines, discrepancies, totals, status, model used, and confirmation draft. The browser submits one `/api/analyze` request per file concurrently and uses `Promise.allSettled`, so a failed document does not discard successful results from the same batch.

When the order currency differs from the catalog currency, the API retrieves a daily reference rate from [Frankfurter](https://frankfurter.dev/), using the PO date when one was extracted and the latest rate otherwise. It converts PO prices into the catalog currency and returns the rate, date, original amounts, and converted amounts in the analysis result. Rates are cached for one hour. Frankfurter requires no API key.

## Deploy to Render

1. Push this repository to GitHub.
2. In Render, create a **Blueprint** and select the repository. Render reads `render.yaml` and the root `Dockerfile`.
3. Set the secret `OPENAI_API_KEY` when prompted.
4. Deploy. The health check is `/api/health`.

`OPENAI_MODEL` defaults to `gpt-5.4-mini` and can be changed in Render without a code change.

## Key decisions and tradeoffs

- **Structured Outputs instead of free-form JSON.** The Responses API is given a strict schema generated from Zod and the parsed output is validated again before use. This costs a little schema space but substantially reduces malformed responses.
- **OpenAI receives PDFs and images directly.** This preserves tables and layout without adding OCR/PDF parsing infrastructure. The tradeoff is provider coupling for document intake.
- **Catalog extraction is review-first.** OpenAI can turn an irregular price list or image into editable rows, but the user must save that catalog before it becomes the deterministic comparison source.
- **Deterministic verification.** The model never sees the approved catalog and cannot approve an order. Business rules are testable, explainable, and safe to change independently.
- **Currency conversion before comparison.** PO amounts remain in their source currency for auditability. A daily reference rate creates separate catalog-currency values; only those converted values are compared with catalog prices. Reference rates are suitable for this prototype, not settlement or accounting.
- **No database.** The weekend scope is intake and verification, not order lifecycle management. Results are intentionally ephemeral; production would store an audit record and document hash.
- **Browser-local custom catalog.** Imported price lists are kept in `localStorage` for convenience and sent with each analysis. This avoids server-side persistence in the prototype, but production would use authenticated, versioned supplier contracts.
- **One deployable service.** The monorepo still separates UI, API, and contracts, while a single container keeps deployment and demo reliability simple.
- **Human in the loop.** PO Guard drafts a result but does not transmit a supplier confirmation or create an ERP order. Those are natural next actions after authentication, roles, and audit history exist.
- **Parallel, isolated batch intake.** Multiple files are separate API calls sharing only the selected catalog. This avoids cross-order LLM context contamination and lets partial successes remain usable; the prototype does not yet impose a concurrency queue for very large batches.
- **Client-generated verification PDF.** The structured, validated result is rendered into a PDF in the browser, so the server does not need to retain the order. Confirmed orders receive a `READY AND ANALYZED` badge; discrepancy reports are visibly marked `REVIEW REQUIRED`. The document includes an analysis UUID but is an automated verification record, not a digital signature or ERP approval.

## Production next steps

- Persist a document hash, extraction, reviewer decision, and price-list version for auditability.
- Move supplier catalogs to a database or ERP connector with effective dates and contract pricing.
- Add authentication, tenant isolation, virus scanning, and retention controls.
- Add a reviewer correction loop and extraction-quality metrics.
- Support taxes, freight, discounts, units of measure, and multi-currency tolerances.

## Demo flow

For a short demo, choose **3-order batch**. It runs a clean USD order, an order with a price mismatch and unknown SKU, and a EUR order that is converted into the catalog's USD currency. Use the batch tabs to review each result without losing the others.
