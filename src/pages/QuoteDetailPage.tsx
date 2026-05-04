// src/pages/QuoteDetailPage.tsx - Quote Detail View with Edit + Convert Flow

import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getQuoteByNumber, updateQuote, convertQuoteToOrder, deleteQuote, sendQuoteEmail, markQuoteAsSent } from '../services/quoteService';
import { queryKeys } from '../constants/queryKeys';
import { PATCHES_TYPE_OPTIONS } from '../constants/index';
import Button from '../components/ui/Button';
import Skeleton from '../components/ui/Skeleton';
import SpotlightCard from '../components/ui/SpotlightCard';
import { useToast } from '../hooks/useToast';
import { ArrowLeft, CheckCircle, Trash2, Calendar, Mail, Phone, Paperclip, Image, Pencil, X, AlertTriangle, DollarSign, ExternalLink, MailCheck, Send } from 'lucide-react';
import MetaChatPanel from '../components/quotes/MetaChatPanel';

// ─── SELECT STYLE ────────────────────────────────────────────────────────────
const selectStyle = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23ea580c' d='M10.293 3.293L6 7.586 1.707 3.293A1 1 0 00.293 4.707l5 5a1 1 0 001.414 0l5-5a1 1 0 10-1.414-1.414z'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat' as const,
  backgroundPosition: 'right 0.75rem center',
  paddingRight: '2.5rem',
};

const inputClass = "w-full bg-slate-800/50 border border-slate-600 text-white rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-brand-orange/50 focus:border-brand-orange transition-all placeholder-slate-400";
const selectClass = "w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-brand-orange/50 focus:border-brand-orange transition-all appearance-none cursor-pointer hover:border-slate-500";
const labelClass = "block text-sm font-medium text-slate-300 mb-1.5";

// ─── COMPONENT ────────────────────────────────────────────────────────────────
const QuoteDetailPage: React.FC = () => {
  const { quoteNumber } = useParams<{ quoteNumber: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { success: showSuccess, error: showError } = useToast();

  const [showEditModal, setShowEditModal] = useState(false);
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [isMarkingSent, setIsMarkingSent] = useState(false);

  // Edit form state
  const [editForm, setEditForm] = useState<Record<string, string>>({});

  // Convert modal price override
  const [convertPrice, setConvertPrice] = useState('');

  const { data: quote, isLoading, error } = useQuery({
    queryKey: queryKeys.quotes.single(quoteNumber || ''),
    queryFn: () => quoteNumber ? getQuoteByNumber(quoteNumber) : Promise.reject('No quote number'),
    enabled: !!quoteNumber,
  });

  // ─── OPEN EDIT MODAL ───────────────────────────────────────────────────────
  const openEditModal = () => {
    if (!quote) return;
    setEditForm({
      customerName: quote.customerName || '',
      customerEmail: quote.customerEmail || '',
      customerPhone: quote.customerPhone || '',
      customerProfileUrl: quote.customerProfileUrl || '',
      designName: quote.designName || '',
      patchesQuantity: quote.patchesQuantity?.toString() || '',
      patchesType: quote.patchesType || '',
      designSize: quote.designSize || '',
      designBacking: quote.designBacking || '',
      instructions: quote.instructions || '',
      estimatedAmount: quote.estimatedAmount?.toString() || '',
      salesAgent: quote.salesAgent || '',
      leadSource: quote.leadSource || '',
      notes: quote.notes || '',
    });
    setShowEditModal(true);
  };

  // ─── SAVE EDIT ─────────────────────────────────────────────────────────────
  const handleSaveEdit = async () => {
    if (!quote) return;
    setIsSaving(true);
    try {
      await updateQuote(quote.quoteNumber, {
        customerName: editForm.customerName,
        customerEmail: editForm.customerEmail,
        customerPhone: editForm.customerPhone,
        customerProfileUrl: editForm.customerProfileUrl,
        designName: editForm.designName,
        patchesQuantity: editForm.patchesQuantity ? Number(editForm.patchesQuantity) : undefined,
        patchesType: editForm.patchesType,
        designSize: editForm.designSize,
        designBacking: editForm.designBacking,
        instructions: editForm.instructions,
        estimatedAmount: editForm.estimatedAmount ? Number(editForm.estimatedAmount) : undefined,
        salesAgent: editForm.salesAgent,
        leadSource: editForm.leadSource,
        notes: editForm.notes,
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.quotes.single(quote.quoteNumber) });
      showSuccess('Quote updated successfully');
      setShowEditModal(false);
    } catch (err) {
      showError(`Failed to save: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsSaving(false);
    }
  };

  // ─── OPEN CONVERT MODAL ────────────────────────────────────────────────────
  const openConvertModal = () => {
    if (!quote) return;
    setConvertPrice(quote.estimatedAmount?.toString() || '');
    setShowConvertModal(true);
  };

  // ─── CONFIRM CONVERT ───────────────────────────────────────────────────────
  const handleConfirmConvert = async () => {
    if (!quote) return;
    setConvertingId(quote.quoteNumber);
    try {
      // If price was changed in the modal, update quote first
      const priceChanged = convertPrice !== '' && Number(convertPrice) !== (quote.estimatedAmount || 0);
      const quoteToConvert = priceChanged
        ? await updateQuote(quote.quoteNumber, { estimatedAmount: Number(convertPrice) })
        : quote;

      const order = await convertQuoteToOrder(quoteToConvert);
      showSuccess(`Quote converted to Order ${order.orderNumber} — emails sent!`);
      setShowConvertModal(false);
      navigate(`/order/${order.orderNumber}`);
    } catch (err) {
      showError(`Failed to convert: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setConvertingId(null);
    }
  };

  // ─── DELETE ────────────────────────────────────────────────────────────────
  const handleDeleteQuote = async () => {
    if (!quote) return;
    if (!window.confirm(`Are you sure you want to delete quote ${quote.quoteNumber}?`)) return;
    setDeletingId(quote.quoteNumber);
    try {
      await deleteQuote(quote.quoteNumber);
      showSuccess(`Quote ${quote.quoteNumber} deleted`);
      navigate('/quotes');
    } catch (err) {
      showError(`Failed to delete: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setDeletingId(null);
    }
  };

  // ─── LOADING / ERROR ───────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-6 min-h-screen pb-10">
        <Skeleton width={150} height={36} />
        <Skeleton width="100%" height={500} />
      </div>
    );
  }

  if (error || !quote) {
    return (
      <div className="text-center py-10">
        <p className="text-red-400">Quote not found</p>
        <Button variant="primary" onClick={() => navigate('/quotes')} className="mt-4">
          Back to Quotes
        </Button>
      </div>
    );
  }

  const daysAgo = Math.floor(
    (Date.now() - new Date(quote.createdAt).getTime()) / (1000 * 60 * 60 * 24)
  );

  return (
    <div className="space-y-6 min-h-screen pb-10">

      {/* ─── EDIT QUOTE MODAL ─────────────────────────────────────────────── */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 backdrop-blur-sm overflow-y-auto py-8 px-4">
          <div className="w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-slate-700">
              <div>
                <h2 className="text-xl font-bold text-white">Edit Quote</h2>
                <p className="text-slate-400 text-sm mt-0.5">{quote.quoteNumber}</p>
              </div>
              <button onClick={() => setShowEditModal(false)} className="p-2 hover:bg-slate-800 rounded-lg transition-colors">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">

              {/* Customer Info */}
              <div>
                <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Customer Information</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>Name *</label>
                    <input className={inputClass} value={editForm.customerName} onChange={e => setEditForm(p => ({ ...p, customerName: e.target.value }))} placeholder="Full name" />
                  </div>
                  <div>
                    <label className={labelClass}>Email *</label>
                    <input className={inputClass} type="email" value={editForm.customerEmail} onChange={e => setEditForm(p => ({ ...p, customerEmail: e.target.value }))} placeholder="email@example.com" />
                  </div>
                  <div>
                    <label className={labelClass}>Phone</label>
                    <input className={inputClass} type="tel" value={editForm.customerPhone} onChange={e => setEditForm(p => ({ ...p, customerPhone: e.target.value }))} placeholder="(555) 123-4567" />
                  </div>
                  <div>
                    <label className={labelClass}>Profile URL</label>
                    <input className={inputClass} value={editForm.customerProfileUrl} onChange={e => setEditForm(p => ({ ...p, customerProfileUrl: e.target.value }))} placeholder="https://..." />
                  </div>
                </div>
              </div>

              {/* Design Details */}
              <div>
                <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Design Details</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>Design Name</label>
                    <input className={inputClass} value={editForm.designName} onChange={e => setEditForm(p => ({ ...p, designName: e.target.value }))} placeholder="e.g., Logo Design" />
                  </div>
                  <div>
                    <label className={labelClass}>Quantity</label>
                    <input className={inputClass} type="number" min="1" value={editForm.patchesQuantity} onChange={e => setEditForm(p => ({ ...p, patchesQuantity: e.target.value }))} placeholder="100" />
                  </div>
                  <div>
                    <label className={labelClass}>Patch Type</label>
                    <select className={selectClass} style={selectStyle} value={editForm.patchesType} onChange={e => setEditForm(p => ({ ...p, patchesType: e.target.value }))}>
                      <option value="">Select type...</option>
                      {PATCHES_TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Size</label>
                    <input className={inputClass} value={editForm.designSize} onChange={e => setEditForm(p => ({ ...p, designSize: e.target.value }))} placeholder="4x2" />
                  </div>
                  <div className="col-span-2">
                    <label className={labelClass}>Backing</label>
                    <select className={selectClass} style={selectStyle} value={editForm.designBacking} onChange={e => setEditForm(p => ({ ...p, designBacking: e.target.value }))}>
                      <option value="">Select backing...</option>
                      <option value="iron">Iron On</option>
                      <option value="sew">Sew On</option>
                      <option value="velcro">Velcro</option>
                      <option value="adhesive">Adhesive</option>
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className={labelClass}>Special Instructions</label>
                    <textarea className={inputClass} rows={3} value={editForm.instructions} onChange={e => setEditForm(p => ({ ...p, instructions: e.target.value }))} placeholder="Any special requirements..." />
                  </div>
                </div>
              </div>

              {/* Pricing & Sales */}
              <div>
                <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Pricing & Sales</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>Quote Amount ($)</label>
                    <input className={inputClass} type="number" step="0.01" min="0" value={editForm.estimatedAmount} onChange={e => setEditForm(p => ({ ...p, estimatedAmount: e.target.value }))} placeholder="0.00" />
                  </div>
                  <div>
                    <label className={labelClass}>Lead Source</label>
                    <input className={inputClass} value={editForm.leadSource} onChange={e => setEditForm(p => ({ ...p, leadSource: e.target.value }))} placeholder="e.g., Google, Referral" />
                  </div>
                  <div className="col-span-2">
                    <label className={labelClass}>Sales Agent</label>
                    <input className={inputClass} value={editForm.salesAgent} onChange={e => setEditForm(p => ({ ...p, salesAgent: e.target.value }))} />
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className={labelClass}>Internal Notes</label>
                <textarea className={inputClass} rows={3} value={editForm.notes} onChange={e => setEditForm(p => ({ ...p, notes: e.target.value }))} placeholder="Internal notes only..." />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex gap-3 p-6 border-t border-slate-700">
              <Button variant="secondary" onClick={() => setShowEditModal(false)} className="flex-1 bg-slate-800 border border-slate-600 text-white hover:bg-slate-700">
                Cancel
              </Button>
              <Button variant="primary" onClick={handleSaveEdit} disabled={isSaving} className="flex-1 shadow-lg shadow-brand-orange/20">
                {isSaving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ─── CONVERT CONFIRMATION MODAL ───────────────────────────────────── */}
      {showConvertModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-slate-700">
              <h2 className="text-xl font-bold text-white">Confirm & Convert</h2>
              <button onClick={() => setShowConvertModal(false)} className="p-2 hover:bg-slate-800 rounded-lg transition-colors">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            {/* Summary */}
            <div className="p-6 space-y-4">
              {/* Email warning */}
              <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
                <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-amber-300 font-semibold text-sm">Emails will be sent immediately</p>
                  <p className="text-amber-400/80 text-xs mt-1">
                    Confirmation email → <span className="font-medium">{quote.customerEmail}</span><br />
                    Production alert → internal team
                  </p>
                </div>
              </div>

              {/* Order summary */}
              <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">Customer</span>
                  <span className="text-white font-medium">{quote.customerName}</span>
                </div>
                {quote.patchesQuantity && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Quantity</span>
                    <span className="text-white">{quote.patchesQuantity} pcs</span>
                  </div>
                )}
                {quote.patchesType && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Type</span>
                    <span className="text-white">{quote.patchesType}</span>
                  </div>
                )}
                {quote.designSize && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Size</span>
                    <span className="text-white">{quote.designSize}</span>
                  </div>
                )}
              </div>

              {/* Price field — most important, editable */}
              <div>
                <label className="block text-sm font-semibold text-white mb-2 flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-brand-orange" />
                  Order Amount
                  {!convertPrice && <span className="text-xs text-red-400 font-normal">(required before converting)</span>}
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={convertPrice}
                  onChange={e => setConvertPrice(e.target.value)}
                  className={`${inputClass} text-lg font-bold ${!convertPrice ? 'border-amber-500/50 focus:border-amber-500' : ''}`}
                  placeholder="Enter order amount..."
                  autoFocus
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex gap-3 p-6 border-t border-slate-700">
              <Button variant="secondary" onClick={() => setShowConvertModal(false)} className="flex-1 bg-slate-800 border border-slate-600 text-white hover:bg-slate-700">
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleConfirmConvert}
                disabled={!convertPrice || convertingId === quote.quoteNumber}
                className="flex-1 shadow-lg shadow-brand-orange/20"
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                {convertingId ? 'Converting...' : 'Confirm & Convert'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ─── IMAGE PREVIEW MODAL ─────────────────────────────────────────── */}
      {previewUrl && (
        <div
          className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setPreviewUrl(null)}
        >
          <div
            className="bg-slate-900 rounded-xl border border-white/10 max-w-4xl max-h-[90vh] overflow-auto shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Image Preview</h3>
              <div className="flex items-center gap-2">
                <a
                  href={previewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Open original
                </a>
                <button
                  onClick={() => setPreviewUrl(null)}
                  className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="p-4 flex items-center justify-center">
              <img
                src={previewUrl}
                alt="Preview"
                className="max-w-full max-h-[75vh] rounded-lg object-contain"
              />
            </div>
          </div>
        </div>
      )}

      {/* ─── HEADER ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/quotes')}
          className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-slate-300" />
        </button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold text-white">Quote {quote.quoteNumber}</h1>
          <p className="text-slate-300 text-sm mt-1">
            Created {daysAgo === 0 ? 'today' : `${daysAgo} day${daysAgo !== 1 ? 's' : ''} ago`}
          </p>
        </div>
        {/* Edit button in header */}
        <button
          onClick={openEditModal}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800 border border-slate-600 text-slate-300 hover:text-white hover:border-brand-orange rounded-lg transition-colors text-sm font-medium"
        >
          <Pencil className="w-4 h-4" />
          Edit Quote
        </button>
      </div>

      {/* ─── MAIN CONTENT ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Customer Section */}
          <SpotlightCard className="p-6">
            <h2 className="text-xl font-bold text-white mb-4">Customer Information</h2>
            <div className="space-y-3">
              <div>
                <p className="text-sm text-slate-400">Name</p>
                <p className="text-white font-semibold">{quote.customerName}</p>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-slate-400" />
                <div>
                  <p className="text-sm text-slate-400">Email</p>
                  <a href={`mailto:${quote.customerEmail}`} className="text-brand-orange hover:underline">
                    {quote.customerEmail}
                  </a>
                </div>
              </div>
              {quote.customerPhone && (
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-slate-400" />
                  <div>
                    <p className="text-sm text-slate-400">Phone</p>
                    <a href={`tel:${quote.customerPhone}`} className="text-white font-semibold">
                      {quote.customerPhone}
                    </a>
                  </div>
                </div>
              )}
            </div>
          </SpotlightCard>

          {/* Design Details */}
          <SpotlightCard className="p-6">
            <h2 className="text-xl font-bold text-white mb-4">Design Details</h2>
            <div className="grid grid-cols-2 gap-4">
              {quote.designName && (
                <div>
                  <p className="text-sm text-slate-400">Design Name</p>
                  <p className="text-white font-semibold">{quote.designName}</p>
                </div>
              )}
              {quote.patchesQuantity && (
                <div>
                  <p className="text-sm text-slate-400">Quantity</p>
                  <p className="text-white font-semibold">{quote.patchesQuantity} pcs</p>
                </div>
              )}
              {quote.patchesType && (
                <div>
                  <p className="text-sm text-slate-400">Patch Type</p>
                  <p className="text-white font-semibold">{quote.patchesType}</p>
                </div>
              )}
              {quote.designSize && (
                <div>
                  <p className="text-sm text-slate-400">Size</p>
                  <p className="text-white font-semibold">{quote.designSize}</p>
                </div>
              )}
              {quote.designBacking && (
                <div>
                  <p className="text-sm text-slate-400">Backing</p>
                  <p className="text-white font-semibold">{quote.designBacking}</p>
                </div>
              )}
            </div>
            {quote.instructions && (
              <div className="mt-4">
                <p className="text-sm text-slate-400">Special Instructions</p>
                <p className="text-white bg-slate-800/50 rounded p-3 mt-2">{quote.instructions}</p>
              </div>
            )}
          </SpotlightCard>

          {/* Mockup Images */}
          {quote.mockupUrls && quote.mockupUrls.length > 0 && (
            <SpotlightCard className="p-6">
              <h2 className="text-xl font-bold text-white mb-4">Mockup Images ({quote.mockupUrls.length})</h2>
              <div className="grid grid-cols-2 gap-4">
                {quote.mockupUrls.map((url, index) => (
                  <button
                    key={index}
                    onClick={() => setPreviewUrl(url)}
                    className="relative group overflow-hidden rounded-lg border border-slate-600 hover:border-brand-orange transition-all cursor-pointer text-left"
                  >
                    <img
                      src={url}
                      alt={`Mockup ${index + 1}`}
                      className="w-full h-48 object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                      <span className="text-white text-sm font-semibold opacity-0 group-hover:opacity-100 transition-opacity">View</span>
                    </div>
                  </button>
                ))}
              </div>
            </SpotlightCard>
          )}

          {/* Customer Artwork / Attachments */}
          {quote.customerAttachmentUrls && quote.customerAttachmentUrls.length > 0 && (
            <SpotlightCard className="p-6">
              <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                <Paperclip className="w-5 h-5 text-brand-orange" />
                Customer Artwork ({quote.customerAttachmentUrls.length})
              </h2>
              <div className="grid grid-cols-2 gap-4">
                {quote.customerAttachmentUrls.map((url, index) => {
                  const isImage = /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(url.split('?')[0]);
                  return isImage ? (
                    <button
                      key={index}
                      onClick={() => setPreviewUrl(url)}
                      className="relative group overflow-hidden rounded-lg border border-slate-600 hover:border-brand-orange transition-all cursor-pointer"
                    >
                      <img
                        src={url}
                        alt={`Artwork ${index + 1}`}
                        className="w-full h-48 object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                        <span className="text-white text-sm font-semibold opacity-0 group-hover:opacity-100 transition-opacity">View</span>
                      </div>
                    </button>
                  ) : (
                    <a
                      key={index}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 p-4 rounded-lg border border-slate-600 hover:border-brand-orange bg-slate-800/50 transition-colors"
                    >
                      <Image className="w-8 h-8 text-brand-orange flex-shrink-0" />
                      <span className="text-slate-300 text-sm truncate">
                        {decodeURIComponent(url.split('/').pop()?.split('?')[0] || `Attachment ${index + 1}`).replace(/^(mockup_)?\d{10,}_/, '').replace(/^[a-f0-9-]{36}\./, '')}
                      </span>
                    </a>
                  );
                })}
              </div>
            </SpotlightCard>
          )}

          {/* Notes */}
          {quote.notes && (
            <SpotlightCard className="p-6">
              <h2 className="text-lg font-bold text-white mb-3">Internal Notes</h2>
              <p className="text-slate-300">{quote.notes}</p>
            </SpotlightCard>
          )}
        </div>

        {/* Right Column - Summary & Actions */}
        <div className="space-y-6">
          {/* Quote Summary */}
          <SpotlightCard className="p-6">
            <h2 className="text-lg font-bold text-white mb-4">Quote Summary</h2>
            <div className="space-y-3">
              <div className="flex justify-between items-center pb-3 border-b border-slate-700">
                <span className="text-slate-300">Quote ID</span>
                <span className="text-white font-mono font-bold">{quote.quoteNumber}</span>
              </div>
              <div className="flex justify-between items-center pb-3 border-b border-slate-700">
                <span className="text-slate-300">Created</span>
                <span className="text-white">{new Date(quote.createdAt).toLocaleDateString()}</span>
              </div>
              {quote.estimatedAmount ? (
                <div className="flex justify-between items-center pb-3 border-b border-slate-700">
                  <span className="text-slate-300">Quote Amount</span>
                  <span className="text-brand-orange font-bold text-lg">
                    ${quote.estimatedAmount.toLocaleString()}
                  </span>
                </div>
              ) : (
                <div className="flex justify-between items-center pb-3 border-b border-slate-700">
                  <span className="text-slate-300">Quote Amount</span>
                  <span className="text-amber-400 text-sm font-medium flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" /> Not set
                  </span>
                </div>
              )}
              <div className="flex justify-between items-center pb-3 border-b border-slate-700">
                <span className="text-slate-300">Sales Agent</span>
                <span className="text-white text-sm truncate">{quote.salesAgent}</span>
              </div>
              {quote.leadSource && (
                <div className="flex justify-between items-center">
                  <span className="text-slate-300">Lead Source</span>
                  <span className="text-white">{quote.leadSource}</span>
                </div>
              )}
            </div>
          </SpotlightCard>

          {/* Email Status + Send Button */}
          <SpotlightCard className={`p-6 border ${quote.emailSentAt ? 'bg-emerald-900/20 border-emerald-600/40' : 'bg-slate-800/50 border-slate-700'}`}>
            <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
              <MailCheck className={`w-4 h-4 ${quote.emailSentAt ? 'text-emerald-400' : 'text-slate-400'}`} />
              Quote Email
            </h3>

            {quote.emailSentAt ? (
              <div className="mb-4">
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/20 border border-emerald-500/30">
                  <MailCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                  <div>
                    <p className="text-emerald-300 text-sm font-semibold">Quote Sent</p>
                    <p className="text-emerald-400/70 text-xs">
                      {new Date(quote.emailSentAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      {' · '}
                      {new Date(quote.emailSentAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-400 mb-3">Quote email has not been sent yet.</p>
            )}

            <button
              disabled={isSendingEmail}
              onClick={async () => {
                setIsSendingEmail(true);
                try {
                  await sendQuoteEmail(quote);
                  queryClient.invalidateQueries({ queryKey: queryKeys.quotes.single(quoteNumber || '') });
                  showSuccess('Quote email sent!');
                } catch (err: any) {
                  showError('Email failed', err?.message);
                } finally {
                  setIsSendingEmail(false);
                }
              }}
              className={`w-full flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold transition-colors disabled:opacity-50
                ${quote.emailSentAt
                  ? 'bg-emerald-600/20 border border-emerald-600/50 text-emerald-300 hover:bg-emerald-600/30'
                  : 'bg-brand-orange/20 border border-brand-orange text-brand-orange hover:bg-brand-orange/30'
                }`}
            >
              <Send className="w-3.5 h-3.5" />
              {isSendingEmail ? 'Sending…' : quote.emailSentAt ? 'Resend Quote Email' : 'Send Quote Email'}
            </button>

            {/* Mark as Sent — for quotes shared via Instagram / WhatsApp / Tawk.to */}
            {!quote.emailSentAt && (
              <button
                disabled={isMarkingSent}
                onClick={async () => {
                  setIsMarkingSent(true);
                  try {
                    await markQuoteAsSent(quote.quoteNumber);
                    queryClient.invalidateQueries({ queryKey: queryKeys.quotes.single(quoteNumber || '') });
                    showSuccess('Quote marked as sent');
                  } catch (err: any) {
                    showError('Failed to mark as sent', err?.message);
                  } finally {
                    setIsMarkingSent(false);
                  }
                }}
                className="w-full flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold transition-colors disabled:opacity-50 bg-slate-700/50 border border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white mt-2"
              >
                <MailCheck className="w-3.5 h-3.5" />
                {isMarkingSent ? 'Marking…' : 'Mark as Sent (No Email)'}
              </button>
            )}
          </SpotlightCard>

          {/* Follow-up Section */}
          <SpotlightCard className="p-6 bg-slate-800/50 border border-slate-700">
            <h3 className="font-semibold text-white mb-2 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-brand-orange" />
              Follow-up Reminder
            </h3>
            <p className="text-sm text-slate-300 mb-4">
              {daysAgo === 0
                ? 'Quote created today'
                : daysAgo < 7
                ? `Follow up in ${7 - daysAgo} day${7 - daysAgo !== 1 ? 's' : ''}`
                : `⚠️ Due for follow-up (${daysAgo} days)`}
            </p>
            <a
              href={`mailto:${quote.customerEmail}?subject=Follow-up on Quote ${quote.quoteNumber}`}
              className="w-full block text-center bg-brand-orange/20 border border-brand-orange text-brand-orange hover:bg-brand-orange/30 rounded-lg py-2 text-sm font-semibold transition-colors"
            >
              Send Follow-up Email
            </a>
          </SpotlightCard>

          {/* Action Buttons */}
          <div className="space-y-3">
            <Button
              variant="primary"
              onClick={openConvertModal}
              disabled={convertingId === quote.quoteNumber}
              className="w-full shadow-lg shadow-brand-orange/20"
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              {convertingId ? 'Converting...' : 'Convert to Order'}
            </Button>

            <Button
              variant="secondary"
              onClick={handleDeleteQuote}
              disabled={deletingId === quote.quoteNumber}
              className="w-full bg-red-600/20 border border-red-600/50 text-red-400 hover:bg-red-600/30"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              {deletingId ? 'Deleting...' : 'Delete Quote'}
            </Button>
          </div>
        </div>

        {/* Meta Messenger / Instagram conversation history (only renders if quote came from Meta) */}
        <div className="mt-6">
          <MetaChatPanel quoteId={quote.id} quote={quote} />
        </div>
      </div>
    </div>
  );
};

export default QuoteDetailPage;
