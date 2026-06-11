import React from 'react';
import { Page, Text, View, Document, StyleSheet, Image, Link, Font } from '@react-pdf/renderer';
import { Order } from '../../types';

// Register Roboto for a clean, professional look
Font.register({
  family: 'Roboto',
  fonts: [
    { src: 'https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-regular-webfont.ttf' },
    { src: 'https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-bold-webfont.ttf', fontWeight: 'bold' },
    { src: 'https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-medium-webfont.ttf', fontWeight: 'medium' },
  ],
});

const styles = StyleSheet.create({
  page: { 
    padding: 30, // Tighter padding to fit on one page
    fontSize: 9, 
    fontFamily: 'Roboto', 
    color: '#1F2937', 
    backgroundColor: '#FFFFFF',
    flexDirection: 'column',
    height: '100%'
  },
  
  // --- HEADER ---
  headerContainer: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  brandSection: { width: '60%' },
  logo: {
    // Box ratio matches the trimmed logo (1238x538 ≈ 2.30:1) so there's no side-padding —
    // the logo's left edge sits flush with the "Panda Patches" text column below it.
    width: 140,
    height: 61,
    objectFit: 'contain',
    marginBottom: 10
  },
  companyName: { fontSize: 12, fontWeight: 'bold', color: '#7C3AED', marginBottom: 4 }, // Zoho Purple
  companyInfo: {
    fontSize: 9,
    lineHeight: 1.3,
    color: '#374151'
  },
  invoiceTitleSection: {
    width: '40%',
    alignItems: 'flex-end',
    textAlign: 'right'
  },
  invoiceTitle: {
    fontSize: 32,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: '#1F2937',
    marginBottom: 2
  },
  invoiceNumber: {
    fontSize: 10,
    color: '#7C3AED',
    fontWeight: 'bold',
    marginBottom: 15
  },
  balanceDueHeader: {
    fontSize: 9,
    color: '#4B5563',
    marginBottom: 0
  },
  balanceDueAmount: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#000000'
  },

  // --- META GRID ---
  metaContainer: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20, marginTop: 10 },
  billToSection: { width: '55%' },
  sectionLabel: { fontSize: 8, textTransform: 'uppercase', color: '#9CA3AF', marginBottom: 4, fontWeight: 'bold' },
  billToName: { fontSize: 11, fontWeight: 'bold', color: '#4F46E5', marginBottom: 2 },
  billToAddress: { fontSize: 9, lineHeight: 1.3, color: '#374151' },
  datesSection: { width: '40%', alignItems: 'flex-end' },
  dateRow: { flexDirection: 'row', marginBottom: 3, justifyContent: 'flex-end', width: '100%' },
  dateLabel: { fontSize: 9, color: '#6B7280', textAlign: 'right', width: '60%', paddingRight: 8 },
  dateValue: { fontSize: 9, fontWeight: 'medium', textAlign: 'right', width: '40%' },

  // --- TABLE ---
  tableContainer: { marginTop: 10, marginBottom: 10 },
  tableHeader: { flexDirection: 'row', backgroundColor: '#1F2937', paddingVertical: 6, paddingHorizontal: 8, borderRadius: 2 },
  th: { color: '#FFFFFF', fontSize: 9, fontWeight: 'bold' },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#F3F4F6', paddingVertical: 10, paddingHorizontal: 8 },
  td: { fontSize: 9, color: '#374151' },
  col1: { width: '5%', textAlign: 'center' },
  col2: { width: '55%', textAlign: 'left' },
  col3: { width: '10%', textAlign: 'center' },
  col4: { width: '15%', textAlign: 'right' },
  col5: { width: '15%', textAlign: 'right' },

  // --- TOTALS ---
  totalsContainer: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 15 },
  totalsBox: { width: '40%', paddingLeft: 10 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  totalLabel: { fontSize: 9, color: '#6B7280' },
  totalValue: { fontSize: 9, color: '#1F2937', textAlign: 'right' },
  totalRowFinal: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8, marginTop: 4, paddingTop: 4, borderTopWidth: 1, borderTopColor: '#E5E7EB' },
  balanceDueBox: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#F3F4F6', padding: 8, marginTop: 8, borderRadius: 4 },

  // --- SPACER ---
  spacer: {
    flexGrow: 1, // This pushes the bank info down
  },

  // --- BANK INFO (COMPACT) ---
  bankContainer: {
    marginBottom: 30,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    width: '65%'
  },
  bankTitle: { fontSize: 9, fontWeight: 'bold', color: '#374151', marginBottom: 3 },
  bankSubTitle: { fontSize: 8, color: '#6B7280', marginBottom: 8, lineHeight: 1.3 },
  bankGrid: { flexDirection: 'column', gap: 8 },
  bankHeader: { fontSize: 8, fontWeight: 'bold', color: '#111827', marginBottom: 2, textTransform: 'uppercase' },
  bankDetail: { fontSize: 8, color: '#4B5563', lineHeight: 1.3 },

  // --- FOOTER ---
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 30,
    right: 30,
    textAlign: 'center',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingTop: 10
  },
  footerText: {
    fontSize: 8,
    color: '#9CA3AF'
  },
  link: { color: '#7C3AED', textDecoration: 'none' },

  // --- PAID / STATUS ---
  paidStamp: {
    position: 'absolute',
    top: 150,
    right: 55,
    borderWidth: 3,
    borderColor: '#16A34A',
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 16,
    transform: 'rotate(-16deg)',
  },
  paidStampText: { fontSize: 26, fontWeight: 'bold', color: '#16A34A', letterSpacing: 3 },
  paidStampSub: { fontSize: 7, color: '#16A34A', textAlign: 'center', marginTop: 1 },
  statusPill: {
    alignSelf: 'flex-end',
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 10,
    marginTop: 2,
  },
  statusPillText: { fontSize: 9, fontWeight: 'bold' },
});

// Format a date the same way across the invoice.
const fmtDate = (d?: string | null) => {
  const dt = d ? new Date(d) : new Date();
  return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

interface InvoiceProps {
  order: Order;
  poNumber: string;
  companyName: string;
  logoUrl?: string | null;
}

const InvoiceDocument: React.FC<InvoiceProps> = ({ order, poNumber, companyName, logoUrl }) => {
  const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); 
  const qty = order.patchesQuantity || 1;

  // --- REFACTORED MATH LOGIC ---
  const rate = Number(((order.orderAmount || 0) / qty).toFixed(2)); // Calculate rate first with rounding
  const amount = rate * qty; // Derive the final amount from the rounded rate
  const amountPaid = order.amountPaid || 0;
  const balanceDue = Math.max(0, amount - amountPaid); // Recalculate balance due based on the derived amount

  // Payment state — drives the PAID stamp and the totals breakdown.
  const isPaid = amountPaid > 0 && balanceDue <= 0;           // fully paid
  const isPartiallyPaid = amountPaid > 0 && balanceDue > 0;   // deposit / partial


  return (
    <Document>
      <Page size="A4" style={styles.page}>

        {/* PAID STAMP — only when fully paid */}
        {isPaid && (
          <View style={styles.paidStamp}>
            <Text style={styles.paidStampText}>PAID</Text>
            <Text style={styles.paidStampSub}>{fmtDate(order.updatedAt)}</Text>
          </View>
        )}

        {/* HEADER */}
        <View style={styles.headerContainer}>
          <View style={styles.brandSection}>
            {logoUrl && <Image src={logoUrl} style={styles.logo} />}
            
            <Text style={styles.companyName}>Panda Patches</Text>
            <Text style={styles.companyInfo}>Austin Texas 78702</Text>
            <Text style={styles.companyInfo}>U.S.A</Text>
            <Text style={styles.companyInfo}>3022504340</Text>
            <Text style={styles.companyInfo}>lance@pandapatches.com</Text>
            <Link src="https://www.pandapatches.com" style={[styles.companyInfo, styles.link]}>www.pandapatches.com</Link>
          </View>

          <View style={styles.invoiceTitleSection}>
            <Text style={styles.invoiceTitle}>INVOICE</Text>
            <Text style={styles.invoiceNumber}># INV-{order.orderNumber.replace('PP-', '')}</Text>
            <Text style={styles.balanceDueHeader}>{isPaid ? 'Amount Paid' : 'Balance Due'}</Text>
            <Text style={[styles.balanceDueAmount, isPaid ? { color: '#16A34A' } : {}]}>
              ${(isPaid ? amountPaid : balanceDue).toLocaleString()}
            </Text>
            <View style={[
              styles.statusPill,
              { backgroundColor: isPaid ? '#DCFCE7' : isPartiallyPaid ? '#FEF3C7' : '#FEE2E2' },
            ]}>
              <Text style={[
                styles.statusPillText,
                { color: isPaid ? '#16A34A' : isPartiallyPaid ? '#B45309' : '#DC2626' },
              ]}>
                {isPaid ? 'PAID' : isPartiallyPaid ? 'PARTIALLY PAID' : 'UNPAID'}
              </Text>
            </View>
          </View>
        </View>

        {/* META GRID */}
        <View style={styles.metaContainer}>
          <View style={styles.billToSection}>
            <Text style={styles.sectionLabel}>Bill To</Text>
            <Text style={styles.billToName}>{companyName || order.customerName}</Text>
            <Text style={styles.billToAddress}>{order.shippingAddress || 'No address provided'}</Text>
          </View>
          <View style={styles.datesSection}>
            <View style={styles.dateRow}><Text style={styles.dateLabel}>Invoice Date :</Text><Text style={styles.dateValue}>{date}</Text></View>
            {poNumber ? (
              <View style={styles.dateRow}><Text style={styles.dateLabel}>P.O. Number :</Text><Text style={styles.dateValue}>{poNumber}</Text></View>
            ) : null}
            <View style={styles.dateRow}><Text style={styles.dateLabel}>Terms :</Text><Text style={styles.dateValue}>Due on Receipt</Text></View>
            <View style={styles.dateRow}><Text style={styles.dateLabel}>Due Date :</Text><Text style={styles.dateValue}>{isPaid ? '—' : date}</Text></View>
          </View>
        </View>

        {/* TABLE */}
        <View style={styles.tableContainer}>
          <View style={styles.tableHeader}>
            <Text style={[styles.th, styles.col1]}>#</Text>
            <Text style={[styles.th, styles.col2]}>Description</Text>
            <Text style={[styles.th, styles.col3]}>Qty</Text>
            <Text style={[styles.th, styles.col4]}>Rate</Text>
            <Text style={[styles.th, styles.col5]}>Amount</Text>
          </View>
          <View style={styles.tableRow}>
            <Text style={[styles.td, styles.col1]}>1</Text>
            <View style={styles.col2}>
              <Text style={{ fontWeight: 'bold' }}>{order.designName || 'Custom Design'}</Text>
              <Text style={{ fontSize: 8, color: '#6B7280', marginTop: 2 }}>{order.patchesType} - {order.designBacking}</Text>
              {poNumber && <Text style={{ fontSize: 8, color: '#6B7280' }}>PO # {poNumber}</Text>}
            </View>
            <Text style={[styles.td, styles.col3]}>{qty}</Text>
            <Text style={[styles.td, styles.col4]}>{Number(rate).toLocaleString()}</Text>
            <Text style={[styles.td, styles.col5]}>{amount.toLocaleString()}</Text>
          </View>
        </View>

        {/* TOTALS */}
        <View style={styles.totalsContainer}>
            <View style={styles.totalsBox}>
                <View style={styles.totalRow}><Text style={styles.totalLabel}>Sub Total</Text><Text style={styles.totalValue}>{amount.toLocaleString()}</Text></View>
                <View style={styles.totalRowFinal}><Text style={[styles.totalLabel, {fontWeight: 'bold', color: '#000'}]}>Total</Text><Text style={{fontWeight: 'bold'}}>${amount.toLocaleString()}</Text></View>
                {amountPaid > 0 && (
                  <View style={styles.totalRow}>
                    <Text style={[styles.totalLabel, { color: '#16A34A' }]}>Amount Paid</Text>
                    <Text style={[styles.totalValue, { color: '#16A34A' }]}>-${amountPaid.toLocaleString()}</Text>
                  </View>
                )}
                <View style={[styles.balanceDueBox, isPaid ? { backgroundColor: '#DCFCE7' } : {}]}>
                  <Text style={{fontWeight: 'bold', fontSize: 10, color: isPaid ? '#16A34A' : '#000'}}>{isPaid ? 'Balance Due (Paid)' : 'Balance Due'}</Text>
                  <Text style={{fontWeight: 'bold', fontSize: 10, color: isPaid ? '#16A34A' : '#000'}}>${balanceDue.toLocaleString()}</Text>
                </View>
            </View>
        </View>

        <View style={styles.spacer} />

        {/* BANK INFO — payment instructions only when there's still a balance.
            A fully-paid invoice reads as a receipt, so we show a thank-you instead. */}
        {isPaid ? (
          <View style={styles.bankContainer}>
            <Text style={[styles.bankTitle, { color: '#16A34A' }]}>Payment Received — Thank You!</Text>
            <Text style={styles.bankSubTitle}>
              This invoice has been paid in full. No further payment is due. We appreciate your business.
            </Text>
          </View>
        ) : (
          <View style={styles.bankContainer}>
             <Text style={styles.bankTitle}>MC Patches LLC Domestic Transfer Details</Text>
             <Text style={styles.bankSubTitle}>Use these details to send both domestic wires and ACH transfers to MC Patches LLC.</Text>

             <View style={styles.bankGrid}>
               <View>
                 <Text style={styles.bankHeader}>BENEFICIARY</Text>
                 <Text style={styles.bankDetail}>Name: MC Patches LLC</Text>
                 <Text style={styles.bankDetail}>Account: 840159134183341 (Checking)</Text>
                 <Text style={styles.bankDetail}>Address: 701 Tillery St Ste 12, Austin, TX 78702-3751, US</Text>
               </View>
               <View>
                 <Text style={styles.bankHeader}>RECEIVING BANK</Text>
                 <Text style={styles.bankDetail}>Bank: Column Bank (ABA: 121145307)</Text>
                 <Text style={styles.bankDetail}>Address: 1110 Gorgas Avenue, Suite A4-700, San Francisco, CA 94129, US</Text>
               </View>
             </View>
          </View>
        )}

        <View style={styles.footer}>
           <Text style={styles.footerText}>Crafted with ease using Panda Patches CRM</Text>
           <Link src="https://www.pandapatches.com" style={[styles.footerText, styles.link, { marginTop: 2 }]}>Visit pandapatches.com</Link>
        </View>

      </Page>
    </Document>
  );
};

export default InvoiceDocument;