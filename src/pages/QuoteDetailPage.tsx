// src/pages/QuoteDetailPage.tsx - Quote Detail View with Follow-up

import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getQuoteByNumber, convertQuoteToOrder, deleteQuote } from '../services/quoteService';
import { queryKeys } from '../constants/queryKeys';
import Button from '../components/ui/Button';
import Skeleton from '../components/ui/Skeleton';
import SpotlightCard from '../components/ui/SpotlightCard';
import { useToast } from '../hooks/useToast';
import { ArrowLeft, CheckCircle, Trash2, Calendar, Mail, Phone } from 'lucide-react';

const QuoteDetailPage: React.FC = () => {
  const { quoteNumber } = useParams<{ quoteNumber: string }>();
  const navigate = useNavigate();
  const { success: showSuccess, error: showError } = useToast();
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: quote, isLoading, error } = useQuery({
    queryKey: queryKeys.quotes.single(quoteNumber || ''),
    queryFn: () => quoteNumber ? getQuoteByNumber(quoteNumber) : Promise.reject('No quote number'),
    enabled: !!quoteNumber,
  });

  const handleConvertToOrder = async () => {
    if (!quote) return;
    setConvertingId(quote.quoteNumber);
    try {
      const order = await convertQuoteToOrder(quote);
      showSuccess(`Quote converted to Order ${order.orderNumber}`);
      navigate(`/order/${order.orderNumber}`);
    } catch (err) {
      showError(`Failed to convert quote: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setConvertingId(null);
    }
  };

  const handleDeleteQuote = async () => {
    if (!quote) return;
    if (!window.confirm(`Are you sure you want to delete quote ${quote.quoteNumber}?`)) return;

    setDeletingId(quote.quoteNumber);
    try {
      await deleteQuote(quote.quoteNumber);
      showSuccess(`Quote ${quote.quoteNumber} deleted`);
      navigate('/quotes');
    } catch (err) {
      showError(`Failed to delete quote: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setDeletingId(null);
    }
  };

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
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/quotes')}
          className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-slate-300" />
        </button>
        <div>
          <h1 className="text-3xl font-bold text-white">Quote {quote.quoteNumber}</h1>
          <p className="text-slate-300 text-sm mt-1">
            Created {daysAgo === 0 ? 'today' : `${daysAgo} day${daysAgo !== 1 ? 's' : ''} ago`}
          </p>
        </div>
      </div>

      {/* Main Content */}
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
                  <a
                    href={`mailto:${quote.customerEmail}`}
                    className="text-brand-orange hover:underline"
                  >
                    {quote.customerEmail}
                  </a>
                </div>
              </div>
              {quote.customerPhone && (
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-slate-400" />
                  <div>
                    <p className="text-sm text-slate-400">Phone</p>
                    <a
                      href={`tel:${quote.customerPhone}`}
                      className="text-white font-semibold"
                    >
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
                  <div key={index} className="relative group">
                    <img
                      src={url}
                      alt={`Mockup ${index + 1}`}
                      className="w-full h-48 object-cover rounded-lg border border-slate-600 hover:border-brand-orange transition-colors"
                    />
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg"
                    >
                      <span className="text-white text-sm font-semibold">View Full</span>
                    </a>
                  </div>
                ))}
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
              {quote.estimatedAmount && (
                <div className="flex justify-between items-center pb-3 border-b border-slate-700">
                  <span className="text-slate-300">Quote Amount</span>
                  <span className="text-brand-orange font-bold text-lg">
                    ${quote.estimatedAmount.toLocaleString()}
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
              onClick={handleConvertToOrder}
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
      </div>
    </div>
  );
};

export default QuoteDetailPage;
