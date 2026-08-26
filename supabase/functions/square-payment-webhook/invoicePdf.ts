// supabase/functions/square-payment-webhook/invoicePdf.ts
// Builds a simple, server-renderable PAID invoice PDF for the auto-email sent on full payment
// (CL0FAA §2). There is no server-side (Deno) equivalent of the staff-facing @react-pdf/renderer
// invoice (src/components/invoices/InvoiceDocument.tsx) — that component's PDFDownloadLink is
// browser-only. pdf-lib has zero runtime dependencies and is imported via the native `npm:`
// specifier (a different code path from the esm.sh bundling that crashed this webhook once on a
// Node `ws` shim — see the header comment in index.ts — so it doesn't carry that risk).
import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'npm:pdf-lib@1.17.1';

export interface PaidInvoicePdfParams {
  invoiceNumber: string;      // e.g. "INV-PP-11248"
  customerName: string;
  shippingAddress?: string | null;
  designName?: string | null;
  patchesType?: string | null;
  patchesQuantity?: number | null;
  designBacking?: string | null;
  orderAmount: number;
  amountPaid: number;
  paymentMethod: string;      // e.g. "Card via Square"
  squarePaymentId: string;
  paidAt: Date;
}

const PAGE_W = 595.28; // A4 @ 72dpi
const PAGE_H = 841.89;
const MARGIN = 40;
const PURPLE = rgb(0.486, 0.227, 0.929);    // #7C3AED
const DARK = rgb(0.122, 0.161, 0.216);      // #1F2937
const GRAY = rgb(0.42, 0.447, 0.502);       // #6B7280
const LIGHT_GRAY = rgb(0.61, 0.639, 0.686); // #9CA3AF
const GREEN = rgb(0.086, 0.639, 0.29);      // #16A34A
const GREEN_BG = rgb(0.863, 0.988, 0.906);  // #DCFCE7
const WHITE = rgb(1, 1, 1);

function fmtMoney(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export async function buildPaidInvoicePdf(params: PaidInvoicePdfParams): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([PAGE_W, PAGE_H]);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const textAt = (str: string, x: number, y: number, size: number, font: PDFFont, color = DARK) => {
    page.drawText(str, { x, y, size, font, color });
  };
  const rightAlign = (str: string, rightX: number, y: number, size: number, font: PDFFont, color = DARK) => {
    const w = font.widthOfTextAtSize(str, size);
    page.drawText(str, { x: rightX - w, y, size, font, color });
  };

  const rightX = PAGE_W - MARGIN;

  // --- HEADER: company block (left) + INVOICE title / PAID pill (right) ---
  const headerTop = PAGE_H - MARGIN;
  textAt('Panda Patches', MARGIN, headerTop, 14, bold, PURPLE);
  textAt('Austin Texas 78702', MARGIN, headerTop - 16, 9, regular, GRAY);
  textAt('U.S.A', MARGIN, headerTop - 28, 9, regular, GRAY);
  textAt('3022504340', MARGIN, headerTop - 40, 9, regular, GRAY);
  textAt('lance@pandapatches.com', MARGIN, headerTop - 52, 9, regular, GRAY);

  rightAlign('INVOICE', rightX, headerTop - 6, 26, bold, DARK);
  rightAlign(`# ${params.invoiceNumber}`, rightX, headerTop - 30, 10, bold, PURPLE);
  rightAlign('Amount Paid', rightX, headerTop - 46, 9, regular, GRAY);
  rightAlign(`$${fmtMoney(params.amountPaid)}`, rightX, headerTop - 66, 20, bold, GREEN);

  // PAID pill — a clean badge, not a rotated stamp (matches the house invoice style).
  const pillW = 50, pillH = 16, pillX = rightX - pillW, pillY = headerTop - 86;
  page.drawRectangle({ x: pillX, y: pillY, width: pillW, height: pillH, color: GREEN_BG });
  const pillTextW = bold.widthOfTextAtSize('PAID', 9);
  textAt('PAID', pillX + (pillW - pillTextW) / 2, pillY + 4.5, 9, bold, GREEN);

  // --- META GRID: Bill To (left) + payment details (right) ---
  const metaTop = headerTop - 120;
  textAt('BILL TO', MARGIN, metaTop, 8, bold, LIGHT_GRAY);
  textAt(params.customerName || 'Customer', MARGIN, metaTop - 14, 11, bold, rgb(0.31, 0.275, 0.898));
  let leftY = metaTop - 28;
  if (params.shippingAddress) {
    const addr = params.shippingAddress;
    const lines = addr.length > 70 ? [addr.slice(0, 70), addr.slice(70, 140)] : [addr];
    for (const line of lines) {
      textAt(line, MARGIN, leftY, 9, regular, DARK);
      leftY -= 12;
    }
  }

  let rightY = metaTop;
  const drawDateRow = (label: string, value: string) => {
    textAt(label, rightX - 160, rightY, 9, regular, GRAY);
    rightAlign(value, rightX, rightY, 9, bold, DARK);
    rightY -= 14;
  };
  drawDateRow('Invoice Date :', fmtDate(params.paidAt));
  drawDateRow('Payment Method :', params.paymentMethod);
  drawDateRow('Payment Ref :', params.squarePaymentId);
  drawDateRow('Terms :', 'Paid in Full');

  // --- LINE ITEM TABLE ---
  const tableTop = Math.min(leftY, rightY) - 20;
  const col = { num: MARGIN, desc: MARGIN + 25, qty: rightX - 170, rate: rightX - 110 };
  page.drawRectangle({ x: MARGIN, y: tableTop - 18, width: PAGE_W - MARGIN * 2, height: 18, color: DARK });
  textAt('#', col.num + 4, tableTop - 13, 9, bold, WHITE);
  textAt('Description', col.desc, tableTop - 13, 9, bold, WHITE);
  textAt('Qty', col.qty, tableTop - 13, 9, bold, WHITE);
  textAt('Rate', col.rate, tableTop - 13, 9, bold, WHITE);
  rightAlign('Amount', rightX, tableTop - 13, 9, bold, WHITE);

  const qty = params.patchesQuantity || 1;
  const rate = qty > 0 ? params.orderAmount / qty : params.orderAmount;
  const desc = params.designName || 'Custom Design';
  const subDesc = [params.patchesType, params.designBacking].filter(Boolean).join(' - ');

  let rowY = tableTop - 18 - 22;
  textAt('1', col.num + 4, rowY, 9, regular, DARK);
  textAt(desc, col.desc, rowY, 9, bold, DARK);
  textAt(String(qty), col.qty, rowY, 9, regular, DARK);
  textAt(fmtMoney(rate), col.rate, rowY, 9, regular, DARK);
  rightAlign(fmtMoney(params.orderAmount), rightX, rowY, 9, regular, DARK);
  if (subDesc) {
    rowY -= 12;
    textAt(subDesc, col.desc, rowY, 8, regular, GRAY);
  }
  rowY -= 12;
  textAt('Shipping: Included  ·  Tax: $0.00', col.desc, rowY, 8, regular, GRAY);

  const ruleY = rowY - 20;
  page.drawLine({ start: { x: MARGIN, y: ruleY }, end: { x: rightX, y: ruleY }, thickness: 0.5, color: rgb(0.9, 0.9, 0.92) });

  // --- TOTALS ---
  const totalsX = rightX - 200;
  let totalsY = ruleY - 20;
  textAt('Sub Total', totalsX, totalsY, 9, regular, GRAY);
  rightAlign(fmtMoney(params.orderAmount), rightX, totalsY, 9, regular, DARK);
  totalsY -= 16;
  textAt('Total', totalsX, totalsY, 9, bold, DARK);
  rightAlign(`$${fmtMoney(params.orderAmount)}`, rightX, totalsY, 10, bold, DARK);
  totalsY -= 16;
  textAt('Amount Paid', totalsX, totalsY, 9, regular, GREEN);
  rightAlign(`-$${fmtMoney(params.amountPaid)}`, rightX, totalsY, 9, regular, GREEN);
  totalsY -= 20;

  page.drawRectangle({ x: totalsX - 10, y: totalsY - 6, width: rightX - (totalsX - 10), height: 22, color: GREEN_BG });
  textAt('Balance Due (Paid)', totalsX, totalsY, 10, bold, GREEN);
  rightAlign('$0.00', rightX, totalsY, 10, bold, GREEN);

  // --- FOOTER ---
  const footerY = MARGIN + 30;
  page.drawLine({ start: { x: MARGIN, y: footerY + 14 }, end: { x: rightX, y: footerY + 14 }, thickness: 0.5, color: rgb(0.9, 0.9, 0.92) });
  textAt('Payment Received — Thank You!', MARGIN, footerY, 9, bold, GREEN);
  textAt('This invoice has been paid in full. No further payment is due. We appreciate your business.', MARGIN, footerY - 12, 8, regular, GRAY);

  return doc.save();
}
