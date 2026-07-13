# Video recording guide

## Product demo — 3 to 5 minutes

**0:00–0:25 — Problem**

“I built PO Guard, a purchase-order intake workflow for logistics operations. Incoming orders often arrive as PDFs or loosely formatted emails. Manually re-keying them is slow, and price or total discrepancies are easy to miss.”

**0:25–0:55 — Architecture and safety**

Show the repository folders or the README architecture section.

“The app is a TypeScript monorepo: React and Vite on the frontend, Express on the backend, and a shared schema package. Claude extracts the messy document into structured data through a forced tool call. Zod validates it, then regular TypeScript checks the catalog. The important boundary is: AI extracts; code decides.”

**0:55–2:15 — Discrepancy path**

1. Open the deployed URL.
2. Briefly open **View price list**.
3. Select **PO with issues** and click **Analyze purchase order**.
4. Point out the price mismatch, unknown SKU, and stated-total mismatch.
5. Show the side-by-side PO price and catalog price in the verified-lines table.
6. Copy the generated confirmation draft.

“The LLM never decides whether this order is valid. It did the document understanding; deterministic rules created every flag you see here.”

**2:15–3:00 — Clean path**

1. Click **Analyze another PO**.
2. Select **Clean PO** and analyze it.
3. Show the green confirmation state and matched line items.

**3:00–3:40 — Tradeoffs**

“For weekend scope I deliberately skipped a database, authentication, and ERP writes. Uploaded documents are not stored, and the app does not automatically place an order. In production I would add an audit record with the price-list version, reviewer decisions, tenant isolation, and an ERP connector.”

**3:40–4:00 — Close**

“This is deployed as one Render service from one monorepo, with a small surface area but a real end-to-end workflow: intake, extraction, verification, and an operational output.”

## Motivation video — 1 to 2 minutes

Keep this personal; do not read it like a product pitch. Replace the bracketed line with one real example from your experience.

“Hi, I’m Ángel. I want to work with Brizko because logistics is one of those domains where software quality immediately affects the physical world. A small improvement in how an order, shipment, or exception is handled can remove repetitive work for an operations team and prevent an expensive downstream mistake.

What excites me about AI in logistics is not just adding chat. It is combining unstructured inputs—emails, PDFs, messages, photos—with deterministic systems and clear human review. That boundary is what I explored in this project: let the model understand the messy document, but keep pricing and acceptance rules auditable in code.

[Add 1–2 sentences about a real moment when you enjoyed turning an ambiguous operational problem into reliable software.]

I’m especially interested in working close to real users, shipping quickly, and then using their feedback and failure cases to make the system more dependable. That mix of AI engineering, product judgment, and real logistics operations is why Brizko is exciting to me.”

## Recording checklist

- Use a 16:9 recording at 1080p.
- Increase browser zoom slightly if table text is hard to read.
- Hide bookmarks, notifications, API keys, and unrelated tabs.
- Record the demo with both sample paths once before the final take.
- Keep the motivation video face-to-camera and use your own words around the personal example.
