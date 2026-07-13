import type { AnalysisResponse } from '@po/shared';

type PdfOptions = {
  catalogName: string;
  issuedAt?: Date;
};

const rgb = (red: number, green: number, blue: number): [number, number, number] => [red, green, blue];

const COLORS = {
  ink: rgb(23, 35, 31),
  muted: rgb(102, 112, 107),
  green: rgb(30, 107, 79),
  greenDark: rgb(21, 82, 60),
  greenPale: rgb(236, 248, 237),
  amber: rgb(168, 92, 20),
  amberPale: rgb(255, 245, 232),
  line: rgb(220, 225, 218),
  paper: rgb(252, 253, 249),
  white: rgb(255, 255, 255)
};

const money = (value: number | null, currency: string) => value === null
  ? '-'
  : new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value);

const safeFilename = (value: string) => value.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();

export async function createConfirmationPdf(result: AnalysisResponse, options: PdfOptions) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 18;
  const contentWidth = pageWidth - margin * 2;
  const confirmed = result.status === 'confirmed';
  const accent = confirmed ? COLORS.green : COLORS.amber;
  const accentPale = confirmed ? COLORS.greenPale : COLORS.amberPale;
  const issuedAt = options.issuedAt ?? new Date();
  const poNumber = result.extracted.poNumber ?? 'Unnumbered PO';
  const statusTitle = confirmed ? 'READY AND ANALYZED' : 'REVIEW REQUIRED';
  const statusDescription = confirmed
    ? 'No discrepancies were found against the selected supplier catalog.'
    : `${result.discrepancies.length} discrepanc${result.discrepancies.length === 1 ? 'y requires' : 'ies require'} human review before confirmation.`;

  doc.setProperties({
    title: `${poNumber} - PO Guard ${confirmed ? 'confirmation' : 'review report'}`,
    subject: 'Automated purchase-order catalog verification record',
    author: 'PO Guard',
    creator: 'PO Guard'
  });

  doc.setFillColor(...COLORS.paper);
  doc.rect(0, 0, pageWidth, pageHeight, 'F');

  doc.setFillColor(...COLORS.green);
  doc.roundedRect(margin, 14, 12, 12, 2.5, 2.5, 'F');
  doc.setTextColor(...COLORS.white);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('PG', margin + 6, 21.5, { align: 'center' });
  doc.setTextColor(...COLORS.ink);
  doc.setFontSize(13);
  doc.text('PO Guard', margin + 16, 22.2);
  doc.setTextColor(...COLORS.muted);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('Automated purchase-order verification record', margin + 16, 27);

  const badgeWidth = confirmed ? 42 : 38;
  doc.setFillColor(...accent);
  doc.roundedRect(pageWidth - margin - badgeWidth, 15.5, badgeWidth, 9.5, 4.75, 4.75, 'F');
  doc.setTextColor(...COLORS.white);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text(statusTitle, pageWidth - margin - badgeWidth / 2, 21.5, { align: 'center' });

  doc.setDrawColor(...accent);
  doc.setFillColor(...accentPale);
  doc.roundedRect(margin, 38, contentWidth, 42, 4, 4, 'FD');
  doc.setTextColor(...accent);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text(confirmed ? 'VERIFICATION COMPLETE' : 'ATTENTION NEEDED', margin + 8, 48);
  doc.setTextColor(...COLORS.ink);
  doc.setFontSize(22);
  doc.text(confirmed ? 'Ready to confirm' : 'Review before confirming', margin + 8, 60);
  doc.setTextColor(...COLORS.muted);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(doc.splitTextToSize(statusDescription, contentWidth - 16), margin + 8, 69);

  const metadata = [
    ['PO number', poNumber],
    ['Supplier', result.extracted.supplierName ?? 'Not found'],
    ['Buyer', result.extracted.buyerName ?? 'Not found'],
    ['Order date', result.extracted.orderDate ?? 'Not found'],
    ['Catalog', options.catalogName],
    ['Catalog total', money(result.totals.catalog, result.conversion.to)]
  ];
  const columnWidth = contentWidth / 3;
  const rowHeight = 20;
  metadata.forEach(([label, value], index) => {
    const column = index % 3;
    const row = Math.floor(index / 3);
    const x = margin + column * columnWidth;
    const y = 88 + row * rowHeight;
    doc.setDrawColor(...COLORS.line);
    doc.setFillColor(...COLORS.white);
    doc.roundedRect(x + (column ? 2 : 0), y, columnWidth - 2, 16, 2, 2, 'FD');
    doc.setTextColor(...COLORS.muted);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.text(label!.toUpperCase(), x + 5, y + 5.5);
    doc.setTextColor(...COLORS.ink);
    doc.setFontSize(9);
    doc.text(doc.splitTextToSize(value!, columnWidth - 11).slice(0, 2), x + 5, y + 11.5);
  });

  doc.setTextColor(...COLORS.muted);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  doc.text(
    `PO total: ${money(result.totals.stated ?? result.totals.submitted, result.conversion.from)}  |  Converted PO: ${money(result.totals.submittedInCatalogCurrency, result.conversion.to)}  |  Catalog total: ${money(result.totals.catalog, result.conversion.to)}`,
    margin,
    128
  );

  doc.setTextColor(...COLORS.ink);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Verified line items', margin, 135);
  doc.setTextColor(...COLORS.muted);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(`${result.lines.length} item${result.lines.length === 1 ? '' : 's'} checked`, pageWidth - margin, 135, { align: 'right' });

  autoTable(doc, {
    startY: 140,
    margin: { left: margin, right: margin, bottom: 24 },
    theme: 'plain',
    head: [['SKU / DESCRIPTION', 'QTY', 'PO PRICE', 'CATALOG', 'EXPECTED', 'STATUS']],
    body: result.lines.map(line => [
      [line.sku, line.catalogDescription ?? line.description].filter(Boolean).join('\n'),
      String(line.quantity),
      result.conversion.from === result.conversion.to
        ? money(line.unitPrice, result.conversion.from)
        : `${money(line.unitPrice, result.conversion.from)}\n${money(line.convertedUnitPrice, result.conversion.to)} converted`,
      money(line.catalogUnitPrice, result.conversion.to),
      money(line.expectedLineTotal, result.conversion.to),
      line.status === 'matched' ? 'MATCHED' : 'REVIEW'
    ]),
    styles: { font: 'helvetica', fontSize: 7.5, cellPadding: 3.2, textColor: COLORS.ink, lineColor: COLORS.line, lineWidth: { bottom: 0.2 } },
    headStyles: { fillColor: COLORS.paper, textColor: COLORS.muted, fontStyle: 'bold', fontSize: 6.5 },
    columnStyles: {
      0: { cellWidth: 59 },
      1: { cellWidth: 12, halign: 'center' },
      2: { cellWidth: 27 },
      3: { cellWidth: 25 },
      4: { cellWidth: 27 },
      5: { cellWidth: 24, textColor: accent, fontStyle: 'bold' }
    }
  });

  const tableEnd = (doc as typeof doc & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 175;
  let detailY = tableEnd + 10;
  if (result.discrepancies.length) {
    doc.setTextColor(...COLORS.amber);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Discrepancies requiring review', margin, detailY);
    detailY += 4;
    autoTable(doc, {
      startY: detailY,
      margin: { left: margin, right: margin, bottom: 24 },
      theme: 'plain',
      body: result.discrepancies.map(issue => [issue.code.replaceAll('_', ' '), issue.message]),
      styles: { font: 'helvetica', fontSize: 7.5, cellPadding: 3, lineColor: [235, 205, 184], lineWidth: { bottom: 0.2 }, fillColor: COLORS.amberPale },
      columnStyles: { 0: { cellWidth: 42, fontStyle: 'bold', textColor: COLORS.amber }, 1: { textColor: [92, 76, 66] } }
    });
    detailY = ((doc as typeof doc & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? detailY) + 9;
  }

  if (detailY > pageHeight - 65) {
    doc.addPage();
    doc.setFillColor(...COLORS.paper);
    doc.rect(0, 0, pageWidth, pageHeight, 'F');
    detailY = 24;
  }

  doc.setFillColor(...COLORS.ink);
  doc.roundedRect(margin, detailY, contentWidth, 37, 3, 3, 'F');
  doc.setTextColor(201, 243, 106);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.text(confirmed ? 'CONFIRMATION' : 'RESULT', margin + 7, detailY + 8);
  doc.setTextColor(225, 232, 228);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(doc.splitTextToSize(result.confirmation, contentWidth - 14), margin + 7, detailY + 16);

  const recordY = detailY + 47;
  doc.setTextColor(...COLORS.ink);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('Analysis record', margin, recordY);
  doc.setTextColor(...COLORS.muted);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  doc.text(`Reference: ${result.id}`, margin, recordY + 6);
  doc.text(`Issued: ${issuedAt.toISOString()}`, margin, recordY + 11);
  doc.text(`Model: ${result.modelUsed}`, margin, recordY + 16);
  const fxText = result.conversion.from === result.conversion.to
    ? `Currency: ${result.conversion.to} (no conversion required)`
    : `FX: 1 ${result.conversion.from} = ${result.conversion.rate.toFixed(6)} ${result.conversion.to} | ${result.conversion.date ?? 'latest available'} | Frankfurter reference rate`;
  doc.text(fxText, margin, recordY + 21);

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page++) {
    doc.setPage(page);
    doc.setDrawColor(...COLORS.line);
    doc.line(margin, pageHeight - 16, pageWidth - margin, pageHeight - 16);
    doc.setTextColor(...COLORS.muted);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.text('Automated verification against the selected catalog. Human approval may still be required.', margin, pageHeight - 10);
    doc.text(`PO Guard | Page ${page} of ${pageCount}`, pageWidth - margin, pageHeight - 10, { align: 'right' });
  }

  const filename = `${safeFilename(poNumber) || 'purchase-order'}-${confirmed ? 'confirmed' : 'review'}-po-guard.pdf`;
  return { bytes: new Uint8Array(doc.output('arraybuffer')), filename };
}

export async function downloadConfirmationPdf(result: AnalysisResponse, options: PdfOptions) {
  const { bytes, filename } = await createConfirmationPdf(result, options);
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
