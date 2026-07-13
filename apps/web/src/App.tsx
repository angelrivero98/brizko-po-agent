import { useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import {
  ArrowRight, Check, CheckCircle2, ChevronDown, CircleAlert, Clipboard,
  FileText, LoaderCircle, PackageCheck, RotateCcw, ShieldCheck, Upload, X
} from 'lucide-react';
import type { AnalysisResponse } from '@po/shared';

type CatalogItem = { sku: string; description: string; unitPrice: number; currency: string };
type CatalogResponse = { supplier: { name: string }; items: CatalogItem[] };

const CLEAN_SAMPLE = `PURCHASE ORDER PO-1042
Date: July 12, 2026
Supplier: Northstar Industrial Supply
Buyer: Acme Distribution Center

SKU              Description                    Qty   Unit price   Amount
BOLT-M8-50       M8 x 50 mm hex bolts            4      $18.50     $74.00
GLV-NIT-M        Nitrile work gloves              2      $12.75     $25.50

TOTAL: $99.50 USD`;

const ISSUE_SAMPLE = `From: purchasing@acme.example
To: orders@northstar.example
Subject: New order PO-1049

Hi Northstar team,
Please process the following order:

3 x BOLT-M8-50 at $21.00 each
2 x WRAP-STRETCH at $16.25 each
1 x SAFETY-VEST-XL at $9.50 each

PO total: $105.00 USD
Thanks,
Marina — Acme Purchasing`;

const money = (value: number | null, currency = 'USD') => value === null
  ? '—'
  : new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value);

export function App() {
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResponse | null>(null);
  const [error, setError] = useState('');
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const chooseFile = (nextFile?: File) => {
    if (!nextFile) return;
    setFile(nextFile);
    setText('');
    setError('');
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    chooseFile(event.dataTransfer.files[0]);
  };

  const loadCatalog = async () => {
    if (!catalog) {
      const response = await fetch('/api/catalog');
      setCatalog(await response.json() as CatalogResponse);
    }
    setCatalogOpen(open => !open);
  };

  const analyze = async () => {
    setError('');
    setLoading(true);
    try {
      const body = new FormData();
      if (file) body.append('file', file);
      else body.append('text', text);
      const response = await fetch('/api/analyze', { method: 'POST', body });
      const payload = await response.json() as AnalysisResponse | { error?: string };
      if (!response.ok) throw new Error('error' in payload ? payload.error : 'The PO could not be analyzed.');
      setResult(payload as AnalysisResponse);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The PO could not be analyzed.');
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setResult(null); setText(''); setFile(null); setError('');
    if (fileInput.current) fileInput.current.value = '';
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label="PO Guard home">
          <span className="brand-mark"><PackageCheck size={19} strokeWidth={2.4} /></span>
          <span>PO Guard</span>
        </a>
        <div className="environment"><span /> Live catalog · 6 SKUs</div>
      </header>

      <main>
        {!result ? (
          <section className="workspace">
            <div className="intro">
              <div className="eyebrow"><ShieldCheck size={14} /> AI-assisted intake</div>
              <h1>Turn purchase orders<br />into <em>clean confirmations.</em></h1>
              <p>Drop in a PO. We extract every line, check it against the supplier catalog, and surface what needs attention.</p>
              <div className="trust-row">
                <span><Check size={15} /> Human-review ready</span>
                <span><Check size={15} /> No automatic ordering</span>
              </div>
            </div>

            <div className="intake-card">
              <div className="card-heading">
                <div><span className="step">01</span><h2>Incoming purchase order</h2></div>
                <button className="catalog-link" onClick={loadCatalog}>View price list <ChevronDown size={15} /></button>
              </div>

              {catalogOpen && catalog && (
                <div className="catalog-panel">
                  <div className="catalog-title"><strong>{catalog.supplier.name}</strong><button onClick={() => setCatalogOpen(false)} aria-label="Close catalog"><X size={16} /></button></div>
                  {catalog.items.map(item => <div className="catalog-row" key={item.sku}><code>{item.sku}</code><span>{item.description}</span><b>{money(item.unitPrice)}</b></div>)}
                </div>
              )}

              <div
                className={`drop-zone ${dragging ? 'dragging' : ''} ${file ? 'has-file' : ''}`}
                onDragOver={event => { event.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
              >
                <input ref={fileInput} type="file" accept=".pdf,.txt,.eml,application/pdf,text/plain,message/rfc822" onChange={(event: ChangeEvent<HTMLInputElement>) => chooseFile(event.target.files?.[0])} />
                {file ? (
                  <div className="file-chip"><FileText size={22} /><div><strong>{file.name}</strong><span>{(file.size / 1024).toFixed(1)} KB · ready to analyze</span></div><button onClick={() => setFile(null)} aria-label="Remove file"><X size={17} /></button></div>
                ) : (
                  <button onClick={() => fileInput.current?.click()} className="drop-content"><span className="upload-icon"><Upload size={21} /></span><strong>Drop a PO here or choose a file</strong><small>PDF, TXT, or EML · up to 10 MB</small></button>
                )}
              </div>

              <div className="divider"><span>or paste the contents</span></div>
              <textarea value={text} disabled={Boolean(file)} onChange={event => setText(event.target.value)} placeholder="Paste an email or purchase order text here…" aria-label="Purchase order text" />

              <div className="samples"><span>Try an example:</span><button onClick={() => { setText(CLEAN_SAMPLE); setFile(null); }}>Clean PO</button><button onClick={() => { setText(ISSUE_SAMPLE); setFile(null); }}>PO with issues</button></div>
              {error && <div className="error-banner"><CircleAlert size={17} />{error}</div>}
              <button className="primary-button" disabled={loading || (!text.trim() && !file)} onClick={analyze}>
                {loading ? <><LoaderCircle className="spin" size={18} /> Extracting and checking…</> : <>Analyze purchase order <ArrowRight size={18} /></>}
              </button>
              <p className="privacy-note">Your document is used only for this analysis and is not stored.</p>
            </div>
          </section>
        ) : (
          <Results result={result} onReset={reset} />
        )}
      </main>
      <footer><span>PO Guard prototype</span><span>AI extracts · Rules verify · Humans decide</span></footer>
    </div>
  );
}

function Results({ result, onReset }: { result: AnalysisResponse; onReset: () => void }) {
  const isConfirmed = result.status === 'confirmed';
  const [copied, setCopied] = useState(false);
  const copyConfirmation = async () => {
    await navigator.clipboard.writeText(result.confirmation);
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  };

  return (
    <section className="results-page">
      <button className="back-button" onClick={onReset}><RotateCcw size={15} /> Analyze another PO</button>
      <div className={`result-hero ${isConfirmed ? 'success' : 'warning'}`}>
        <div className="result-icon">{isConfirmed ? <CheckCircle2 size={25} /> : <CircleAlert size={25} />}</div>
        <div><span className="result-kicker">Analysis complete</span><h1>{isConfirmed ? 'Ready to confirm' : 'Review required'}</h1><p>{result.confirmation}</p></div>
        <div className="model-badge">Processed by {result.modelUsed.replace('claude-', 'Claude ')}</div>
      </div>

      <div className="summary-grid">
        <div><span>PO number</span><strong>{result.extracted.poNumber ?? 'Not found'}</strong></div>
        <div><span>Supplier</span><strong>{result.extracted.supplierName ?? 'Not found'}</strong></div>
        <div><span>Order date</span><strong>{result.extracted.orderDate ?? 'Not found'}</strong></div>
        <div><span>Catalog total</span><strong>{money(result.totals.catalog, result.extracted.currency)}</strong></div>
      </div>

      {result.discrepancies.length > 0 && (
        <div className="issues-card">
          <div className="section-title"><div><span className="step">02</span><h2>Discrepancies</h2></div><span className="issue-count">{result.discrepancies.length} found</span></div>
          {result.discrepancies.map((issue, index) => (
            <div className="issue-row" key={`${issue.code}-${index}`}><CircleAlert size={18} /><div><strong>{issue.code.replaceAll('_', ' ')}</strong><p>{issue.message}</p></div></div>
          ))}
        </div>
      )}

      <div className="lines-card">
        <div className="section-title"><div><span className="step">03</span><h2>Verified line items</h2></div><span>{result.lines.length} items</span></div>
        <div className="table-wrap"><table><thead><tr><th>SKU / description</th><th>Qty</th><th>PO price</th><th>Catalog</th><th>Expected total</th><th>Status</th></tr></thead>
          <tbody>{result.lines.map((line, index) => <tr key={`${line.sku}-${index}`}><td><code>{line.sku}</code><small>{line.catalogDescription ?? line.description}</small></td><td>{line.quantity}</td><td>{money(line.unitPrice, result.extracted.currency)}</td><td>{money(line.catalogUnitPrice, result.extracted.currency)}</td><td>{money(line.expectedLineTotal, result.extracted.currency)}</td><td><span className={`status-pill ${line.status}`}>{line.status === 'matched' ? <Check size={13} /> : <CircleAlert size={13} />}{line.status}</span></td></tr>)}</tbody>
        </table></div>
      </div>

      <div className="confirmation-card">
        <div><span>Confirmation draft</span><p>{result.confirmation}</p></div>
        <button onClick={copyConfirmation}>{copied ? <Check size={16} /> : <Clipboard size={16} />}{copied ? 'Copied' : 'Copy confirmation'}</button>
      </div>
    </section>
  );
}
