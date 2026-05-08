// src/pages/QuotesPage.tsx - View all quotes with Convert to Order option

import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { getAllQuotes, convertQuoteToOrder, deleteQuote } from '../services/quoteService';
import { Quote } from '../types';
import { queryKeys } from '../constants/queryKeys';
import Button from '../components/ui/Button';
import Skeleton from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import SpotlightCard from '../components/ui/SpotlightCard';
import { Search, Plus, Calendar, ArrowRight, Trash2, CheckCircle, MailCheck, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useToast } from '../hooks/useToast';
import { detectLeadSource, getSourceBadgeClasses } from '../utils/leadSource';

const ITEMS_PER_PAGE = 15;

const QuotesPage: React.FC = () => {
  const navigate = useNavigate();
  const { success: showSuccess, error: showError } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [convertingId, setConvertingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Fetch quotes
  const { data: quotes = [], isLoading, error } = useQuery({
    queryKey: queryKeys.quotes.all(),
    queryFn: getAllQuotes,
  });

  // Filter quotes by search
  const filteredQuotes = useMemo(() => {
    if (!searchQuery.trim()) return quotes;

    const query = searchQuery.toLowerCase();
    return quotes.filter(q =>
      q.customerName.toLowerCase().includes(query) ||
      q.quoteNumber.toLowerCase().includes(query) ||
      q.customerEmail.toLowerCase().includes(query) ||
      q.customerPhone?.toLowerCase().includes(query) ||
      q.designName?.toLowerCase().includes(query)
    );
  }, [quotes, searchQuery]);

  // Pagination
  const totalPages = Math.ceil(filteredQuotes.length / ITEMS_PER_PAGE);
  const paginatedQuotes = filteredQuotes.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  // Convert quote to order
  const handleConvertToOrder = async (quote: Quote) => {
    setConvertingId(quote.id);
    try {
      const order = await convertQuoteToOrder(quote);
      showSuccess(`Quote ${quote.quoteNumber} converted to Order ${order.orderNumber}`);
      // Navigate to the new order
      navigate(`/order/${order.orderNumber}`);
    } catch (err) {
      showError(`Failed to convert quote: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setConvertingId(null);
    }
  };

  // Delete quote
  const handleDeleteQuote = async (quoteNumber: string) => {
    if (!window.confirm(`Are you sure you want to delete quote ${quoteNumber}?`)) return;

    try {
      setDeletingId(quotes.find(q => q.quoteNumber === quoteNumber)?.id || null);
      await deleteQuote(quoteNumber);
      showSuccess(`Quote ${quoteNumber} deleted`);
    } catch (err) {
      showError(`Failed to delete quote: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setDeletingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6 min-h-screen pb-10">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div><Skeleton width={150} height={36} className="mb-2" /><Skeleton width={300} height={20} /></div>
          <Skeleton width={140} height={48} className="rounded-xl" />
        </div>
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-slate-900/40 border border-white/5 rounded-xl p-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-4"><Skeleton variant="circular" width={48} height={48} /><div><Skeleton width={180} height={24} className="mb-2" /><Skeleton width={100} height={16} /></div></div>
              <Skeleton width={100} height={36} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) return <div className="text-center py-10 text-red-400">Error loading quotes</div>;

  return (
    <div className="space-y-6 min-h-screen pb-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">Quotes</h1>
          <p className="text-slate-300 text-sm mt-1">Manage and convert quote requests to orders</p>
        </div>
        <Button
          variant="primary"
          size="lg"
          onClick={() => navigate('/new-quote')}
          className="shadow-lg shadow-brand-orange/20 text-white font-semibold"
        >
          <Plus className="w-5 h-5 mr-2" />
          New Quote
        </Button>
      </div>

      {/* Search Bar */}
      <SpotlightCard className="p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Search by Quote ID, Customer Name, Email, Phone, or Design..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full bg-slate-800/50 border border-slate-600 text-white text-sm rounded-xl pl-10 pr-4 py-3 focus:ring-2 focus:ring-brand-orange/50 focus:border-brand-orange transition-all placeholder-slate-400"
          />
        </div>
      </SpotlightCard>

      {/* Quotes List */}
      <div className="space-y-3">
        <AnimatePresence>
          {paginatedQuotes.length === 0 ? (
            <EmptyState
              title="No Quotes Found"
              description={
                searchQuery
                  ? `We couldn't find any quotes matching "${searchQuery}".`
                  : "No quotes yet. Create one to get started."
              }
              action={
                !searchQuery ? (
                  <Button
                    variant="primary"
                    onClick={() => navigate('/new-quote')}
                    className="shadow-lg shadow-brand-orange/20"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Create First Quote
                  </Button>
                ) : null
              }
            />
          ) : (
            paginatedQuotes.map((quote, index) => (
              <motion.div
                key={quote.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.03 }}
              >
                <SpotlightCard
                  className="p-4 cursor-pointer hover:border-brand-orange/50 transition-colors"
                  onClick={() => navigate(`/quote/${quote.quoteNumber}`)}
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    {/* Left: Info */}
                    <div className="flex items-center gap-4 flex-1">
                      <div className="w-12 h-12 rounded-lg flex items-center justify-center text-xl font-bold bg-amber-600 text-white shadow-md">
                        {quote.customerName.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-white font-bold text-lg">
                            {quote.customerName}
                          </span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            QT-SERIES
                          </span>
                          {(() => {
                            const src = detectLeadSource({
                              attribution: quote.attribution as Record<string, any> | null,
                              leadSource: quote.leadSource,
                            });
                            return (
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getSourceBadgeClasses(src)}`}
                                title="Lead source"
                              >
                                {src}
                              </span>
                            );
                          })()}
                          {quote.emailSentAt ? (
                            <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                              <MailCheck className="w-3 h-3" />
                              Quote Sent · {new Date(quote.emailSentAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
                              <Clock className="w-3 h-3" />
                              Not Sent
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-sm text-slate-300 mt-1">
                          {quote.createdAt && (
                            <div className="flex items-center gap-1.5 text-cyan-400">
                              <Calendar className="w-3.5 h-3.5" />
                              <span className="font-medium">{new Date(quote.createdAt).toLocaleDateString()}</span>
                            </div>
                          )}
                          <span className="w-1 h-1 rounded-full bg-slate-500" />
                          <span className="font-mono font-medium text-slate-200">{quote.quoteNumber}</span>
                          <span className="w-1 h-1 rounded-full bg-slate-500" />
                          <span className="text-slate-400">
                            {[
                              quote.patchesQuantity ? `${quote.patchesQuantity} pcs` : null,
                              quote.patchesType || 'Custom',
                              quote.designName,
                            ].filter(Boolean).join(' · ')}
                          </span>
                          {/* Mockup thumbnail — key differentiator when same customer has multiple quotes */}
                          {quote.mockupUrls && quote.mockupUrls.length > 0 && (
                            <img
                              src={quote.mockupUrls[0]}
                              alt="mockup"
                              className="w-7 h-7 rounded object-cover border border-white/10 shrink-0"
                              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right: Amount & Actions */}
                    <div className="flex items-center justify-end gap-4 md:gap-6">
                      {quote.estimatedAmount && (
                        <div className="flex flex-col items-end">
                          <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold mb-1">Quote Amount</span>
                          <span className="text-white font-bold text-lg">${quote.estimatedAmount.toLocaleString()}</span>
                        </div>
                      )}

                      {/* Action Buttons */}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleConvertToOrder(quote)}
                          disabled={convertingId === quote.id}
                          className="p-2 hover:bg-green-600/20 rounded-lg transition-colors disabled:opacity-50"
                          title="Convert to Order"
                        >
                          <CheckCircle className="w-5 h-5 text-green-400" />
                        </button>

                        <button
                          onClick={() => handleDeleteQuote(quote.quoteNumber)}
                          disabled={deletingId === quote.id}
                          className="p-2 hover:bg-red-600/20 rounded-lg transition-colors disabled:opacity-50"
                          title="Delete Quote"
                        >
                          <Trash2 className="w-5 h-5 text-red-400" />
                        </button>

                        <ArrowRight className="w-5 h-5 text-slate-500" />
                      </div>
                    </div>
                  </div>
                </SpotlightCard>
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-4 pt-6">
          <Button
            variant="secondary"
            disabled={currentPage === 1}
            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
            className="bg-slate-800 border border-slate-600 text-white hover:bg-slate-700 disabled:opacity-50"
          >
            Previous
          </Button>

          <span className="text-slate-300 font-medium text-sm">
            Page <span className="text-white font-bold">{currentPage}</span> of {totalPages}
          </span>

          <Button
            variant="secondary"
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
            className="bg-slate-800 border border-slate-600 text-white hover:bg-slate-700 disabled:opacity-50"
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
};

export default QuotesPage;
