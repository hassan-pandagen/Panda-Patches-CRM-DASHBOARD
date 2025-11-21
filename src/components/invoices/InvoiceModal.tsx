import React, { useState } from 'react';
import { PDFDownloadLink } from '@react-pdf/renderer';
import InvoiceDocument from './InvoiceDocument';
import { Order } from '../../types';
import { X, FileText, Download } from 'lucide-react';

interface InvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: Order;
}

const InvoiceModal: React.FC<InvoiceModalProps> = ({ isOpen, onClose, order }) => {
  const [companyName, setCompanyName] = useState(order.customerName);
  const [poNumber, setPoNumber] = useState('');

  // --- FIX: CORRECT LOGO URL (Removed extra 'public' segment) ---
  const logoUrl = "https://uxgzlneefybifvccfhwp.supabase.co/storage/v1/object/public/logos/company-logo-1763645030861.png";

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-xl shadow-2xl max-w-md w-full">
        
        <div className="p-6 border-b border-slate-700 flex justify-between items-center">
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <FileText className="w-5 h-5 text-brand-orange" />
            Generate Invoice
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
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
              {({ loading }) => (loading ? 'Generating PDF...' : <><Download className="w-5 h-5" /> Download Invoice</>)}
            </PDFDownloadLink>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InvoiceModal;