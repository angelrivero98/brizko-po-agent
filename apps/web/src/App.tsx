import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import {
  ArrowRight, Check, CheckCircle2, ChevronDown, CircleAlert, Clipboard,
  Download, FileText, LoaderCircle, PackageCheck, Pencil, Plus, RotateCcw, ShieldCheck,
  Sparkles, Trash2, Upload, X
} from 'lucide-react';
import { supplierCatalogSchema, type AnalysisResponse, type CatalogItem } from '@po/shared';
import { downloadConfirmationPdf } from './confirmation-pdf';

type CatalogResponse = { supplier: { name: string; currency: string }; items: CatalogItem[] };
type EditableCatalog = { name: string; currency: string; items: CatalogItem[] };
type BatchAnalysis = {
  id: string;
  label: string;
  status: 'complete' | 'failed';
  result?: AnalysisResponse;
  error?: string;
};

const CATALOG_STORAGE_KEY = 'po-guard-catalog-v1';

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

const EUR_SAMPLE = `PURCHASE ORDER PO-EUR-2003
Date: July 10, 2026
Supplier: Northstar Industrial Supply
Buyer: Acme Distribution Center Europe
Currency: EUR

SKU              Description                    Qty   Unit price   Amount
BOLT-M8-50       M8 x 50 mm hex bolts            2      €16.17     €32.34
GLV-NIT-M        Nitrile work gloves              2      €11.14     €22.28
WRAP-STRETCH     Industrial stretch wrap          3      €13.18     €39.54

TOTAL: €94.16 EUR`;

const money = (value: number | null, currency = 'USD') => value === null
  ? '—'
  : new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value);

const formatModelName = (model: string) => model.replace(/^gpt-/i, 'GPT ');

export function App() {
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [analyses, setAnalyses] = useState<BatchAnalysis[]>([]);
  const [activeAnalysisId, setActiveAnalysisId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const load = async () => {
      const stored = localStorage.getItem(CATALOG_STORAGE_KEY);
      if (stored) {
        try {
          const parsed = supplierCatalogSchema.safeParse(JSON.parse(stored));
          if (parsed.success) {
            setCatalog({ supplier: { name: parsed.data.name, currency: parsed.data.currency }, items: parsed.data.items });
            return;
          }
        } catch { /* Fall back to the demo catalog. */ }
      }
      const response = await fetch('/api/catalog');
      setCatalog(await response.json() as CatalogResponse);
    };
    void load();
  }, []);

  const chooseFiles = (nextFiles: File[]) => {
    if (!nextFiles.length) return;
    setFiles(current => {
      const candidates = [...current, ...nextFiles];
      return candidates.filter((candidate, index) => candidates.findIndex(file =>
        file.name === candidate.name && file.size === candidate.size && file.lastModified === candidate.lastModified
      ) === index);
    });
    setText('');
    setError('');
  };

  const removeFile = (fileToRemove: File) => {
    setFiles(current => current.filter(file => file !== fileToRemove));
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    chooseFiles(Array.from(event.dataTransfer.files));
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
      const orders = files.length
        ? files.map((file, index) => ({ id: `${file.name}-${file.size}-${file.lastModified}-${index}`, label: file.name, file }))
        : [{ id: `pasted-order-${Date.now()}`, label: 'Pasted purchase order', text }];

      const settled = await Promise.allSettled(orders.map(async order => {
        const body = new FormData();
        if ('file' in order && order.file) body.append('file', order.file);
        else if ('text' in order) body.append('text', order.text);
        if (catalog) {
          body.append('catalog', JSON.stringify({
            name: catalog.supplier.name,
            currency: catalog.supplier.currency,
            items: catalog.items
          }));
        }
        const response = await fetch('/api/analyze', { method: 'POST', body });
        const payload = await response.json() as AnalysisResponse | { error?: string };
        if (!response.ok) throw new Error('error' in payload ? payload.error : 'The PO could not be analyzed.');
        return payload as AnalysisResponse;
      }));

      const nextAnalyses: BatchAnalysis[] = settled.map((outcome, index) => ({
        id: orders[index]!.id,
        label: orders[index]!.label,
        status: outcome.status === 'fulfilled' ? 'complete' : 'failed',
        ...(outcome.status === 'fulfilled'
          ? { result: outcome.value }
          : { error: outcome.reason instanceof Error ? outcome.reason.message : 'The PO could not be analyzed.' })
      }));
      setAnalyses(nextAnalyses);
      setActiveAnalysisId(nextAnalyses.find(analysis => analysis.status === 'complete')?.id ?? nextAnalyses[0]?.id ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The orders could not be analyzed.');
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setAnalyses([]); setActiveAnalysisId(null); setText(''); setFiles([]); setError('');
    if (fileInput.current) fileInput.current.value = '';
  };

  const loadBatchSample = () => {
    const options = { type: 'text/plain', lastModified: Date.now() };
    setFiles([
      new File([CLEAN_SAMPLE], 'po-1042-clean.txt', options),
      new File([ISSUE_SAMPLE], 'po-1049-with-issues.txt', options),
      new File([EUR_SAMPLE], 'po-eur-2003.txt', options)
    ]);
    setText('');
    setError('');
  };

  const saveCatalog = (nextCatalog: EditableCatalog) => {
    const parsed = supplierCatalogSchema.parse(nextCatalog);
    localStorage.setItem(CATALOG_STORAGE_KEY, JSON.stringify(parsed));
    setCatalog({ supplier: { name: parsed.name, currency: parsed.currency }, items: parsed.items });
    setCatalogOpen(false);
  };

  const restoreDefaultCatalog = async () => {
    localStorage.removeItem(CATALOG_STORAGE_KEY);
    const response = await fetch('/api/catalog');
    setCatalog(await response.json() as CatalogResponse);
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label="PO Guard home">
          <span className="brand-mark"><PackageCheck size={19} strokeWidth={2.4} /></span>
          <span>PO Guard</span>
        </a>
        <button className="environment" aria-label="Edit active supplier catalog" onClick={loadCatalog}><span /> <strong>{catalog ? catalog.supplier.name : 'Loading catalog…'}</strong>{catalog && <em>· {catalog.items.length} SKUs</em>} <Pencil size={12} /></button>
      </header>

      <main>
        {!analyses.length ? (
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
                <button className="catalog-link" onClick={loadCatalog}>Edit price list <ChevronDown size={15} /></button>
              </div>

              {catalogOpen && catalog && (
                <CatalogEditor
                  catalog={{ name: catalog.supplier.name, currency: catalog.supplier.currency, items: catalog.items }}
                  onClose={() => setCatalogOpen(false)}
                  onSave={saveCatalog}
                  onRestoreDefault={restoreDefaultCatalog}
                />
              )}

              <div
                className={`drop-zone ${dragging ? 'dragging' : ''} ${files.length ? 'has-file' : ''}`}
                onDragOver={event => { event.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
              >
                <input ref={fileInput} multiple type="file" accept=".pdf,.csv,.txt,.eml,application/pdf,text/csv,text/plain,message/rfc822" onChange={(event: ChangeEvent<HTMLInputElement>) => { chooseFiles(Array.from(event.target.files ?? [])); event.currentTarget.value = ''; }} />
                {files.length ? (
                  <div className="selected-files">
                    <div className="selected-files-heading"><strong>{files.length} order{files.length === 1 ? '' : 's'} ready</strong><button onClick={() => fileInput.current?.click()}><Plus size={14} /> Add more</button></div>
                    <div className="file-list">{files.map(file => (
                      <div className="file-chip" key={`${file.name}-${file.size}-${file.lastModified}`}><FileText size={20} /><div><strong>{file.name}</strong><span>{(file.size / 1024).toFixed(1)} KB · analyzed separately</span></div><button onClick={() => removeFile(file)} aria-label={`Remove ${file.name}`}><X size={17} /></button></div>
                    ))}</div>
                  </div>
                ) : (
                  <button onClick={() => fileInput.current?.click()} className="drop-content"><span className="upload-icon"><Upload size={21} /></span><strong>Drop one or more POs here</strong><small>PDF, CSV, TXT, or EML · analyzed separately in parallel</small></button>
                )}
              </div>

              <div className="divider"><span>or paste the contents</span></div>
              <textarea value={text} disabled={files.length > 0} onChange={event => setText(event.target.value)} placeholder="Paste an email or purchase order text here…" aria-label="Purchase order text" />

              <div className="samples"><span>Try an example:</span><button onClick={() => { setText(CLEAN_SAMPLE); setFiles([]); }}>Clean PO</button><button onClick={() => { setText(ISSUE_SAMPLE); setFiles([]); }}>PO with issues</button><button className="batch-sample" onClick={loadBatchSample}>3-order batch</button></div>
              {error && <div className="error-banner"><CircleAlert size={17} />{error}</div>}
              <button className="primary-button" disabled={loading || (!text.trim() && !files.length)} onClick={analyze}>
                {loading ? <><LoaderCircle className="spin" size={18} /> Analyzing {files.length > 1 ? `${files.length} orders in parallel…` : 'purchase order…'}</> : <>Analyze {files.length > 1 ? `${files.length} orders` : 'purchase order'} <ArrowRight size={18} /></>}
              </button>
              <p className="privacy-note">Your document is used only for this analysis and is not stored.</p>
            </div>
          </section>
        ) : (
          <BatchResults analyses={analyses} activeId={activeAnalysisId} catalogName={catalog?.supplier.name ?? 'Selected supplier catalog'} onSelect={setActiveAnalysisId} onReset={reset} />
        )}
      </main>
      <footer><span>PO Guard prototype</span><span>AI extracts · Rules verify · Humans decide</span></footer>
    </div>
  );
}

function CatalogEditor({
  catalog,
  onClose,
  onSave,
  onRestoreDefault
}: {
  catalog: EditableCatalog;
  onClose: () => void;
  onSave: (catalog: EditableCatalog) => void;
  onRestoreDefault: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<EditableCatalog>(() => ({
    ...catalog,
    items: catalog.items.map(item => ({ ...item }))
  }));
  const [editorError, setEditorError] = useState('');
  const [editorNotice, setEditorNotice] = useState('');
  const [extractingCatalog, setExtractingCatalog] = useState(false);
  const catalogFileInput = useRef<HTMLInputElement>(null);
  const aiCatalogFileInput = useRef<HTMLInputElement>(null);

  const updateItem = (index: number, changes: Partial<CatalogItem>) => {
    setDraft(current => ({
      ...current,
      items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, ...changes } : item)
    }));
  };

  const updateCurrency = (currency: string) => {
    const normalized = currency.toUpperCase().slice(0, 3);
    setDraft(current => ({
      ...current,
      currency: normalized,
      items: current.items.map(item => ({ ...item, currency: normalized }))
    }));
  };

  const importCatalog = async (inputFile?: File) => {
    if (!inputFile) return;
    setEditorError('');
    setEditorNotice('');
    try {
      const contents = await inputFile.text();
      let imported: EditableCatalog;
      if (inputFile.name.toLowerCase().endsWith('.json')) {
        const value = JSON.parse(contents) as unknown;
        const record = !Array.isArray(value) && typeof value === 'object' && value !== null
          ? value as Record<string, unknown>
          : null;
        const rawItems = Array.isArray(value) ? value : record?.items;
        if (!Array.isArray(rawItems)) throw new Error('JSON must be an item array or an object with an items array.');
        const currency = typeof record?.currency === 'string' ? record.currency : draft.currency;
        const items = rawItems.map(rawItem => {
          const item = typeof rawItem === 'object' && rawItem !== null ? rawItem as Record<string, unknown> : {};
          return {
            sku: String(item.sku ?? '').trim().toUpperCase(),
            description: String(item.description ?? item.descripcion ?? '').trim(),
            unitPrice: Number(item.unitPrice ?? item.unit_price ?? item.price ?? item.precio),
            currency: String(item.currency ?? item.moneda ?? currency).trim().toUpperCase()
          };
        });
        const parsed = supplierCatalogSchema.parse({
          name: typeof record?.name === 'string' ? record.name : inputFile.name.replace(/\.json$/i, ''),
          currency,
          items
        });
        imported = parsed;
      } else {
        const rows = parseCsv(contents);
        if (rows.length < 2) throw new Error('The CSV needs a header and at least one item.');
        const headers = rows[0]!.map(header => header.trim().toLowerCase().replace(/[\s_-]/g, ''));
        const findHeader = (...names: string[]) => headers.findIndex(header => names.includes(header));
        const skuIndex = findHeader('sku', 'itemsku', 'codigo', 'código');
        const descriptionIndex = findHeader('description', 'descripcion', 'descripción', 'item');
        const priceIndex = findHeader('unitprice', 'price', 'precio', 'preciounitario');
        const currencyIndex = findHeader('currency', 'moneda');
        if (skuIndex < 0 || descriptionIndex < 0 || priceIndex < 0) {
          throw new Error('CSV columns required: sku, description, unitPrice. Currency is optional.');
        }
        const items = rows.slice(1).filter(row => row.some(Boolean)).map(row => ({
          sku: (row[skuIndex] ?? '').trim().toUpperCase(),
          description: (row[descriptionIndex] ?? '').trim(),
          unitPrice: Number((row[priceIndex] ?? '').replace(/[$,]/g, '')),
          currency: (currencyIndex >= 0 ? row[currencyIndex] : draft.currency)?.trim().toUpperCase() || draft.currency
        }));
        const currency = items[0]?.currency ?? draft.currency;
        imported = supplierCatalogSchema.parse({
          name: inputFile.name.replace(/\.csv$/i, ''),
          currency,
          items
        });
      }
      setDraft(imported);
    } catch (cause) {
      setEditorError(cause instanceof Error ? cause.message : 'The catalog could not be imported.');
    } finally {
      if (catalogFileInput.current) catalogFileInput.current.value = '';
    }
  };

  const extractCatalogWithAi = async (inputFile?: File) => {
    if (!inputFile) return;
    setEditorError('');
    setEditorNotice('');
    setExtractingCatalog(true);
    try {
      const body = new FormData();
      body.append('file', inputFile);
      const response = await fetch('/api/catalog/extract', { method: 'POST', body });
      const payload = await response.json() as {
        catalog?: EditableCatalog;
        warnings?: string[];
        modelUsed?: string;
        error?: string;
      };
      if (!response.ok || !payload.catalog) {
        throw new Error(payload.error ?? 'The AI could not extract this catalog.');
      }
      const parsed = supplierCatalogSchema.parse(payload.catalog);
      setDraft(parsed);
      const warningText = payload.warnings?.length
        ? ` Review ${payload.warnings.length} extraction warning${payload.warnings.length === 1 ? '' : 's'} before saving.`
        : '';
      setEditorNotice(`Extracted ${parsed.items.length} SKU${parsed.items.length === 1 ? '' : 's'} with ${payload.modelUsed ? formatModelName(payload.modelUsed) : 'OpenAI'}.${warningText}`);
    } catch (cause) {
      setEditorError(cause instanceof Error ? cause.message : 'The AI could not extract this catalog.');
    } finally {
      setExtractingCatalog(false);
      if (aiCatalogFileInput.current) aiCatalogFileInput.current.value = '';
    }
  };

  const save = () => {
    setEditorError('');
    const normalized = {
      ...draft,
      name: draft.name.trim(),
      currency: draft.currency.trim().toUpperCase(),
      items: draft.items.map(item => ({
        ...item,
        sku: item.sku.trim().toUpperCase(),
        description: item.description.trim(),
        currency: draft.currency.trim().toUpperCase()
      }))
    };
    const duplicateSkus = normalized.items
      .map(item => item.sku)
      .filter((sku, index, all) => all.indexOf(sku) !== index);
    if (duplicateSkus.length) {
      setEditorError(`Duplicate SKU: ${duplicateSkus[0]}`);
      return;
    }
    const parsed = supplierCatalogSchema.safeParse(normalized);
    if (!parsed.success) {
      setEditorError('Complete the supplier name, 3-letter currency, SKU, description, and a valid non-negative price for every row.');
      return;
    }
    onSave(parsed.data);
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <section className="catalog-modal" role="dialog" aria-modal="true" aria-labelledby="catalog-editor-title">
        <div className="catalog-modal-header">
          <div><span className="step">PRICE LIST</span><h2 id="catalog-editor-title">Catalog used for verification</h2><p>Import your own list or edit any item before analyzing a PO.</p></div>
          <button className="icon-button" onClick={onClose} aria-label="Close catalog editor"><X size={18} /></button>
        </div>

        <div className="catalog-meta">
          <label>Supplier name<input value={draft.name} onChange={event => setDraft(current => ({ ...current, name: event.target.value }))} /></label>
          <label>Currency<input value={draft.currency} maxLength={3} onChange={event => updateCurrency(event.target.value)} /></label>
          <div className="catalog-actions">
            <input ref={catalogFileInput} type="file" accept=".csv,.json,text/csv,application/json" onChange={event => void importCatalog(event.target.files?.[0])} />
            <input ref={aiCatalogFileInput} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.txt,.csv,.json,application/pdf,image/png,image/jpeg,image/webp,image/gif,text/plain,text/csv,application/json" onChange={event => void extractCatalogWithAi(event.target.files?.[0])} />
            <button onClick={() => catalogFileInput.current?.click()}><Upload size={15} /> Import structured</button>
            <button className="ai-catalog-button" disabled={extractingCatalog} onClick={() => aiCatalogFileInput.current?.click()}>
              {extractingCatalog ? <LoaderCircle className="spin" size={15} /> : <Sparkles size={15} />}
              {extractingCatalog ? 'Extracting…' : 'Extract with AI'}
            </button>
            <a href="/catalog-template.csv" download>CSV template</a>
            <button onClick={() => setDraft(current => ({ ...current, items: [...current.items, { sku: '', description: '', unitPrice: 0, currency: current.currency }] }))}><Plus size={15} /> Add row</button>
          </div>
        </div>

        <div className="catalog-edit-table-wrap">
          <table className="catalog-edit-table">
            <thead><tr><th>SKU</th><th>Description</th><th>Unit price</th><th aria-label="Actions" /></tr></thead>
            <tbody>{draft.items.map((item, index) => (
              <tr key={`${index}-${item.sku}`}>
                <td><input aria-label={`SKU row ${index + 1}`} value={item.sku} onChange={event => updateItem(index, { sku: event.target.value })} /></td>
                <td><input aria-label={`Description row ${index + 1}`} value={item.description} onChange={event => updateItem(index, { description: event.target.value })} /></td>
                <td><div className="price-input"><span>{draft.currency || '—'}</span><input aria-label={`Unit price row ${index + 1}`} type="number" min="0" step="0.01" value={Number.isFinite(item.unitPrice) ? item.unitPrice : ''} onChange={event => updateItem(index, { unitPrice: event.target.value === '' ? Number.NaN : Number(event.target.value) })} /></div></td>
                <td><button className="delete-row" disabled={draft.items.length === 1} onClick={() => setDraft(current => ({ ...current, items: current.items.filter((_, itemIndex) => itemIndex !== index) }))} aria-label={`Delete row ${index + 1}`}><Trash2 size={15} /></button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>

        {editorNotice && <div className="catalog-notice"><Sparkles size={16} />{editorNotice}</div>}
        {editorError && <div className="error-banner catalog-error"><CircleAlert size={17} />{editorError}</div>}
        <div className="catalog-modal-footer">
          <button className="reset-catalog" onClick={() => void onRestoreDefault().then(onClose)}><RotateCcw size={14} /> Restore demo catalog</button>
          <div><button className="secondary-button" onClick={onClose}>Cancel</button><button className="save-catalog" onClick={save}>Use this catalog <Check size={15} /></button></div>
        </div>
        <p className="catalog-storage-note">Saved only in this browser. The selected catalog is sent with the PO for comparison and is not stored by the server.</p>
      </section>
    </div>
  );
}

function parseCsv(contents: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < contents.length; index++) {
    const char = contents[index]!;
    const next = contents[index + 1];
    if (char === '"' && quoted && next === '"') {
      field += '"';
      index++;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(field); field = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') index++;
      row.push(field); field = '';
      if (row.some(value => value.trim())) rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }
  row.push(field);
  if (row.some(value => value.trim())) rows.push(row);
  return rows;
}

function BatchResults({
  analyses,
  activeId,
  catalogName,
  onSelect,
  onReset
}: {
  analyses: BatchAnalysis[];
  activeId: string | null;
  catalogName: string;
  onSelect: (id: string) => void;
  onReset: () => void;
}) {
  const active = analyses.find(analysis => analysis.id === activeId) ?? analyses[0];
  const confirmed = analyses.filter(analysis => analysis.result?.status === 'confirmed').length;
  const review = analyses.filter(analysis => analysis.result?.status === 'review_required').length;
  const failed = analyses.filter(analysis => analysis.status === 'failed').length;

  return (
    <section className="results-page">
      <button className="back-button" onClick={onReset}><RotateCcw size={16} /> Analyze another batch</button>

      {analyses.length > 1 && (
        <div className="batch-panel">
          <div className="batch-panel-heading">
            <div><span className="result-kicker">Parallel batch complete</span><h1>{analyses.length} orders analyzed independently</h1></div>
            <div className="batch-stats"><span className="confirmed"><CheckCircle2 size={15} /> {confirmed} confirmed</span><span className="review"><CircleAlert size={15} /> {review} review</span>{failed > 0 && <span className="failed"><X size={15} /> {failed} failed</span>}</div>
          </div>
          <div className="batch-orders" role="tablist" aria-label="Purchase order results">
            {analyses.map((analysis, index) => {
              const needsReview = analysis.result?.status === 'review_required';
              const isFailed = analysis.status === 'failed';
              return (
                <button
                  key={analysis.id}
                  className={`batch-order ${analysis.id === active?.id ? 'active' : ''}`}
                  onClick={() => onSelect(analysis.id)}
                  role="tab"
                  aria-selected={analysis.id === active?.id}
                >
                  <span className={`batch-order-number ${isFailed ? 'failed' : needsReview ? 'review' : 'confirmed'}`}>{isFailed ? <X size={15} /> : needsReview ? <CircleAlert size={15} /> : <Check size={15} />}</span>
                  <span><small>Order {index + 1}</small><strong>{analysis.result?.extracted.poNumber ?? analysis.label}</strong><em>{analysis.label}</em></span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {active?.result ? <ResultDetail key={active.id} result={active.result} catalogName={catalogName} /> : (
        <div className="failed-result">
          <span><CircleAlert size={24} /></span>
          <div><p className="result-kicker">Analysis failed</p><h1>{active?.label ?? 'Purchase order'}</h1><p>{active?.error ?? 'The PO could not be analyzed.'}</p></div>
        </div>
      )}
    </section>
  );
}

function ResultDetail({ result, catalogName }: { result: AnalysisResponse; catalogName: string }) {
  const isConfirmed = result.status === 'confirmed';
  const converted = result.conversion.from !== result.conversion.to;
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  const copyConfirmation = async () => {
    await navigator.clipboard.writeText(result.confirmation);
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  };
  const downloadPdf = async () => {
    setDownloadError('');
    setDownloading(true);
    try {
      await downloadConfirmationPdf(result, { catalogName });
    } catch {
      setDownloadError('The PDF could not be generated. Please try again.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="result-detail">
      <div className={`result-hero ${isConfirmed ? 'success' : 'warning'}`}>
        <div className="result-icon">{isConfirmed ? <CheckCircle2 size={25} /> : <CircleAlert size={25} />}</div>
        <div><span className="result-kicker">Analysis complete</span><h1>{isConfirmed ? 'Ready to confirm' : 'Review required'}</h1><p>{result.confirmation}</p></div>
        <div className="result-proof">
          <div className={`verification-seal ${isConfirmed ? 'confirmed' : 'review'}`}><ShieldCheck size={16} /><span><strong>{isConfirmed ? 'Ready & analyzed' : 'Review required'}</strong><small>Ref. {result.id.slice(0, 8).toUpperCase()}</small></span></div>
          <div className="model-badge">Processed by {formatModelName(result.modelUsed)}</div>
        </div>
      </div>

      {converted && (
        <div className="conversion-banner">
          <div><span className="conversion-mark">FX</span><strong>{result.conversion.from} → {result.conversion.to}</strong></div>
          <p>1 {result.conversion.from} = {result.conversion.rate.toFixed(6)} {result.conversion.to}</p>
          <span>Reference rate · {result.conversion.date ?? 'latest available'}</span>
        </div>
      )}

      <div className="summary-grid">
        <div><span>PO number</span><strong>{result.extracted.poNumber ?? 'Not found'}</strong></div>
        <div><span>Supplier</span><strong>{result.extracted.supplierName ?? 'Not found'}</strong></div>
        <div><span>Order date</span><strong>{result.extracted.orderDate ?? 'Not found'}</strong></div>
        <div><span>PO total</span><strong>{money(result.totals.stated ?? result.totals.submitted, result.conversion.from)}</strong></div>
        <div><span>Converted PO</span><strong>{money(result.totals.submittedInCatalogCurrency, result.conversion.to)}</strong></div>
        <div><span>Catalog total</span><strong>{money(result.totals.catalog, result.conversion.to)}</strong></div>
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
        <div className="table-wrap"><table className="line-items-table"><thead><tr><th>SKU / description</th><th>Qty</th><th>PO price</th>{converted && <th>Converted</th>}<th>Catalog</th><th>Expected total</th><th>Status</th></tr></thead>
          <tbody>{result.lines.map((line, index) => <tr key={`${line.sku}-${index}`}>
            <td data-label="Item"><code>{line.sku}</code><small>{line.catalogDescription ?? line.description}</small></td>
            <td data-label="Quantity">{line.quantity}</td>
            <td data-label={`PO price (${result.conversion.from})`}>{money(line.unitPrice, result.conversion.from)}</td>
            {converted && <td data-label={`Converted (${result.conversion.to})`} className="converted-price">{money(line.convertedUnitPrice, result.conversion.to)}</td>}
            <td data-label={`Catalog (${result.conversion.to})`}>{money(line.catalogUnitPrice, result.conversion.to)}</td>
            <td data-label="Expected total">{money(line.expectedLineTotal, result.conversion.to)}</td>
            <td data-label="Status"><span className={`status-pill ${line.status}`}>{line.status === 'matched' ? <Check size={13} /> : <CircleAlert size={13} />}{line.status}</span></td>
          </tr>)}</tbody>
        </table></div>
      </div>

      <div className="confirmation-card">
        <div><span>Confirmation draft</span><p>{result.confirmation}</p></div>
        <div className="confirmation-actions">
          <button className="download-confirmation" disabled={downloading} onClick={() => void downloadPdf()}>{downloading ? <LoaderCircle className="spin" size={16} /> : <Download size={16} />}{downloading ? 'Generating PDF…' : isConfirmed ? 'Download verified PDF' : 'Download review report'}</button>
          <button onClick={copyConfirmation}>{copied ? <Check size={16} /> : <Clipboard size={16} />}{copied ? 'Copied' : 'Copy confirmation'}</button>
        </div>
      </div>
      {downloadError && <div className="error-banner result-download-error"><CircleAlert size={17} />{downloadError}</div>}
    </div>
  );
}
