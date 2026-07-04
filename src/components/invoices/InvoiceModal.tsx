import React, { useState, useId } from 'react';
import { PDFDownloadLink } from '@react-pdf/renderer';
import InvoiceDocument from './InvoiceDocument';
import Modal from '../ui/Modal';
import { Order } from '../../types';
import { X, FileText, Download } from 'lucide-react';
// Dark logo for the white invoice (bundled via Vite — same-origin URL, can't 404 like the old one).
import invoiceLogo from '../../assets/invoice-logo.png';

interface InvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: Order;
}

const InvoiceModal: React.FC<InvoiceModalProps> = ({ isOpen, onClose, order }) => {
  const titleId = useId();
  const [companyName, setCompanyName] = useState(order.customerName);
  // Pre-fill from the order's saved Purchase Order field; agent can still edit/override.
  const [poNumber, setPoNumber] = useState(order.purchaseOrder || '');

  // Bundled dark logo (imported above) — resolves to a hashed same-origin asset URL in prod.
  const logoUrl = invoiceLogo;

  return (
    <Modal isOpen={isOpen} onClose={onClose} labelledBy={titleId} size="sm">
      <div>
        <div className="p-6 border-b border-slate-700 flex justify-between items-center">
          <h3 id={titleId} className="text-xl font-bold text-white flex items-center gap-2">
            <FileText className="w-5 h-5 text-brand-orange" />
            Generate Invoice
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white" aria-label="Close">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Bill To (Company/Customer)</label>
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="w-full px-4 py-2 bg-slate-900/50 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-brand-orange"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">PO Number (Optional)</label>
            <input
              type="text"
              value={poNumber}
              onChange={(e) => setPoNumber(e.target.value)}
              placeholder="e.g. PO-148243"
              className="w-full px-4 py-2 bg-slate-900/50 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-brand-orange"
            />
          </div>

          <div className="pt-4">
            <PDFDownloadLink
              document={
                <InvoiceDocument
                    order={order}
                    companyName={companyName}
                    poNumber={poNumber}
                    logoUrl={logoUrl}
                />
              }
              fileName={`Invoice-${order.orderNumber}.pdf`}
              className="flex items-center justify-center gap-2 w-full py-3 bg-brand-orange hover:bg-orange-600 text-white font-bold rounded-lg transition-colors"
            >
              {(({ loading }: { loading: boolean }) => (loading ? 'Generating PDF...' : <><Download className="w-5 h-5" /> Download Invoice</>)) as any}
            </PDFDownloadLink>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default InvoiceModal;
