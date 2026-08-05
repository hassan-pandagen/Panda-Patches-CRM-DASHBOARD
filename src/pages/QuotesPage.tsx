// src/pages/QuotesPage.tsx — quotes list with CLADB5 Task 1: traffic filter chips (live
// counts), a heard-about filter + column, a date range, and URL-persisted filters.
// Traffic + heard_about are TS-derived from attribution/instructions, so filtering is
// client-side over the fetched date-range set (getActiveQuotesSince).

import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getActiveQuotesSince, convertQuoteToOrder, deleteQuote } from '../services/quoteService';
import { Quote } from '../types';
import Button from '../components/ui/Button';
import Skeleton from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import SpotlightCard from '../components/ui/SpotlightCard';
import { Search, Plus, Calendar, ArrowRight, Trash2, CheckCircle, MailCheck, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useToast } from '../hooks/useToast';
import {
  detectLeadSource, getSourceBadgeClasses,
  resolveTrafficGroup, resolveHeardAbout,
  TRAFFIC_GROUPS, TrafficGroup, HEARD_ABOUT_OPTIONS,
} from '../utils/leadSource';

const PAGE_SIZE = 20;
const DATE_PRESETS = [{ label: '30 days', days: 30 }, { label: '90 days', days: 90 }, { label: '1 year', days: 365 }];

// Chip label ↔ shareable URL slug (e.g. /quotes?traffic=google_ads)
const TRAFFIC_SLUG: Record<TrafficGroup, string> = {
  'Google Ads': 'google_ads', 'Google Organic': 'google_organic', 'Facebook': 'facebook',
  'Instagram': 'instagram', 'AI': 'ai', 'Direct': 'direct', 'Other': 'other',
};
const SLUG_TO_TRAFFIC: Record<string, TrafficGroup> = Object.fromEntries(
  Object.entries(TRAFFIC_SLUG).map(([g, s]) => [s, g as TrafficGroup]),
);

const QuotesPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { success: showSuccess, error: showError } = useToast();

  const [searchParams, setSearchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [dateDays, setDateDays] = useState(90);
  const [convertingId, setConvertingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const trafficFilter = searchParams.get('traffic') || 'all';   // slug | 'all'
  const heardFilter = searchParams.get('heard') || 'all';       // heard value | 'all'

  const setUrlFilter = (key: 'traffic' | 'heard', val: string) => {
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      if (!val || val === 'all') p.delete(key); else p.set(key, val);
      return p;
    }, { replace: true });
    setCurrentPage(1);
  };

  const sinceISO = useMemo(() => new Date(Date.now() - dateDays * 86400000).toISOString(), [dateDays]);
  const { data: allQuotes = [], isLoading, error } = useQuery({
    queryKey: ['active-quotes', dateDays],
    queryFn: () => getActiveQuotesSince(sinceISO),
    staleTime: 1000 * 30,
  });

  // resolve traffic group + heard-about per quote once
  const enriched = useMemo(
    () => allQuotes.map((q) => ({
      q,
      group: resolveTrafficGroup({ attribution: q.attribution as any, lead_source: q.leadSource }),
      heard: resolveHeardAbout(q.attribution as any, q.instructions),
    })),
    [allQuotes],
  );

  // search-filtered base (chips count within the current search context)
  const searched = useMemo(() => {
    const s = searchQuery.trim().toLowerCase();
    if (!s) return enriched;
    return enriched.filter(({ q }) =>
      [q.customerName, q.customerEmail, q.quoteNumber, q.customerPhone, q.designName]
        .some((f) => String(f || '').toLowerCase().includes(s)));
  }, [enriched, searchQuery]);

  const trafficCounts = useMemo(() => {
    const m = new Map<TrafficGroup, number>();
    for (const e of searched) m.set(e.group, (m.get(e.group) ?? 0) + 1);
    return m;
  }, [searched]);

  const heardValuesPresent = useMemo(() => {
    const present = new Set<string>();
    for (const e of searched) if (e.heard) present.add(e.heard);
    return HEARD_ABOUT_OPTIONS.filter((h) => present.has(h));
  }, [searched]);

  const filtered = useMemo(() => searched.filter((e) => {
    if (trafficFilter !== 'all' && e.group !== SLUG_TO_TRAFFIC[trafficFilter]) return false;
    if (heardFilter !== 'all' && e.heard !== heardFilter) return false;
    return true;
  }), [searched, trafficFilter, heardFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const handleConvertToOrder = async (quote: Quote) => {
    setConvertingId(quote.id);
    try {
      const order = await convertQuoteToOrder(quote);
      showSuccess(`Quote ${quote.quoteNumber} converted to Order ${order.orderNumber}`);
      navigate(`/order/${order.orderNumber}`);
    } catch (err) {
      showError(`Failed to convert quote: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setConvertingId(null);
    }
  };

  const handleDeleteQuote = async (quoteNumber: string) => {
    if (!window.confirm(`Are you sure you want to delete quote ${quoteNumber}?`)) return;
    try {
      setDeletingId(allQuotes.find((q) => q.quoteNumber === quoteNumber)?.id || null);
      await deleteQuote(quoteNumber);
      showSuccess(`Quote ${quoteNumber} deleted`);
      queryClient.invalidateQueries({ queryKey: ['active-quotes'] });
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

  const chipBase = 'px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors';
  const chipActive = 'bg-brand-orange/20 border-brand-orange/50 text-brand-orange';
  const chipIdle = 'bg-slate-800/60 border-white/10 text-slate-300 hover:bg-slate-700/60';

  return (
    <div className="space-y-6 min-h-screen pb-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">Quotes</h1>
          <p className="text-slate-300 text-sm mt-1">Manage and convert quote requests to orders</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg overflow-hidden border border-white/10">
            {DATE_PRESETS.map((p) => (
              <button
                key={p.days}
                onClick={() => { setDateDays(p.days); setCurrentPage(1); }}
                className={`px-3 py-2 text-xs font-semibold ${dateDays === p.days ? 'bg-brand-orange/20 text-brand-orange' : 'bg-slate-800/60 text-slate-300 hover:bg-slate-700/60'}`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <Button variant="primary" size="lg" onClick={() => navigate('/new-quote')} className="shadow-lg shadow-brand-orange/20 text-white font-semibold">
            <Plus className="w-5 h-5 mr-2" /> New Quote
          </Button>
        </div>
      </div>

      {/* Traffic chips (live counts) */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setUrlFilter('traffic', 'all')} className={`${chipBase} ${trafficFilter === 'all' ? chipActive : chipIdle}`}>
          All <span className="opacity-70">{searched.length}</span>
        </button>
        {TRAFFIC_GROUPS.map((g) => {
          const n = trafficCounts.get(g) ?? 0;
          if (n === 0 && trafficFilter !== TRAFFIC_SLUG[g]) return null;
          const active = trafficFilter === TRAFFIC_SLUG[g];
          return (
            <button key={g} onClick={() => setUrlFilter('traffic', active ? 'all' : TRAFFIC_SLUG[g])} className={`${chipBase} ${active ? chipActive : chipIdle}`}>
              {g} <span className="opacity-70">{n}</span>
            </button>
          );
        })}
      </div>

      {/* Search + heard-about filter */}
      <SpotlightCard className="p-4">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search by Quote ID, Customer Name, Email, Phone, or Design..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              className="w-full bg-slate-800/50 border border-slate-600 text-white text-sm rounded-xl pl-10 pr-4 py-3 focus:ring-2 focus:ring-brand-orange/50 focus:border-brand-orange transition-all placeholder-slate-400"
            />
          </div>
          <select
            value={heardFilter}
            onChange={(e) => setUrlFilter('heard', e.target.value)}
            className="bg-slate-800/50 border border-slate-600 text-white text-sm rounded-xl px-3 py-3 focus:ring-2 focus:ring-brand-orange/50"
            title="Filter by how the customer heard about us"
          >
            <option value="all">All “heard about”</option>
            {heardValuesPresent.map((h) => <option key={h} value={h}>{h}</option>)}
          </select>
        </div>
      </SpotlightCard>

      {/* Quotes List */}
      <div className="space-y-3">
        <AnimatePresence>
          {pageItems.length === 0 ? (
            <EmptyState
              title="No Quotes Found"
              description={searchQuery || trafficFilter !== 'all' || heardFilter !== 'all'
                ? 'No quotes match the current filters.'
                : 'No quotes yet. Create one to get started.'}
              action={!searchQuery && trafficFilter === 'all' && heardFilter === 'all' ? (
                <Button variant="primary" onClick={() => navigate('/new-quote')} className="shadow-lg shadow-brand-orange/20">
                  <Plus className="w-4 h-4 mr-2" /> Create First Quote
                </Button>
              ) : null}
            />
          ) : (
            pageItems.map(({ q: quote, heard }, index) => (
              <motion.div key={quote.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.03 }}>
                <SpotlightCard className="p-4 cursor-pointer hover:border-brand-orange/50 transition-colors" onClick={() => navigate(`/quote/${quote.quoteNumber}`)}>
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-4 flex-1">
                      <div className="w-12 h-12 rounded-lg flex items-center justify-center text-xl font-bold bg-amber-600 text-white shadow-md">
                        {quote.customerName.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-white font-bold text-lg">{quote.customerName}</span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">QT-SERIES</span>
                          {(() => {
                            const src = detectLeadSource({ attribution: quote.attribution as Record<string, any> | null, leadSource: quote.leadSource });
                            return <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getSourceBadgeClasses(src)}`} title="Lead source">{src}</span>;
                          })()}
                          {heard && (
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold border ${heard === 'ChatGPT / Claude' ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' : 'bg-slate-500/15 text-slate-300 border-slate-500/30'}`}
                              title="How they heard about us"
                            >
                              ♥ {heard}
                            </span>
                          )}
                          {quote.emailSentAt ? (
                            <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                              <MailCheck className="w-3 h-3" /> Quote Sent · {new Date(quote.emailSentAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
                              <Clock className="w-3 h-3" /> Not Sent
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
                            {[quote.patchesQuantity ? `${quote.patchesQuantity} pcs` : null, quote.patchesType || 'Custom', quote.designName].filter(Boolean).join(' · ')}
                          </span>
                          {quote.mockupUrls && quote.mockupUrls.length > 0 && (
                            <img src={quote.mockupUrls[0]} alt="mockup" className="w-7 h-7 rounded object-cover border border-white/10 shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-4 md:gap-6">
                      {quote.estimatedAmount ? (
                        <div className="flex flex-col items-end">
                          <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold mb-1">Quote Amount</span>
                          <span className="text-white font-bold text-lg">${quote.estimatedAmount.toLocaleString()}</span>
                        </div>
                      ) : null}
                      <div className="flex items-center gap-2">
                        <button onClick={(e) => { e.stopPropagation(); handleConvertToOrder(quote); }} disabled={convertingId === quote.id} className="p-2 hover:bg-green-600/20 rounded-lg transition-colors disabled:opacity-50" title="Convert to Order">
                          <CheckCircle className="w-5 h-5 text-green-400" />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); handleDeleteQuote(quote.quoteNumber); }} disabled={deletingId === quote.id} className="p-2 hover:bg-red-600/20 rounded-lg transition-colors disabled:opacity-50" title="Delete Quote">
                          <Trash2 className="w-5 h-5 text-red-400" />
                        </button>
                        <ArrowRight className="w-5 h-5 text-slate-400" />
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
          <Button variant="secondary" disabled={currentPage === 1} onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))} className="bg-slate-800 border border-slate-600 text-white hover:bg-slate-700 disabled:opacity-50">Previous</Button>
          <span className="text-slate-300 font-medium text-sm">
            Page <span className="text-white font-bold">{currentPage}</span> of {totalPages}
            <span className="text-slate-400 ml-2">({filtered.length} quotes)</span>
          </span>
          <Button variant="secondary" disabled={currentPage === totalPages} onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))} className="bg-slate-800 border border-slate-600 text-white hover:bg-slate-700 disabled:opacity-50">Next</Button>
        </div>
      )}
    </div>
  );
};

export default QuotesPage;
